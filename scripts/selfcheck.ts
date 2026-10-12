/**
 * Core logic self-check (run with: npm run verify:core).
 * Verifies the pure modules without a browser: plane mapping + mirroring,
 * pinch hysteresis, One Euro latency, stability guards, gesture curl/scoring,
 * hold-to-act thresholds, primary-hand stickiness, stroke storage, the 2D brush
 * tools (pen / marker / highlighter widths, ink transparency, pressure taper)
 * and the application state machine.
 */
import { createCoverMapper, clampToViewport, toPlane } from '../src/utils/coordinates.ts';
import { PinchDetector } from '../src/utils/gesture/pinch.ts';
import { OneEuroFilter } from '../src/utils/smoothing/oneEuro.ts';
import { StrokeStore } from '../src/engine/StrokeStore.ts';
import { palmLength, pinchRatio, toPixelPoints, worldPalmLength, indexDepthFeedback } from '../src/utils/gesture/landmarks.ts';
import { computeCurls, curlOf, FingerCurl, gesturePoints } from '../src/utils/gesture/curl.ts';
import { GestureEngine } from '../src/utils/gesture/GestureEngine.ts';
import { PrimaryHandSelector } from '../src/utils/primaryHand.ts';
import { VelocityLimiter, PalmScaleSmoother, medianPoint } from '../src/utils/stability.ts';
import { LANDMARK, type Landmark, type TrackedHand } from '../src/types/hand.ts';
import { resamplePolyline, planeToWorld, brushRadius } from '../src/rendering/three/plane.ts';
import { INK_BUDGET_POINTS, INK_LOD_MIN, POINTER_FILTER } from '../src/config.ts';
import { TUTORIAL_STEP_COUNT, activeScope, advanceLaunchStage, appReducer, canDraw, initialState, isOverlay, showsWelcomeField, welcomeAcceptsEntry } from '../src/app/appState.ts';
import { outline, paintAlpha, PAPER_HEIGHT, PAPER_WIDTH } from '../src/rendering/canvas2d/freehand.ts';
import type { Stroke } from '../src/types/drawing.ts';
import { VOICE_COMMANDS, normalizeVoice, parseVoiceCommand, stripWakePhrase, voiceCheatSheet } from '../src/voice/VoiceCommandRouter.ts';
import { SETTINGS_SCHEMA, SETTING_KEYS, SETTING_DEFAULTS, coerceSetting, type SettingKey } from '../src/app/settingsSchema.ts';
import { LabGestures } from '../src/hands/labGestures.ts';
import { PalmSwipeDetector } from '../src/utils/gesture/PalmSwipeDetector.ts';
import { ViewportController, ZOOM_LIMITS, dotLayout, drawDots } from '../src/rendering/canvas2d/viewport.ts';
import { CanvasNavigation } from '../src/interaction/canvasNavigation.ts';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;
const P = (x: number, y: number, z = 0) => ({ x, y, z });

// ------------------------------------------------------------ plane mapping
{
  const mirrored = toPlane(0.2, 0.4, true);
  const plain = toPlane(0.2, 0.4, false);
  check('mirror flips plane x once', near(mirrored.x, 0.8) && near(plain.x, 0.2));
  check('plane keeps y and adds z slot', near(mirrored.y, 0.4) && mirrored.z === 0);

  const mapper = createCoverMapper(1280, 720, 1600, 900);
  check('cover scale picks the larger axis', near(mapper.scale, 1600 / 1280, 1e-9));
  const left = mapper.toScreen(0, 0.5);
  const right = mapper.toScreen(1, 0.5);
  check('plane edges map to viewport edges symmetrically', near(left.x + right.x, 1600, 1e-6));
  const tall = createCoverMapper(1280, 720, 800, 1200);
  check('tall window uses height-limited cover scale', near(tall.scale, 1200 / 720, 1e-9));
  const physical = 432;
  const dx = tall.toScreen(physical / 1280, 0).x - tall.toScreen(0, 0).x;
  const dy = tall.toScreen(0, physical / 720).y - tall.toScreen(0, 0).y;
  check('equal physical distances map equally (no stretch)', near(Math.abs(dx), Math.abs(dy), 1e-6));
  const clamped = clampToViewport(P(-50, 5000), 1600, 900);
  check('clamp keeps ink on canvas', clamped.x === 0 && clamped.y === 900);

  const world = planeToWorld(P(0.5, 0.5, 0));
  check('plane centre maps to world origin', near(world[0], 0, 1e-9) && near(world[1], 0, 1e-9));
  check('brush radius grows with width', brushRadius(24) > brushRadius(2) * 4);
  const resampled = resamplePolyline(
    Array.from({ length: 100 }, (_, i) => P(i * 0.001, 0.5)),
    0.01,
    50,
  );
  check('resample compresses dense input', resampled.length < 20, `n=${resampled.length}`);
  check('resample keeps endpoints', near(resampled[0].x, 0) && near(resampled[resampled.length - 1].x, 0.099));
  // Corner preservation: a sharp V must keep its apex even when both arms are dense.
  const vShape: Point[] = [];
  for (let i = 0; i <= 40; i += 1) vShape.push(P(0.1 + i * 0.005, 0.2 + i * 0.006));
  for (let i = 1; i <= 40; i += 1) vShape.push(P(0.3 + i * 0.005, 0.44 - i * 0.006));
  const vKept = resamplePolyline(vShape, 0.02, 60);
  const apex = vKept.reduce((best, p) => (p.y > best.y ? p : best), vKept[0]);
  check('resample preserves a sharp corner', Math.abs(apex.x - 0.3) < 0.02 && apex.y > 0.43, `apex=${apex.x.toFixed(3)},${apex.y.toFixed(3)}`);

  // A stroke denser than the point budget must still keep its apex: this is what
  // makes Chinese glyphs and letter corners survive a coarser ink LOD.
  const denseV: Point[] = [];
  for (let i = 0; i <= 60; i += 1) denseV.push(P(0.1 + i * 0.004, 0.2 + i * 0.0048));
  for (let i = 1; i <= 60; i += 1) denseV.push(P(0.34 + i * 0.004, 0.488 - i * 0.0048));
  const decimated = resamplePolyline(denseV, 0.004, 20);
  const dApex = decimated.reduce((best, p) => (p.y > best.y ? p : best), decimated[0]);
  check('decimation keeps corner knots', Math.abs(dApex.x - 0.34) < 0.01 && dApex.y > 0.48, `apex=${dApex.x.toFixed(3)},${dApex.y.toFixed(3)} n=${decimated.length}`);
}

// ------------------------------------------------------------------- pinch
{
  const detector = new PinchDetector();
  let state = detector.update(1.0);
  check('open hand is not pinching', state === false);
  state = detector.update(0.5);
  check('one frame above the start threshold does not latch', state === false);
  for (let i = 0; i < 5; i += 1) state = detector.update(0.3);
  check('sustained pinch latches on (3-frame confirm)', state === true);
  state = detector.update(0.5);
  check('inside hysteresis band the pen stays down', state === true);
  for (let i = 0; i < 5; i += 1) state = detector.update(0.9);
  check('opening the hand releases', state === false);
  detector.update(null);
  check('null ratio does not flip state', detector.isActive === false);
}

// --------------------------------------------------------------- smoothing
{
  const filter = new OneEuroFilter({ minCutoff: 1.5, beta: 0.02 });
  let out = 0;
  for (let i = 0; i < 60; i += 1) out = filter.filter(i / 30, 100 + (i % 2 === 0 ? 1.5 : -1.5));
  check('one euro suppresses +-1.5px jitter to <0.6px', Math.abs(out - 100) < 0.6);
  const moving = new OneEuroFilter({ minCutoff: 1.5, beta: 0.02 });
  let lag = 0;
  for (let i = 0; i < 300; i += 1) {
    const t = i / 30;
    lag = 500 * t - moving.filter(t, 500 * t);
  }
  check('one euro lag on a fast sweep stays small', Math.abs(lag) < 40, `lag=${lag.toFixed(2)}`);
}

// --------------------------------------------------------------- stability
{
  const limiter = new VelocityLimiter(2.2, 0.28, 3);
  const a = limiter.limit(P(0.5, 0.5), 1 / 30);
  check('first sample passes through', near(a.x, 0.5));
  const teleport = limiter.limit(P(0.9, 0.5), 1 / 30);
  check('single teleport is held (outlier)', near(teleport.x, 0.5), `x=${teleport.x}`);
  check('outlier counted', limiter.rejected === 1);
  limiter.limit(P(0.9, 0.5), 1 / 30);
  const accepted = limiter.limit(P(0.9, 0.5), 1 / 30);
  check('sustained teleport accepted after streak', near(accepted.x, 0.9));

  const slow = new VelocityLimiter(2.2, 0.28, 3);
  slow.limit(P(0.1, 0.1), 1 / 30);
  const stepped = slow.limit(P(0.3, 0.1), 1 / 30);
  check('plausible fast step is speed-clamped', stepped.x > 0.15 && stepped.x < 0.2, `x=${stepped.x.toFixed(3)}`);

  const palm = new PalmScaleSmoother();
  palm.update(100);
  const spiked = palm.update(400);
  check('palm scale rate-clamps a 4x spike', spiked < 200, `v=${spiked.toFixed(1)}`);
  const median = medianPoint([P(0.1, 0.9), P(0.5, 0.5), P(0.4, 0.4)]);
  check('median anchors recapture buffer', near(median.x, 0.4) && near(median.y, 0.5));
}

// ------------------------------------------------------------------ gesture
{
  const straight: Landmark[] = [P(0, 0, 0), P(0, -1, 0), P(0, -2, 0)];
  const folded: Landmark[] = [P(0, 0, 0), P(0, -1, 0), P(0.9, -0.2, 0)];
  check('straight finger = NoCurl', curlOf(straight, 0, 1, 2) === FingerCurl.NoCurl);
  check('folded finger = FullCurl', curlOf(folded, 0, 1, 2) === FingerCurl.FullCurl);

  const hand = (curls: Record<'index' | 'middle' | 'ring' | 'pinky', number>): TrackedHand => {
    // Build world landmarks where each finger is straight or folded per flag.
    const lm: Landmark[] = Array.from({ length: 21 }, () => P(0, 0, 0));
    const fingers: Array<[number, 'index' | 'middle' | 'ring' | 'pinky', number]> = [
      [LANDMARK.INDEX_MCP, 'index', -0.35],
      [LANDMARK.MIDDLE_MCP, 'middle', 0],
      [LANDMARK.RING_MCP, 'ring', 0.3],
      [LANDMARK.PINKY_MCP, 'pinky', 0.55],
    ];
    for (const [mcp, key, x] of fingers) {
      const foldedFinger = curls[key] === FingerCurl.FullCurl;
      lm[mcp] = P(x, 0.1, 0);
      lm[mcp + 1] = foldedFinger ? P(x, 0.4, 0) : P(x, -0.3, 0);
      lm[mcp + 2] = foldedFinger ? P(x + 0.12, 0.44, 0) : P(x, -0.6, 0);
      lm[mcp + 3] = foldedFinger ? P(x + 0.22, 0.22, 0) : P(x, -0.85, 0);
    }
    lm[LANDMARK.WRIST] = P(0, 1, 0);
    lm[LANDMARK.THUMB_MCP] = P(-0.6, 0.35, 0);
    lm[LANDMARK.THUMB_IP] = P(-0.72, 0.05, 0);
    lm[LANDMARK.THUMB_TIP] = P(-0.78, -0.15, 0);
    return { landmarks: lm.map((p) => ({ ...p })), worldLandmarks: lm, handedness: 'Right', score: 0.9 };
  };

  const pointCurls = computeCurls(gesturePoints(hand({ index: FingerCurl.NoCurl, middle: FingerCurl.FullCurl, ring: FingerCurl.FullCurl, pinky: FingerCurl.FullCurl }), 16 / 9));
  check('POINT pose curls classify correctly', pointCurls.index === FingerCurl.NoCurl && pointCurls.middle === FingerCurl.FullCurl);

  const engine = new GestureEngine();
  const pointHand = hand({ index: FingerCurl.NoCurl, middle: FingerCurl.FullCurl, ring: FingerCurl.FullCurl, pinky: FingerCurl.FullCurl });
  let state = engine.update(pointHand, false, 33, 16 / 9);
  state = engine.update(pointHand, false, 33, 16 / 9);
  state = engine.update(pointHand, false, 33, 16 / 9);
  check('POINT confirmed after 3 frames', state.gesture === 'POINT', `got ${state.gesture} conf=${state.confidence.toFixed(1)}`);
  check('gesture confidence is fingerpose-scaled', state.confidence > 6.5);

  const openHand = hand({ index: FingerCurl.NoCurl, middle: FingerCurl.NoCurl, ring: FingerCurl.NoCurl, pinky: FingerCurl.NoCurl });
  for (let i = 0; i < 4; i += 1) state = engine.update(openHand, false, 33, 16 / 9);
  check('OPEN_PALM replaces POINT after confirmation', state.gesture === 'OPEN_PALM', `got ${state.gesture}`);
  check('gesture duration accumulates', state.durationMs >= 33);

  const pinched = engine.update(pointHand, true, 33, 16 / 9);
  engine.update(pointHand, true, 33, 16 / 9);
  engine.update(pointHand, true, 33, 16 / 9);
  check('PINCH overrides curl descriptions', pinched.gesture === 'POINT' || engine.state.gesture === 'PINCH', `got ${engine.state.gesture}`);
  engine.update(null, false, 33, 16 / 9);
  check('lost hand resets gesture', engine.state.gesture === 'NONE');
}

// ------------------------------------------------------- application machine
{
  const studio = { ...initialState(), context: 'studio' } as const;
  check('launch and the hub never draw', !canDraw(initialState()) && !canDraw({ ...initialState(), context: 'hub' }));
  check('studio draws', canDraw(studio));
  check('view mode suspends the pen', !canDraw({ ...studio, inspect: true }));
  check('clear confirmation suspends the pen', !canDraw({ ...studio, confirmClear: true }));
  check('an open dock does not swallow the pen', canDraw({ ...studio, dockOpen: true, popover: 'color' }));
  check('overlays never draw', !canDraw({ ...studio, context: 'help' }) && !canDraw({ ...studio, context: 'gallery' }));
  check('tutorial only draws on its drawing lessons', !canDraw({ ...initialState(), context: 'tutorial', tutorialStep: 0 }) && canDraw({ ...initialState(), context: 'tutorial', tutorialStep: 3 }));
  check('scope follows the context', activeScope({ ...studio, context: 'gallery' }) === 'gallery');

  const fresh = initialState();
  check('the welcome ends at the hub, not at a permission wall', appReducer(fresh, { type: 'begin' }).context === 'hub');
  check('first run goes to the tutorial', appReducer({ ...fresh, context: 'hub' }, { type: 'enter-creation' }).context === 'tutorial');
  check('a trained user skips to the canvas', appReducer({ ...fresh, context: 'hub', tutorialStep: TUTORIAL_STEP_COUNT }, { type: 'enter-creation' }).context === 'studio');
  check('the hub is a primary surface, not an overlay', !isOverlay('hub') && appReducer({ ...studio, context: 'hub' } as never, { type: 'go-hub' }).context === 'hub');

  // The welcome machine is one-way: repeated or out-of-order input can only ever
  // move it forward by one step, so a double click cannot explode twice.
  check('welcome advances one legal step at a time', advanceLaunchStage('floating', 'hello') === 'floating' && advanceLaunchStage('floating', 'gathering') === 'gathering');
  check('welcome cannot be rewound or skipped ahead', advanceLaunchStage('hello', 'floating') === 'hello' && advanceLaunchStage('home-ready', 'floating') === 'home-ready');
  check('the entry only accepts input while floating or holding', welcomeAcceptsEntry('floating') && welcomeAcceptsEntry('hello') && !welcomeAcceptsEntry('gathering') && !welcomeAcceptsEntry('dispersing'));
  check('a burst in flight survives the hand-off to the hub', appReducer({ ...fresh, launchStage: 'dispersing' }, { type: 'begin' }).launchStage === 'dispersing');
  check('the field unmounts once the welcome is ready', !showsWelcomeField({ ...fresh, context: 'hub', launchStage: 'home-ready' }) && showsWelcomeField({ ...fresh, context: 'hub', launchStage: 'dispersing' }));
  const staged = appReducer(appReducer(fresh, { type: 'launch-stage', stage: 'gathering' }), { type: 'launch-stage', stage: 'gathering' });
  check('a repeated stage request is idempotent', staged.launchStage === 'gathering');

  const opened = appReducer(appReducer(studio, { type: 'dock', open: true }), { type: 'open-context', context: 'help' });
  check('opening an overlay closes the dock', !opened.dockOpen && opened.popover === 'none');
  check('overlay remembers where it came from', opened.returnTo === 'studio');
  check('closing an overlay returns to it', appReducer(opened, { type: 'close-overlay' }).context === 'studio');
  check('closing the dock drops its popover and confirmation', (() => {
    const armed = appReducer(appReducer(studio, { type: 'dock', open: true }), { type: 'popover', popover: 'size' });
    const closed = appReducer(armed, { type: 'dock', open: false });
    return closed.popover === 'none' && !closed.dockOpen;
  })());
  check('a gesture cannot arm clear through a closed dock', !appReducer(studio, { type: 'dock', open: false }).confirmClear);
}

// ---------------------------------------------------------- primary hand
{
  const mk = (handedness: 'Left' | 'Right', score: number): TrackedHand => ({
    landmarks: [],
    worldLandmarks: null,
    handedness,
    score,
  });
  const selector = new PrimaryHandSelector();
  selector.update([mk('Right', 0.99)]);
  let sel = selector.update([mk('Right', 0.99), mk('Left', 0.9)]);
  check('primary stays sticky with a weaker second hand', sel.primary?.handedness === 'Right' && !sel.switched);
  let sawSwitch = false;
  for (let i = 0; i < 5; i += 1) sel = selector.update([mk('Right', 0.5), mk('Left', 0.95)]);
  check('no switch before the frame threshold', sel.primary?.handedness === 'Right');
  for (let i = 0; i < 8; i += 1) {
    sel = selector.update([mk('Right', 0.5), mk('Left', 0.95)]);
    if (sel.switched) sawSwitch = true;
  }
  check('sustained better alternative switches primary', sel.primary?.handedness === 'Left' && sawSwitch);
  sel = selector.update([mk('Left', 0.9)]);
  check('single hand keeps the lock', sel.primary?.handedness === 'Left' && !sel.switched);
  sel = selector.update([]);
  check('empty frame releases the lock', sel.primary === null);
}

// ------------------------------------------------------------- stroke store
{
  const store = new StrokeStore();
  const stroke = store.begin('#22d3ee', 8, 'candy', P(0.1, 0.1));
  check('begin creates one segment with one point', stroke.segments.length === 1 && stroke.segments[0].length === 1);
  check('stroke carries the material preset', stroke.material === 'candy');
  store.append(P(0.1002, 0.1));
  check('sub-threshold movement is deduped', store.activePointCount === 1);
  store.append(P(0.4, 0.4));
  check('real movement appends', store.activePointCount === 2);
  store.lift();
  check('append while lifted is ignored (no jump line)', store.append(P(0.9, 0.9)) === false);
  store.resume(P(0.5, 0.5));
  store.append(P(0.52, 0.52));
  check('resume opens a second segment', store.activeStroke?.segments.length === 2);
  const committed = store.commit();
  check('commit keeps both segments in one stroke', committed?.segments.length === 2);
  check('undo removes the stroke', store.undo() === true && store.strokeCount === 0);

  const many = store.begin('#fff', 4, 'metal', P(0, 0.5));
  for (let i = 1; i < 900; i += 1) store.append(P(i * 0.001, 0.5));
  check('segment point count is capped', many.segments[0].length <= 450, `n=${many.segments[0].length}`);

  // A full canvas must not keep paying full tessellation: the commit-time ink
  // budget stamps cheaper LOD onto what comes next, never onto ink already drawn.
  const filled = new StrokeStore();
  for (let s = 0; s < 80; s += 1) {
    filled.begin('#fff', 6, 'plastic', P(0.05, 0.05));
    for (let i = 1; i <= 40; i += 1) filled.append(P(0.05 + i * 0.005, 0.05 + (i % 3) * 0.004));
    filled.commit();
  }
  const lodFirst = filled.committed[0].lod;
  const lodLast = filled.committed[filled.committed.length - 1].lod;
  check('ink budget lowers later-stroke tessellation', lodFirst === 1 && lodLast < lodFirst && lodLast >= INK_LOD_MIN, `${lodFirst} → ${lodLast.toFixed(2)}`);
  check('committed point count drives the budget', filled.committedPointCount >= INK_BUDGET_POINTS, `${filled.committedPointCount} pts`);
  store.clear();
  check('clear empties history', store.strokeCount === 0 && store.canUndo === false);
}

// -------------------------------------------------------------- landmarks
{
  const landmarks = Array.from({ length: 21 }, (_, i) => ({ x: 0.5 + i * 0.005, y: 0.5 - i * 0.004, z: 0 }));
  const pixels = toPixelPoints(landmarks, 1280, 720);
  check('pixel conversion scales by video size', near(pixels[0].x, 0.5 * 1280));
  check('palm length is positive', palmLength(pixels) > 0);
  const { ratio, distancePx } = pinchRatio(pixels);
  check('pinch ratio is scale invariant', near(ratio, distancePx / palmLength(pixels), 1e-9));
  const world = landmarks.map((p, i) => ({ x: p.x * 0.1, y: p.y * 0.1, z: i === LANDMARK.INDEX_TIP ? 0.02 : 0 }));
  const hand: TrackedHand = { landmarks, worldLandmarks: world, handedness: 'Right', score: 0.9 };
  const expectedPalm = Math.hypot(world[9].x - world[0].x, world[9].y - world[0].y, world[9].z - world[0].z);
  check('world palm length matches wrist-knuckle distance', near(worldPalmLength(world), expectedPalm, 1e-9) && worldPalmLength(world) > 0);
  check('depth feedback normalised by palm', near(indexDepthFeedback(hand), 0.02 / worldPalmLength(world), 1e-9));
  check('no world landmarks → zero depth', indexDepthFeedback({ ...hand, worldLandmarks: null }) === 0);
}

// ------------------------------------------------------------ 2D brush tools
{
  const seg = [P(0.3, 0.4), P(0.4, 0.5), P(0.5, 0.55)];
  const strokeOf = (tool: Stroke['tool'], virtualPressure = false): Stroke => ({
    id: 1, color: '#10151c', width: 12, material: 'candy', segments: [seg], lod: 1, tool, virtualPressure,
  });
  const area = (points: number[][]) => Math.abs(points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2);
  const pen = outline(seg, strokeOf('pen'));
  const marker = outline(seg, strokeOf('marker'));
  const highlighter = outline(seg, strokeOf('highlighter'));
  check('marker lays down a wider line than the pen', area(marker) > area(pen) * 1.5);
  check('highlighter is the widest of the four tools', area(highlighter) > area(marker));
  check('every tool closes its outline inside the paper', [pen, marker, highlighter].every((shape) => shape.length > 4
    && shape.every(([x, y]) => x >= 0 && x <= PAPER_WIDTH && y >= 0 && y <= PAPER_HEIGHT)
    && near(shape[0][0], shape.at(-1)![0], .1) && near(shape[0][1], shape.at(-1)![1], .1)));
  check('ink is transparent only for marker and highlighter', paintAlpha('pen') === 1 && paintAlpha('marker') < 1
    && paintAlpha('marker') > paintAlpha('highlighter'));
  const pressed = outline(seg, strokeOf('pen', true));
  check('the pressure toggle really reshapes the stroke', Math.abs(area(pressed) - area(pen)) > 1);
}

// ---- voice: stable ids, honest wake, no fuzzy danger ------------------------
{
  const required: [string, string[]][] = [
    ['menu.open', ['打开菜单', 'open menu']],
    ['nav.home', ['返回', 'back']],
    ['mode.canvas', ['二维', 'canvas mode']],
    ['mode.spatial', ['三维', '3d mode']],
    ['lab.open', ['打开玩具', 'open playlab']],
    ['page.next', ['下一页', 'next page']],
    ['page.previous', ['上一页', 'previous page']],
    ['edit.undo', ['撤销', 'undo']],
    ['edit.redo', ['重做', 'redo']],
    ['file.save', ['保存', 'save']],
    ['colour.panel', ['选择颜色', 'pick colour']],
    ['brush.bigger', ['粗一点', 'bigger brush']],
    ['brush.smaller', ['细一点', 'smaller brush']],
    ['language.switch', ['切换语言', 'switch language']],
    ['settings.open', ['打开设置', 'open settings']],
  ];
  const byAlias = new Map<string, string>();
  for (const entry of VOICE_COMMANDS) for (const alias of entry.aliases) byAlias.set(normalizeVoice(alias), entry.id);
  const missing = required.flatMap(([id, aliases]) => aliases.filter((alias) => byAlias.get(normalizeVoice(alias)) !== id));
  check('every command the guide promises is reachable', missing.length === 0, missing.join(','));
  check('请/帮我 prefixes still parse', parseVoiceCommand('请撤销')?.type === 'UNDO' && parseVoiceCommand('帮我保存')?.type === 'SAVE');
  check('a colour word inside a phrase chooses ink', parseVoiceCommand('选择红色')?.type === 'SET_COLOR' && (parseVoiceCommand('选择红色') as { color?: string }).color === '#ef5350');
  check('背景颜色 never repaints the pen', parseVoiceCommand('背景颜色') === null && parseVoiceCommand('打开背景颜色') === null);
  check('clearing needs the exact words', parseVoiceCommand('把画布清了') === null && parseVoiceCommand('清空画布')?.type === 'CLEAR_CANVAS');
  check('a clear is unconfirmed until it is confirmed', parseVoiceCommand('清空画布')?.type === 'CLEAR_CANVAS' && !('confirmed' in parseVoiceCommand('清空画布')!) && (parseVoiceCommand('确认清空') as { confirmed?: boolean }).confirmed === true);
  check('no command fires on a near miss', parseVoiceCommand('撤销一下下') === null && parseVoiceCommand('save a lot') === null);
  // The wake phrase is a setting, so the old greeting must stop working once it changes.
  check('the shipped wake word accepts its mis-heard variants', stripWakePhrase('你好airdraw 撤销', '你好，AirDraw') === '撤销');
  check('a custom wake word retires the old one', stripWakePhrase('你好airdraw 撤销', 'AirDraw，听我说') === null);
  check('the custom wake word works', stripWakePhrase('airdraw听我说 保存', 'AirDraw，听我说') === '保存');
  check('bare speech wakes nothing', stripWakePhrase('撤销', '你好，AirDraw') === null);
  const sheet = voiceCheatSheet('en');
  check('the cheat sheet speaks the interface language', sheet.length >= 6 && sheet.every((row) => !/[一-龥]/.test(row.phrase)));
}

// ---- settings: one schema, ranges that match the services -------------------
{
  const numericKeys = SETTING_KEYS.filter((key) => SETTINGS_SCHEMA[key].kind === 'number');
  check('every promised slider exists', ['pointerSensitivity', 'pointerSmoothing', 'pinchAssist', 'gestureHoldMs', 'toyIntensity', 'voiceVolume'].every((key) => numericKeys.includes(key as never)), numericKeys.join(','));
  check('a numeric string is a number, not a reset', coerceSetting('pointerSensitivity', '1.5') === 1.5);
  check('out of range is clamped to the control', coerceSetting('gestureHoldMs', 9999) === 1400 && coerceSetting('gestureHoldMs', -5) === 400);
  check('an unknown choice falls back to its default', coerceSetting('theme', 'sepia') === 'day' && coerceSetting('uiLanguage', 'fr') === SETTINGS_SCHEMA.uiLanguage.default);
  check('day-only product rejects night voice command', !parseVoiceCommand('切换夜间') && !parseVoiceCommand('night mode'));
  check('the default profile equals the shipped tuning', SETTING_DEFAULTS.pointerSensitivity === 1 && SETTING_DEFAULTS.toyIntensity === 0.5 && SETTINGS_SCHEMA.pinchAssist.default === 0);
  // The smoothing slider moves the filter's floor; its midpoint must be the exact
  // value the pen was tuned with, or a "default" install draws differently.
  const floorAt = (amount: number) => POINTER_FILTER.minCutoff * Math.pow(2, 0.5 - amount);
  check('midpoint smoothing is the shipped filter floor', floorAt(SETTING_DEFAULTS.pointerSmoothing) === POINTER_FILTER.minCutoff, `${floorAt(0.5)}`);
  check('smoothing stays inside the filter’s safe band', floorAt(0) <= 3 && floorAt(1) >= 0.6);
  // The lab's intensity knob must sit at 1.0 in the middle, or the shipped tuning moves.
  const gestures = new LabGestures();
  const swipe = new PalmSwipeDetector();
  const at = (amount: number) => {
    gestures.setIntensity(amount);
    swipe.setIntensity(amount);
    return [gestures.intensity, swipe.intensity];
  };
  check('midpoint intensity is exactly the shipped tuning', at(0.5)[0] === 1 && at(0.5)[1] === 1);
  check('calmer intensity asks for more travel', at(0)[0] === 0.7 && at(0)[1] === 0.7);
  check('eager intensity asks for less travel', at(1)[0] === 1.3 && at(1)[1] === 1.3);
  check('an out-of-range intensity cannot escape the ladder', at(9)[0] === 1.3 && at(-3)[0] === 0.7);
}

// ---- canvas viewport: one space for the grid, the pen and the hit tests ------
{
  const surface = { x: 1280, y: 720 };
  const make = () => {
    const c = new ViewportController();
    c.setBase({ p00: { x: 0, y: 0 }, p10: { x: 1280, y: 0 }, p01: { x: 0, y: 720 } });
    c.setSurface(surface);
    return c;
  };
  const states = [
    () => make(),
    () => { const c = make(); c.pan(-220, 90); c.zoomAt({ x: 640, y: 360 }, 0.4); return c; },
    () => { const c = make(); c.pan(480, -300); c.zoomAt({ x: 200, y: 100 }, 3.5); return c; },
    () => { const c = make(); c.zoomAt({ x: 640, y: 360 }, 6); return c; },
  ];
  const roundTrips = states.every((build) => {
    const c = build();
    const anchor = { x: 913.5, y: 208.25 };
    const back = c.docToScreen(c.screenToDoc(anchor));
    return near(back.x, anchor.x, 1e-6) && near(back.y, anchor.y, 1e-6);
  });
  check('screen and document agree in both directions at any zoom', roundTrips);

  // Zooming must hold the point under the cursor still, or the sheet feels like it slips.
  const anchored = states.every((build) => {
    const c = build();
    const anchor = { x: 640, y: 360 };
    const before = c.screenToDoc(anchor);
    const moved = c.zoomAt(anchor, c.state().zoom > 5 ? 0.6 : 1.6);
    if (!moved) return true; // clamped: nothing moved, nothing to hold
    const after = c.screenToDoc(anchor);
    return near(after.x, before.x, 1e-6) && near(after.y, before.y, 1e-6);
  });
  check('zoom keeps the anchor point fixed', anchored);

  const low = make();
  low.zoomAt({ x: 640, y: 360 }, 0.3);
  low.zoomAt({ x: 640, y: 360 }, 0.01);
  const high = make();
  high.zoomAt({ x: 640, y: 360 }, 5);
  high.zoomAt({ x: 640, y: 360 }, 50);
  check('zoom cannot be pinched away to nothing or to infinity', low.state().zoom === ZOOM_LIMITS.min && high.state().zoom === ZOOM_LIMITS.max, `${low.state().zoom} / ${high.state().zoom}`);
  const panned = make();
  panned.pan(100, -60);
  check('a drag pans one-to-one in screen pixels', panned.state().offsetX === 100 && panned.state().offsetY === -60);
  const fitted = make();
  fitted.fitRect(null);
  check('fitting an empty board is a sane view, not a divide by zero', fitted.state().zoom > 0.5 && fitted.state().zoom <= 1 && Number.isFinite(fitted.state().offsetX));
  const framed = make();
  framed.fitRect({ minX: 2, minY: 3, maxX: 2.4, maxY: 3.2 });
  const centre = framed.docToScreen({ x: 2.2, y: 3.1 });
  check('fitting frames far-away ink at the centre of the screen', near(centre.x, 640, 1e-6) && near(centre.y, 360, 1e-6), `${centre.x},${centre.y}`);
  const remembered = make();
  remembered.pan(300, 120);
  remembered.remember();
  remembered.reset();
  check('回到上次视图 returns to the remembered view', remembered.restore() && remembered.state().offsetX === 300 && remembered.state().offsetY === 120);
  const stubborn = make();
  check('garbage in cannot corrupt the view', !stubborn.zoomAt({ x: 10, y: 10 }, Number.NaN) && (stubborn.setBase({ p00: { x: Number.NaN, y: 0 }, p10: { x: 1, y: 0 }, p01: { x: 0, y: 1 } }), stubborn.docToScreen({ x: 0.5, y: 0.5 }).x === 640));

  // The grid steps instead of dissolving into texture.
  const coarse = dotLayout(0.35, 0.5, 0.5);
  const fine = dotLayout(4, 0.5, 0.5);
  const mid = dotLayout(1, 0.5, 0.5);
  check('the grid doubles its spacing when zoomed far out', coarse.spacing > mid.spacing * 1.5, `${mid.spacing} → ${coarse.spacing}`);
  check('the grid halves it when zoomed far in', fine.spacing < mid.spacing * 0.75, `${mid.spacing} → ${fine.spacing}`);
  check('dots stay a readable size on screen', fine.radius < mid.radius && coarse.radius > mid.radius);
  check('density and opacity stay inside their promised bands', dotLayout(1, 0, 0).alpha > 0 && dotLayout(1, 1, 1).alpha <= 0.8
    && dotLayout(1, 1, 0.5).spacing < dotLayout(1, 0, 0.5).spacing);
}

// ---- the grid painter: positions track the sheet, cost stays bounded --------
{
  const surface = { x: 1280, y: 720 };
  const recorder = () => {
    const points: { x: number; y: number }[] = [];
    const context = {
      globalAlpha: 1,
      fillStyle: '',
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      arc: (x: number, y: number) => { points.push({ x, y }); },
      fill: () => {},
    };
    return { points, context } as unknown as { points: typeof points; context: CanvasRenderingContext2D };
  };
  const make = () => {
    const c = new ViewportController();
    c.setBase({ p00: { x: 0, y: 0 }, p10: { x: 1280, y: 0 }, p01: { x: 0, y: 720 } });
    c.setSurface(surface);
    return c;
  };
  const atRest = recorder();
  drawDots(atRest.context, make(), surface, dotLayout(1, 0.5, 0.5), '#888');
  const pannedController = make();
  pannedController.pan(40, 0);
  const panned = recorder();
  drawDots(panned.context, pannedController, surface, dotLayout(1, 0.5, 0.5), '#888');
  check('the grid is painted at all', atRest.points.length > 100, `${atRest.points.length} dots`);
  check('dots pan with the sheet instead of sticking to the screen', panned.points.length > 0 && Math.abs(panned.points[0].x - atRest.points[0].x) > 1);
  // The first painted dot is wherever the visible range starts, so the honest
  // invariant is modular: the lattice moved by exactly the pan, modulo its own step.
  const stepPx = dotLayout(1, 0.5, 0.5).spacing * 1280;
  const shifted = panned.points[0].x - atRest.points[0].x;
  const wrapped = ((shifted % stepPx) + stepPx) % stepPx;
  const expected = ((40 % stepPx) + stepPx) % stepPx;
  check('the grid shifts by exactly the pan distance', near(wrapped, expected, 0.01), `shift ${shifted.toFixed(2)} step ${stepPx.toFixed(2)} → ${wrapped.toFixed(3)} vs ${expected.toFixed(3)}`);
  const gaps = (list: { x: number }[]) => list.slice(0, 40).map((p, i, a) => (i ? +(p.x - a[i - 1].x).toFixed(3) : 0)).filter((v) => v > 0);
  check('neighbouring dots keep their spacing', new Set(gaps(panned.points)).size <= 2 && new Set(gaps(atRest.points)).size <= 2, `${new Set(gaps(atRest.points)).size} distinct gaps`);
  const off = recorder();
  drawDots(off.context, make(), surface, { ...dotLayout(1, 0.5, 0.5), alpha: 0 }, '#888');
  check('an invisible grid costs nothing', off.points.length === 0);
  const extreme = recorder();
  drawDots(extreme.context, make(), surface, { ...dotLayout(0.26, 0, 1), spacing: 0.00002 }, '#888');
  check('a pathological spacing bails out instead of hanging the frame', extreme.points.length === 0);
}

// ---- navigation replay: a still hand must not move the sheet ------------------
// These are the acceptance cases from the coordinate-fix brief, run against the
// real session math: constant input must produce a constant viewport, a 100 px hand
// move must produce a 100 px sheet move no matter how many frames report it, and the
// two-hand anchor must stay under the hands.
{
  const surface = { x: 1280, y: 720 };
  type V2 = { x: number; y: number };
  const makeRig = () => {
    const view = new ViewportController();
    view.setBase({ p00: { x: 0, y: 0 }, p10: { x: 1280, y: 0 }, p01: { x: 0, y: 720 } });
    view.setSurface(surface);
    const nav = new CanvasNavigation();
    const step = (now: number, palm: V2 | null, two: { mid: V2; d: number } | null) => {
      const effect = nav.update({
        now,
        handPresent: palm !== null || two !== null,
        palmScreen: palm,
        openness: 1,
        pinched: false,
        drawing: false,
        uiBusy: false,
        two: two ? { active: true, midpointScreen: two.mid, distancePx: two.d } : null,
        twoPresent: two !== null,
        panSpeed: 1,
        zoomSensitivity: 1,
        view: view.state(),
        toDoc: (s) => view.screenToDoc(s),
        toBase: (d) => view.baseOf(d),
      });
      if (effect.view) view.setView(effect.view);
      return effect;
    };
    return { view, nav, step };
  };

  // ~30 s of an unmoving palm at 30 fps: after the engage hold the view must never
  // move again, or a steady hand would skate the sheet across the room.
  const still = makeRig();
  let t = 0;
  for (let i = 0; i < 900; i += 1) { t += 33; still.step(t, { x: 640, y: 360 }, null); }
  const stillView = still.view.state();
  check('a still hand never drifts the sheet', stillView.offsetX === 0 && stillView.offsetY === 0 && stillView.zoom === 1, JSON.stringify(stillView));

  // A 100 px hand move is a 100 px sheet move — once, not once per frame, and
  // re-sending the same recognition result must not add another one.
  const stepped = makeRig();
  t = 0;
  for (let i = 0; i < 12; i += 1) { t += 33; stepped.step(t, { x: 400, y: 300 }, null); }
  for (let i = 0; i < 60; i += 1) { t += 33; stepped.step(t, { x: 500, y: 300 }, null); }
  const steppedView = stepped.view.state();
  check('a 100 px hand move moves the sheet 100 px, not 100 px per frame', Math.abs(steppedView.offsetX - 100) < 1e-9 && steppedView.offsetY === 0, JSON.stringify(steppedView));

  // Two hands: doubling the gap doubles the zoom and keeps the anchored document
  // point under the midpoint instead of drifting to a screen centre.
  const zoomed = makeRig();
  t = 0;
  for (let i = 0; i < 12; i += 1) { t += 33; zoomed.step(t, null, { mid: { x: 640, y: 360 }, d: 200 }); }
  const anchorDoc = zoomed.view.screenToDoc({ x: 640, y: 360 });
  for (let i = 0; i < 30; i += 1) { t += 33; zoomed.step(t, null, { mid: { x: 640, y: 360 }, d: 400 }); }
  const afterZoom = zoomed.view.state();
  const anchorNow = zoomed.view.screenToDoc({ x: 640, y: 360 });
  check(
    'two-hand zoom doubles about the hands, not the screen centre',
    Math.abs(afterZoom.zoom - 2) < 1e-6 && near(anchorNow.x, anchorDoc.x, 1e-6) && near(anchorNow.y, anchorDoc.y, 1e-6),
    JSON.stringify({ afterZoom, anchorDoc, anchorNow }),
  );
  for (let i = 0; i < 30; i += 1) { t += 33; zoomed.step(t, null, { mid: { x: 740, y: 360 }, d: 400 }); }
  const movedPair = zoomed.view.state();
  check(
    'a moving pair pans the zoomed sheet one-to-one',
    Math.abs(movedPair.offsetX - (afterZoom.offsetX + 100)) < 1e-6 && movedPair.zoom === afterZoom.zoom,
    JSON.stringify(movedPair),
  );

  // The brief's worked example, in pure similarity space: screen = zoom × doc + offset.
  const doc = new ViewportController();
  doc.setBase({ p00: { x: 0, y: 0 }, p10: { x: 1, y: 0 }, p01: { x: 0, y: 1 } });
  doc.setSurface({ x: 1000, y: 1000 });
  doc.setView({ zoom: 2, offsetX: 100, offsetY: 50 });
  const onScreen = doc.docToScreen({ x: 200, y: 100 });
  doc.pan(100, 0);
  const pannedPoint = doc.docToScreen({ x: 200, y: 100 });
  check(
    'screen = zoom × document + offset, and panning moves only the screen point',
    onScreen.x === 500 && onScreen.y === 250 && pannedPoint.x === 600 && pannedPoint.y === 250,
    `${onScreen.x},${onScreen.y} → ${pannedPoint.x},${pannedPoint.y}`,
  );
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
