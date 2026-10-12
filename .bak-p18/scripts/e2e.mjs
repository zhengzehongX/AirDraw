/**
 * Phase-3 headless gesture-UI stress test.
 *
 * Drives AirDraw the way a user would: synthetic hand frames aimed at real UI
 * rects (converge → hover dwell → pinch → release). The driver awaits real time
 * between frames so rAF, React commits and rect refreshes all happen, exactly
 * like a live session. SOAK_MS extends the run for long-session checks.
 *
 *   node scripts/e2e.mjs
 *   SOAK_MS=900000 node scripts/e2e.mjs
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { installGestureDriver, enterApp } from './gestureDriver.mjs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = (process.env.APP_URL??'http://localhost:5173/')+'?simulate=1&debug=1';
const SOAK_MS = Number(process.env.SOAK_MS ?? 0);
const SHOTS = new URL('../.e2e/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

let failures = 0;
const waits = (fn, timeout) => fn().catch(() => null);
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
// A stuck locator should fail the one check it belongs to, not hold the suite for 30s each time.
page.setDefaultTimeout(6000);
/** Tag the in-page error capture with the section that is running. */
const mark = (name) => page.evaluate((n) => { window.__mark = n; }, name);
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

// The suite exercises the studio; the first-run onboarding flow has its own test.
await page.addInitScript(() => {
  window.localStorage.setItem(
    'airdraw-preferences-v1',
    JSON.stringify({ schema: 1, tutorialDone: true, helloSeen: true }),
  );
  // This suite walks the studio surfaces, so it enters as a returning user who has
  // already calibrated; the first-run invitation has its own suite (stage5-tutorial).
  window.localStorage.setItem(
    'airdraw-pinch-calibration',
    JSON.stringify({ contact: 0.30, release: 0.37, projection: 0.30, z: 0.16, calibratedAt: '2026-10-05T00:00:00Z' }),
  );
  window.__pref = (key) => JSON.parse(window.localStorage.getItem('airdraw-preferences-v1') ?? '{}')[key];
  // A React warning tells you what happened but not from where, and "maximum update
  // depth" without a stack is not actionable. Capture the first frames at the source,
  // tagged with the section that was running, because the warning alone is useless.
  window.__errorStacks = [];
  window.__mark = 'boot';
  const error = console.error;
  console.error = (...args) => {
    const text = args.map((a) => String(a?.message ?? a)).join(' ');
    if (/Maximum update depth|Cannot update a component|unique "key"/.test(text) && window.__errorStacks.length < 6) {
      window.__errorStacks.push(`${window.__mark} @${Math.round(performance.now())}ms ${text.slice(0, 120)}\n${(new Error().stack ?? '').split('\n').slice(1, 14).join('\n')}`);
    }
    return error.apply(console, args);
  };
  // Exports are recorded rather than saved to disk: what matters here is which
  // file name and which image the app produced.
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function patched() {
    if (!this.download) return click.call(this);
    window.__downloads ??= [];
    window.__downloads.push({ name: this.download, head: this.href.slice(0, 22), bytes: this.href.length });
    window.__lastExport = this.href;
    return undefined;
  };
});
await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
// The front door is now welcome → hub → the chosen function; the camera is only asked for
// after that, so readiness here is the workspace's own objects, not a wall clock.
await waits(() => page.waitForFunction(() => !!window.__airdraw && !!window.__airdrawThree, null, { timeout: 20000 }));

// ---- install the in-page gesture driver --------------------------------------
const installDriver = (target) => target.evaluate(installGestureDriver);
await installDriver(page);
await enterApp(page);
// The opening bursts out over a second; a palm held across that hand-off is spent on the
// launch screen, so the studio would never see the gesture that summons the Dock.
await waits(() => page.waitForFunction(() => !document.querySelector('[data-testid="launch-screen"]'), null, { timeout: 15000 }));

const gestureOn = (target, fn, ...args) =>
  target.evaluate(async ([f, a]) => await window.__gesture[f](...a), [fn, args]);
const gesture = (fn, ...args) => gestureOn(page, fn, ...args);

/**
 * 一次「被界面吃掉的捏合」之后（选色、切主题、开合面板），InputRouter 要求先完全松开才允许落笔
 * （提示原文：「先完全松开，再捏合落笔」）。驱动在两次调用之间停手时，合成的手还会被引擎判丢手，
 * 而丢手本身又 suspend 一次路由。所以每次由 UI 触点转向画布之前，先连续喂一段松开帧，
 * 并等路由自己承认闸门已开。
 */
/**
 * 一次「被界面吃掉的捏合」之后（选色、切主题、开合面板），InputRouter 要求先完全松开才允许落笔
 * （提示原文：「先完全松开，再捏合落笔」）；丢手本身也会再 suspend 一次路由。
 * 关键是：等待期间必须继续喂帧。路由的 context 由 onCursor 回调决定，而那个回调只在有手的时候才跑
 * ——一旦停手，几百毫秒内引擎判丢手，context 退回 'UI'、闸门永远等不到开。
 * 所以这里在页面里一边喂「已松开」的手，一边等路由自己承认可以落笔。
 */
const awaitPenReady = async (target = page, budgetMs = 8000) =>
  target.evaluate(
    async ([budget]) => {
      const sleep = (t) => new Promise((r) => setTimeout(r, t));
      const e = window.__airdraw;
      for (let i = 0; i * 33 < budget; i += 1) {
        window.__gesture.push(0.5, 0.5, 'point');
        await sleep(33);
        const d = e.inputDiagnostic.router;
        if (d.context === 'WORKSPACE' && d.waitingForRelease === false && d.mayDraw === true) return 'ready';
      }
      return 'timeout';
    },
    [budgetMs],
  );

const strokes = () => page.evaluate(() => window.__airdraw.strokeCount);
const activeColor = () =>
  page.evaluate(
    () => document.querySelector('[data-testid^="color-"][data-active="true"]')?.getAttribute('data-testid') ?? null,
  );

/** OPEN_PALM is a toggle and the dock hides itself, so "make sure it is open" verifies instead of assuming. */
const dockOpen = () =>
  page.evaluate(() => {
    const el = document.querySelector('[data-testid="dock"]');
    const painted = el ? Number(getComputedStyle(el).opacity) : 0;
    const state = window.__airdrawApp ? window.__airdrawApp() : null;
    return { open: state ? state.dockOpen === true : painted > 0.9, painted };
  });
const ensureDock = async () => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const now = await dockOpen();
    // Only summon while the machine says it is closed: OPEN_PALM is a toggle.
    if (!now.open) await gesture('poseUntil', 'open', 'OPEN_PALM', 900);
    const settled = await page
      .waitForFunction(() => {
        const el = document.querySelector('[data-testid="dock"]');
        const painted = el ? Number(getComputedStyle(el).opacity) : 0;
        const state = window.__airdrawApp ? window.__airdrawApp() : null;
        return painted > 0.9 && (!state || state.dockOpen === true);
      }, null, { timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (settled) return;
  }
};
/**
 * Press a dock item and wait for the UI to answer. The drive from screen centre to the
 * dock can outlast the auto-hide, and a React commit at 15 detect fps is not a wall clock,
 * so a failed attempt re-summons and retries rather than reporting the timing as a defect.
 */
/** Bar menus hide their entries until opened, exactly as they do for a person. */
const MENU_HOME = { 'dock-guide': 'help-menu', 'dock-gallery': 'workspace-projects' };
const tapDock = async (selector) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await ensureDock();
    const id = (selector.match(/data-dock-item="([^"]+)"/) ?? [])[1];
    if (id && MENU_HOME[id]) {
      await gesture('click', `[data-gesture-id="${MENU_HOME[id]}"]`);
      await page.waitForTimeout(320);
    }
    if ((await gesture('click', selector)) === 'ok') return 'ok';
  }
  return 'no-press';
};
/**
 * The row shows this mode's handful of most-used tools; the rest live behind 更多.
 * Reaching one therefore means opening its panel, which is what a person does.
 */
const openMore = async () => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await ensureDock();
    if (await page.$('[data-testid="popover-more"]')) return true;
    await tapDock('[data-dock-item="dock-more"]');
    const up = await page
      .waitForSelector('[data-testid="popover-more"]', { timeout: 4000 })
      .then(() => true)
      .catch(() => false);
    if (up) return true;
  }
  return false;
};
const tapMore = async (selector) => ((await openMore()) && (await gesture('click', selector)) === 'ok' ? 'ok' : 'no-press');
/** Press a control and wait until the app has actually reflected it; a React commit is not a wall clock. */
const pressUntil = async (selector, settled, arg, timeoutMs = 5000) => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await gesture('click', selector);
    const ok = await page
      .waitForFunction(settled, arg, { timeout: timeoutMs })
      .then(() => true)
      .catch(() => false);
    if (ok) return true;
  }
  return false;
};
/** A predicate that reads the stored preference. It must be self-contained: Playwright
 *  serializes the function source, so captured Node variables would not exist in the page. */
const prefSettled = ({ key, value }) => window.__pref(key) === value;

// ---- 1. dock summon via held OPEN_PALM ---------------------------------------
await ensureDock();
await page.waitForFunction(
  () => {
    const d = document.querySelector('[data-testid="dock"]');
    return d && Number(getComputedStyle(d).opacity) > 0.9;
  },
  null,
  { timeout: 5000 },
);
check('OPEN_PALM hold summons the dock', true);

// ---- 2. twenty sequential gesture selections ---------------------------------
check('color popover opens by pinch', (await gesture('click', '[data-dock-item="dock-color"]')) === 'ok');
await waits(() => page.waitForSelector('[data-testid="popover-color"]', { timeout: 4000 }));
const colors = await page.evaluate(() =>
  [...document.querySelectorAll('[data-testid^="color-"]')].map((el) => el.getAttribute('data-testid').slice(6)),
);
let selectionsOk = 0;
const selFails = [];
for (let i = 0; i < 20; i += 1) {
  const color = colors[i % colors.length];
  const r = await gesture('click', `[data-testid="color-${color}"]`);
  const active = await page.evaluate(
    (c) => document.querySelector(`[data-testid="color-${c}"]`)?.getAttribute('data-active') === 'true',
    color,
  );
  if (active) selectionsOk += 1;
  else selFails.push(`${i}:${color}:${r}`);
  await page.waitForTimeout(500);
}
check('20 sequential gesture selections all land', selectionsOk === 20, `${selectionsOk}/20 ${selFails.slice(0, 4).join(',')}`);

// ---- 3. fast sweep with pinch held must not activate --------------------------
const beforeSweep = await activeColor();
await gesture('sweepWithPinch', '[data-testid^="color-"]', '[data-testid^="color-"]:last-of-type');
check('pinch held while sweeping does not mis-select', beforeSweep === (await activeColor()), `${beforeSweep}`);

// ---- 4. hand loss cancels pending press ----------------------------------------
await gesture('empty', 900);
// The hint is asserted by state and visibility, not by its words: the suite runs in
// both languages, and a literal would fail the moment a translation improves.
const lostBanner = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="top-status"]');
  if (!el) return { present: false, text: '', state: null, visible: false };
  const rect = el.getBoundingClientRect();
  return {
    present: true,
    text: el.innerText.trim(),
    state: el.getAttribute('data-state'),
    visible: rect.width > 0 && rect.height > 0 && Number(getComputedStyle(el).opacity) > 0.5,
  };
});
check(
  'hand loss shows the light Show-your-hand hint',
  lostBanner.present && lostBanner.state === 'lost' && lostBanner.visible && lostBanner.text.length > 0,
  JSON.stringify(lostBanner),
);
check('hand loss cancelled any pending press', await page.evaluate(() => !window.__airdrawInteraction.snapshot.pressId));
await gesture('click', `[data-testid="color-${colors[1]}"]`);
check('selection works again after recovery', (await activeColor()) === `color-${colors[1]}`, `→ ${await activeColor()}`);

// ---- 5. two hands present while selecting --------------------------------------
await gesture('click', `[data-testid="color-${colors[3]}"]`, { twoHands: true });
check('selection works with two hands in frame', (await activeColor()) === `color-${colors[3]}`);

// ---- 6. draw strokes, theme switch mid-draw -------------------------------------
await mark('6 draw + theme');
await gesture('click', '[data-dock-item="dock-color"]'); // close popover
await awaitPenReady();
await gesture('drawSweep', 1500);
await gesture('release');
const strokesAfterDraw = await strokes();
check('pinch sweep draws committed 3D strokes', strokesAfterDraw >= 1, `strokes=${strokesAfterDraw} ` + JSON.stringify(await page.evaluate(() => {
  const app = window.__airdrawApp();
  const d = window.__airdraw.inputDiagnostic;
  return { popover: app.popover, dockOpen: app.dockOpen, context: app.context, hover: d.gates.uiHovered, allow: d.gates.drawingAllowed, router: d.router, hint: d.hint };
})));
const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme);
await gesture('click', '[data-testid="theme-toggle"]');
await awaitPenReady();
await gesture('drawSweep', 900);
await gesture('release');
const themeAfter = await page.evaluate(() => document.documentElement.dataset.theme);
check('theme switches by pinch while drawing continues', themeBefore !== themeAfter && (await strokes()) > strokesAfterDraw, `${themeBefore}→${themeAfter}`);
await page.screenshot({ path: `${SHOTS}10-${themeAfter}-drawing.png` });
await gesture('click', '[data-testid="theme-toggle"]');
check('theme toggle back works', (await page.evaluate(() => document.documentElement.dataset.theme)) === themeBefore);

// ---- 7. undo / redo bursts --------------------------------------------------------
await gesture('release');
// Drawing moved the hand away, so the dock auto-hid: summon it again like a user would.
await ensureDock();
const s0 = await strokes();
/** Press a dock item and wait for the stroke count to actually move. */
const stepStack = async (item, from, direction) => {
  const target = direction < 0 ? Math.max(0, from - 1) : Math.min(40, from + 1);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // The manager keeps a global post-activation cooldown; tapping the next dock item
    // inside it silently swallows the press, which shows up as a "redo did nothing" flake.
    await page.waitForTimeout(450);
    await tapDock(item);
    const moved = await page
      .waitForFunction((n) => window.__airdraw.strokeCount === n, target, { timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (moved) break;
  }
  return strokes();
};
let s1 = s0;
for (let i = 0; i < 4 && s1 > 0; i += 1) {
  const next = await stepStack('[data-dock-item="dock-undo"]', s1, -1);
  if (next === s1) break;
  s1 = next;
}
let s2 = s1;
for (let i = 0; i < 4 && s2 < s0; i += 1) {
  const next = await stepStack('[data-dock-item="dock-redo"]', s2, +1);
  if (next === s2) break;
  s2 = next;
}
check('undo takes ink away and redo brings it back', s1 < s0 && s2 > s1 && s2 <= s0, `${s0}→${s1}→${s2}`);

// ---- 8. view mode ------------------------------------------------------------------
await mark('8 view mode');
/**
 * The hold is the product's contract (≥ `VIEW_MODE_HOLD_MS`), but the answer arrives
 * on the engine's metrics interval, which under software rasterisation is a few
 * hundred milliseconds. Waiting for the flip is stricter than sampling once: it still
 * fails when the toggle never comes, and it stops reporting the interval as a defect.
 */
const inspectSettled = (want) =>
  page
    .waitForFunction((w) => window.__airdraw.debugInternals.inspectMode === w, want, { timeout: 6000 })
    .then(() => true)
    .catch(() => false);
await gesture('poseUntil', 'victory', 'VICTORY', 900);
check('VICTORY enters view mode', await inspectSettled(true));
const camBefore = await page.evaluate(() => window.__airdrawThree.camera.position.toArray().map((v) => Math.round(v * 100) / 100));
await gesture('orbitDrag');
await page.waitForTimeout(700);
const camAfter = await page.evaluate(() => window.__airdrawThree.camera.position.toArray().map((v) => Math.round(v * 100) / 100));
check('pinch+move rotates the piece with damping', Math.abs(camAfter[0] - camBefore[0]) > 0.3, `${camBefore} → ${camAfter}`);
await gesture('poseUntil', 'victory', 'VICTORY', 900);
check('VICTORY exits view mode', await inspectSettled(false));
// Two extended fingers are what a pinch sweep passes through on the way to something
// else. A flash of that shape must not read as the intent to enter view mode, because
// entering view mode lifts the pen and the canvas then looks broken.
await gesture('gesturePose', 'victory', 220);
await gesture('release');
const flashed = await page.evaluate(() => ({
  active: document.querySelector('[data-testid="popover-more"] [data-dock-item="dock-view"]')?.getAttribute('data-active'),
  inspect: window.__airdraw.debugInternals.inspectMode,
}));
check(
  'a brief VICTORY flash does not flip the canvas into view mode',
  flashed.inspect === false && (flashed.active === 'false' || flashed.active === undefined),
  JSON.stringify(flashed),
);

// ---- 9. clear mis-tap protection -----------------------------------------------------
await awaitPenReady();
await gesture('drawSweep', 900);
await gesture('release');
await ensureDock();
const strokesBeforeClear = await strokes();
const clearRes = await tapMore('[data-dock-item="dock-clear"]');
check('clear arms a confirmation', clearRes === 'ok');
await waits(() => page.waitForSelector('[data-testid="clear-confirm"]', { timeout: 3000 }));
await gesture('click', '[data-testid="clear-cancel"]');
check('cancel keeps the artwork', (await strokes()) === strokesBeforeClear);
await tapMore('[data-dock-item="dock-clear"]');
await waits(() => page.waitForSelector('[data-testid="clear-confirm"]', { timeout: 3000 }));
const holdRes = await gesture('holdPinch', '[data-testid="clear-hold"]', 2200);
// The ring can complete on the frame after the driver lets go, so wait for the
// canvas to actually empty rather than sampling once.
await waits(() => page.waitForFunction(() => window.__airdraw.strokeCount === 0, null, { timeout: 4000 }).catch(() => {}));
const holdDiag = await page.evaluate(() => {
  const m = window.__airdrawInteraction;
  return {
    press: m.snapshot.pressId,
    hold: Number(m.snapshot.holdProgress.toFixed(2)),
    state: m.snapshot.state,
    flyout: !!document.querySelector('[data-testid="clear-hold"]'),
  };
});
check(
  'hold-to-clear removes everything after the ring completes',
  (await strokes()) === 0,
  `res=${holdRes} ${JSON.stringify(holdDiag)}`,
);
check('scene graph stays small after clear', (await page.evaluate(() => window.__airdrawThree.scene.children.length)) < 60);

// ---- 10. fist pauses input --------------------------------------------------------------
await gesture('release');
// The hold-to-confirm above ends with the router waiting for a real release before
// the pen may draw again — that is the product protecting a person from drawing with
// the same pinch that just deleted their work. Satisfy that precondition instead of
// racing it, or this check measures the race.
await gesture('gesturePose', 'open', 500);
const beforeFist = await strokes();
// The pen must be provably down before FIST can "finish" a stroke: a fixed-length
// sweep can end before the pinch detector arms, which would make this check pass or
// fail on timing rather than on the lock itself.
let penWasDown = false;
for (let i = 0; i < 6 && !penWasDown; i += 1) {
  // Poll *during* the sweep. `penDown` is only true while the pinch is held, so
  // checking after the sweep returns measures nothing but the harness's own timing.
  const sweeping = gesture('drawSweep', 1600);
  penWasDown = await page
    .waitForFunction(() => window.__airdraw.debugInternals.penDown, null, { timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  await sweeping;
  if (!penWasDown) await gesture('gesturePose', 'open', 400);
}
const penDiag = await page.evaluate(() => window.__airdraw.debugInternals);
await gesture('poseUntil', 'fist', 'FIST', 400); // locking finishes the stroke
const fistState = await page.evaluate(() => ({
  locked: window.__airdraw.debugInternals.locked,
  gesture: window.__airdraw.debugInternals.gesture,
  strokes: window.__airdraw.strokeCount,
}));
await gesture('poseUntil', 'point', 'POINT', 250);
await gesture('drawSweep', 700);
await gesture('release');
const afterResume = await strokes();
check(
  'FIST pauses: stroke finished, input locked, drawing resumes after',
  penWasDown &&
    fistState.locked === true &&
    fistState.gesture === 'FIST' &&
    fistState.strokes === beforeFist + 1 &&
    afterResume > fistState.strokes,
  `${JSON.stringify(fistState)} resume=${afterResume} pen=${penWasDown} ${JSON.stringify(penDiag)}`,
);

// ---- 11. soak -----------------------------------------------------------------------------
if (SOAK_MS > 0) {
  console.log(`soaking for ${SOAK_MS / 1000}s …`);
  const sample = async () =>
    page.evaluate(() => {
      const txt = document.querySelector('[data-testid="debug-panel"]')?.innerText ?? '';
      const num = (l) => {
        const m = txt.match(new RegExp(l + '\\s*\\n\\s*([^\\n]+)'));
        return m ? Number(m[1].trim()) : 0;
      };
      const three = window.__airdrawThree;
      return {
        geo: num('geometries'),
        calls: num('draw calls'),
        fps: num('scene fps'),
        strokes: window.__airdraw.strokeCount,
        triangles: three ? three.gl.info.render.triangles : 0,
        objects: three ? three.scene.children.length : 0,
      };
    });

  // A session is not one infinite pile-up: people write, look, clear, write again.
  // Cycling a bounded canvas is what actually exposes drift — an empty scene that
  // renders slower than it did an hour ago means a leak, not rasterizer cost.
  const CANVAS_STROKES = 24;
  const first = await sample();
  const idle = [first];
  const busy = [];
  const t0 = Date.now();
  let cycle = 0;
  while (Date.now() - t0 < SOAK_MS) {
    let drawn = 0;
    while (drawn < CANVAS_STROKES && Date.now() - t0 < SOAK_MS) {
      await gesture('drawSweep', 2500);
      await gesture('gesturePose', 'point', 500);
      drawn += 1;
    }
    busy.push(await sample());
    cycle += 1;
    await page.evaluate(() => window.__airdraw.clear());
    await page.waitForTimeout(6000);
    idle.push(await sample());
    console.log(`soak cycle ${cycle} t=${Math.round((Date.now() - t0) / 1000)}s busy=${JSON.stringify(busy[busy.length - 1])} idle=${JSON.stringify(idle[cycle])}`);
  }

  const maxBusy = busy.reduce((a, b) => (b.calls > a.calls ? b : a), busy[0]);
  const chunkBudget = 2 + Math.ceil(CANVAS_STROKES / 24) * 2 + 4;
  check('soak: draw calls stay bounded by ink chunking', maxBusy.calls <= chunkBudget, `worst ${maxBusy.calls} over ${busy.length} cycles (budget ${chunkBudget})`);
  check('soak: geometries stay bounded', busy.every((s) => s.geo <= first.geo + 6), `max ${Math.max(...busy.map((s) => s.geo))} (start ${first.geo})`);
  check('soak: scene graph does not accumulate objects', busy.every((s) => s.objects <= first.objects + 6), `max ${Math.max(...busy.map((s) => s.objects))} (start ${first.objects})`);

  const idleWorst = Math.min(...idle.slice(1).map((s) => s.fps));
  const idleLast = idle[idle.length - 1].fps;
  check('soak: empty-scene fps does not drift across the run', idleLast >= Math.max(5, idle[0].fps * 0.7), `start ${idle[0].fps} → worst ${idleWorst} → last ${idleLast}`);
  check('soak: scene keeps rendering', idleWorst > 5 && maxBusy.fps > 1, `idle worst ${idleWorst}, busy worst ${Math.min(...busy.map((s) => s.fps))}`);

  // Phase B: a user who never clears. The scene must keep growing sub-linearly —
  // the commit-time ink budget has to bite instead of paying full tessellation
  // for the hundredth stroke.
  console.log('soak phase B: pile-up without clearing …');
  const pile = [];
  for (let i = 0; i < 96; i += 1) {
    await gesture('drawSweep', 2200);
    // Lift long enough for the recapture buffer to settle, exactly as the
    // between-strokes pause does in the cycling phase.
    await gesture('gesturePose', 'point', 500);
    if ((i + 1) % 24 === 0) pile.push(await sample());
  }
  const density = pile.map((s) => s.triangles / Math.max(1, s.strokes));
  // Marginal cost is what matters: the 100th stroke must be cheaper than the 10th.
  const marginal = pile.slice(1).map((s, i) => ({
    per: (s.triangles - pile[i].triangles) / Math.max(1, s.strokes - pile[i].strokes),
    at: s.strokes,
  }));
  console.log(`soak pile-up ${JSON.stringify(pile)} tris/stroke=${density.map((v) => Math.round(v)).join(',')} marginal=${marginal.map((m) => Math.round(m.per)).join(',')}`);
  check('soak: ink budget caps marginal tessellation', marginal[marginal.length - 1].per < marginal[0].per * 0.75, `${Math.round(marginal[0].per)} → ${Math.round(marginal[marginal.length - 1].per)} tris per new stroke`);
  check('soak: pile-up still renders and batches', pile[pile.length - 1].calls <= 2 + Math.ceil(pile[pile.length - 1].strokes / 24) + 4 && pile[pile.length - 1].fps > 0, `calls ${pile[pile.length - 1].calls}, fps ${pile[pile.length - 1].fps}, strokes ${pile[pile.length - 1].strokes}`);

  await page.evaluate(() => window.__airdraw.clear());
  await page.waitForTimeout(5000);
  const settled = await sample();
  check('soak: resources return to baseline after the pile-up', settled.calls <= first.calls + 2 && settled.geo <= first.geo + 4, `calls ${first.calls}→${settled.calls}, geo ${first.geo}→${settled.geo}`);
  await page.screenshot({ path: `${SHOTS}11-soak-end.png` });
}

// ---- 12. product surfaces: guide, gallery, settings, and no leaks on re-entry
await mark('12 product surfaces');
{
  const before = await page.evaluate(() => ({
    videos: document.querySelectorAll('video.ad-camera-source').length,
    geo: Number((document.querySelector('[data-testid="debug-panel"]')?.innerText.match(/geometries\s*\n\s*(\d+)/) ?? [])[1] ?? 0),
  }));
  // In ?simulate=1 no camera is opened at all; the invariant is that re-entering
  // surfaces never adds a source element.
  check('no stray camera source elements', before.videos <= 1, 'found ' + before.videos);

  // A soak run ends by clearing the canvas, so this section has to lay down its own ink
  // before it can save, export and delete a piece.
  await awaitPenReady();
  await gesture('drawSweep', 1600);
  await gesture('release');
  await waits(() => page.waitForFunction(() => window.__airdraw.strokeCount > 0, null, { timeout: 10000 }).catch(() => {}));

  check('guide opens by pinch', (await tapDock('[data-dock-item="dock-guide"]')) === 'ok');
  await waits(() => page.waitForSelector('[data-testid="guide"]', { timeout: 6000 }));
  check('the guide lifts the pen', await page.evaluate(() => window.__airdraw.debugInternals.drawingAllowed === false));
  // The chapter rail is its own scrollport: a row can sit inside the viewport yet be
  // clipped by the rail, so "selectable" means inside the rail's own box.
  const chapter = await page.evaluate(() => {
    const nav = document.querySelector('[data-testid="guide-chapter-nav"]');
    if (!nav) return null;
    const box = nav.getBoundingClientRect();
    const current = document.querySelector('[data-testid^="guide-section-"][data-active="true"]');
    const hit = Array.from(document.querySelectorAll('[data-testid^="guide-section-"]')).find((el) => {
      const r = el.getBoundingClientRect();
      return el !== current && r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
    });
    return hit ? { id: hit.getAttribute('data-testid'), label: (hit.textContent ?? '').trim() } : null;
  });
  check(
    'guide chapters are selectable by pinch',
    chapter !== null && (await gesture('click', `[data-testid="${chapter.id}"]`)) === 'ok',
    JSON.stringify(chapter),
  );
  check(
    'guide content follows the chapter',
    await page
      .waitForFunction(
        (label) => (document.querySelector('[data-testid="guide-body"]')?.innerText ?? '').includes(label),
        chapter?.label ?? '__none__',
        { timeout: 8000 },
      )
      .then(() => true)
      .catch(() => false),
  );
  check(
    'the guide closes by pinch',
    await pressUntil('[data-testid="guide-close"]', () => !document.querySelector('[data-testid="guide"]')),
  );

  await tapMore('[data-dock-item="dock-save"]');
  check(
    'save reports Saved',
    await page
      .waitForFunction(() => /Saved/i.test(document.querySelector('[data-testid="feedback"]')?.innerText ?? ''), null, { timeout: 8000 })
      .then(() => true)
      .catch(() => false),
  );
  check(
    'gallery opens by pinch',
    (await tapDock('[data-dock-item="dock-gallery"]')) === 'ok',
  );
  await waits(() => page.waitForSelector('[data-testid="gallery"]', { timeout: 6000 }));
  const galleryState = await page.evaluate(() => ({
    cards: document.querySelectorAll('[data-testid^="gallery-card-"]').length,
    thumb: !!document.querySelector('[data-testid^="gallery-card-"] img[src^="data:image/png"]'),
    empty: !!document.querySelector('[data-testid="gallery-empty"]'),
  }));
  check(
    'saving produces a gallery card with a real thumbnail',
    galleryState.cards === 1 && galleryState.thumb,
    JSON.stringify(galleryState),
  );

  // ---- PNG backdrops and JSON import, chosen entirely by gesture ----
  const pieceId = await page.evaluate(
    () =>
      document.querySelector('[data-testid^="gallery-card-"]')?.getAttribute('data-testid')?.replace('gallery-card-', '') ?? '',
  );
  const strokesBeforeExport = await strokes();
  const exportCount = () => page.evaluate(() => (window.__downloads ?? []).length);
  const lastExport = () => page.evaluate(() => window.__downloads?.at(-1) ?? null);
  const exportSize = () =>
    page.evaluate(
      () =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => resolve(null);
          img.src = window.__lastExport;
        }),
    );
  const pressExport = async (chip) => {
    await gesture('click', `[data-testid="gallery-backdrop-${chip}"]`);
    const before = await exportCount();
    await gesture('click', `[data-testid="gallery-png-${pieceId}"]`);
    const landed = await page
      .waitForFunction((n) => (window.__downloads ?? []).length > n, before, { timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    return { ...(await lastExport()), landed };
  };

  const dayShot = await pressExport('day');
  check(
    'the PNG backdrop is a gesture-visible choice',
    dayShot.landed && /-day\.png$/.test(dayShot.name) && dayShot.head.startsWith('data:image/png;base64,'),
    `${dayShot.name} ${Math.round(dayShot.bytes / 1024)}kB landed=${dayShot.landed}`,
  );
  const daySize = await exportSize();
  check('PNG is not below canvas resolution', !!daySize && daySize.w >= 1280 && daySize.h >= 800, JSON.stringify(daySize));
  check(
    'exporting a saved piece leaves the current canvas alone',
    (await strokes()) === strokesBeforeExport,
    `${await strokes()} vs ${strokesBeforeExport}`,
  );
  const nightShot = await pressExport('night');
  const clearShot = await pressExport('none');
  check(
    'day, night and transparent really are three different images',
    /-night\.png$/.test(nightShot.name) &&
      /-transparent\.png$/.test(clearShot.name) &&
      nightShot.bytes !== dayShot.bytes &&
      clearShot.bytes !== nightShot.bytes,
    `day ${dayShot.bytes} / night ${nightShot.bytes} / none ${clearShot.bytes}`,
  );

  const cardsBeforeImport = galleryState.cards;
  await page.setInputFiles('[data-testid="gallery-import-file"]', {
    name: 'round-trip.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        title: 'Imported round trip',
        theme: 'day',
        camera: { yaw: 0, pitch: 0, distance: 13.5 },
        brush: { color: '#22d3ee', width: 8, material: 'candy' },
        strokes: [
          {
            id: 1,
            color: '#22d3ee',
            width: 8,
            material: 'candy',
            lod: 1,
            segments: [[{ x: 0.4, y: 0.4, z: 0 }, { x: 0.42, y: 0.42, z: 0 }, { x: 0.44, y: 0.4, z: 0 }]],
          },
        ],
      }),
      'utf8',
    ),
  });
  await page
    .waitForFunction(
      (n) => document.querySelectorAll('[data-testid^="gallery-card-"]').length > n,
      cardsBeforeImport,
      { timeout: 8000 },
    )
    .catch(() => {});
  await page.waitForTimeout(500);
  const imported = await page.evaluate(() => ({
    cards: document.querySelectorAll('[data-testid^="gallery-card-"]').length,
    notice: document.querySelector('[data-testid="feedback"]')?.innerText ?? '',
  }));
  check(
    'a valid JSON piece imports as a new card',
    imported.cards === cardsBeforeImport + 1 && /Imported/i.test(imported.notice),
    JSON.stringify(imported),
  );

  const cardsBeforeGarbage = imported.cards;
  await page.setInputFiles('[data-testid="gallery-import-file"]', {
    name: 'garbage.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"strokes":[{"segments":[[{"x":"nope"}]]}]}', 'utf8'),
  });
  await page.waitForTimeout(800);
  const refused = await page.evaluate(() => ({
    cards: document.querySelectorAll('[data-testid^="gallery-card-"]').length,
    notice: document.querySelector('[data-testid="feedback"]')?.innerText ?? '',
  }));
  check(
    'a file that is not a piece is refused in words',
    refused.cards === cardsBeforeGarbage && /not an AirDraw piece/i.test(refused.notice),
    JSON.stringify(refused),
  );
  // Deleting must need a held ring: a short pinch only arms the confirmation,
  // and only the armed piece is the one that leaves.
  const cardIds = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="gallery-card-"]')).map((el) =>
        el.getAttribute('data-testid').slice('gallery-card-'.length),
      ),
    );
  const beforeDelete = await cardIds();
  const victim = beforeDelete.at(-1);
  await gesture('click', `[data-testid="gallery-delete-${victim}"]`);
  await waits(() => page.waitForSelector('[data-testid="gallery-confirm"]', { timeout: 6000 }));
  await gesture('click', '[data-testid="gallery-confirm-cancel"]');
  await waits(() => page.waitForFunction(() => !document.querySelector('[data-testid="gallery-confirm"]'), null, { timeout: 6000 }));
  check(
    'delete arms a confirmation and a cancel keeps every piece',
    (await cardIds()).length === beforeDelete.length,
    `${beforeDelete.length} → ${(await cardIds()).length}`,
  );
  await gesture('click', `[data-testid="gallery-delete-${victim}"]`);
  await waits(() => page.waitForSelector('[data-testid="gallery-confirm"]', { timeout: 6000 }));
  await gesture('holdPinch', '[data-testid="gallery-confirm-hold"]', 1500);
  await page
    .waitForFunction(
      (id) => !document.querySelector(`[data-testid="gallery-card-${id}"]`),
      victim,
      { timeout: 8000 },
    )
    .catch(() => {});
  const afterDelete = await cardIds();
  check(
    'a held ring deletes exactly that one piece',
    afterDelete.length === beforeDelete.length - 1 && !afterDelete.includes(victim),
    `${beforeDelete.length} → ${afterDelete.length}`,
  );
  check(
    'the gallery closes by pinch',
    await pressUntil('[data-testid="gallery-close"]', () => !document.querySelector('[data-testid="gallery"]')),
  );

  // ---- opening a saved piece must not cost you the project you were in ----
  const guard = await page.evaluate(async () => {
    const storage = await import('/src/project/storage.ts');
    const project = window.__airdrawWorkspace.project;
    await storage.saveProject({ ...project, name: 'Guard project' });
    return { id: project.id, objects: project.objects.length };
  });
  await ensureDock();
  check('the gallery reopens for the round trip', (await tapDock('[data-dock-item="dock-gallery"]')) === 'ok');
  await waits(() => page.waitForSelector('[data-testid="gallery"]', { timeout: 6000 }));
  const [pieceToOpen] = await cardIds();
  await gesture('click', `[data-testid="gallery-open-${pieceToOpen}"]`);
  const switched = await page
    .waitForFunction((id) => window.__airdrawWorkspace.project.id !== id, guard.id, { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  check(
    'a gallery piece opens as a project of its own',
    switched && (await page.evaluate(() => window.__airdrawWorkspace.project.objects.length > 0)),
  );
  await page.waitForTimeout(2600); // past the autosave debounce that used to overwrite it
  const guardAfter = await page.evaluate(async (id) => {
    const stored = await (await import('/src/project/storage.ts')).listProjects();
    return stored.find((p) => p.id === id)?.objects.length ?? -1;
  }, guard.id);
  check(
    'opening a piece leaves the stored project alone',
    guard.objects > 0 && guardAfter === guard.objects,
    `${guard.objects} → ${guardAfter}`,
  );

  // Re-entering heavy surfaces must not accumulate anything.
  for (let i = 0; i < 3; i += 1) {
    await tapDock('[data-dock-item="dock-guide"]');
    await waits(() => page.waitForSelector('[data-testid="guide"]', { timeout: 6000 }));
    await pressUntil('[data-testid="guide-close"]', () => !document.querySelector('[data-testid="guide"]'));
  }
  const after = await page.evaluate(() => ({
    videos: document.querySelectorAll('video.ad-camera-source').length,
    geo: Number((document.querySelector('[data-testid="debug-panel"]')?.innerText.match(/geometries\s*\n\s*(\d+)/) ?? [])[1] ?? 0),
    drawingAllowed: window.__airdraw.debugInternals.drawingAllowed,
  }));
  check('re-entering the guide leaks no camera or geometry', after.videos === before.videos && after.geo <= before.geo + 2, JSON.stringify({ before, after }));
  check('the pen returns after closing a surface', after.drawingAllowed === true);

  // ---- settings: every row applies now, and survives a reload ----
  await ensureDock();
  check('settings opens by pinch', (await tapDock('[data-dock-item="dock-settings"]')) === 'ok');
  await waits(() => page.waitForSelector('[data-testid="settings"]', { timeout: 6000 }));
  check(
    'settings lifts the pen while it is open',
    await page.evaluate(() => window.__airdraw.debugInternals.drawingAllowed === false),
  );
  const handApplied = await pressUntil('[data-testid="settings-hand-Right"]', prefSettled, {
    key: 'dominantHand',
    value: 'Right',
  });
  const handChoice = await page.evaluate(() => ({
    active: document.querySelector('[data-testid="settings-hand-Right"]')?.getAttribute('data-active') === 'true',
    stored: JSON.parse(window.localStorage.getItem('airdraw-preferences-v1') ?? '{}').dominantHand,
  }));
  check(
    'a dominant-hand choice lights its chip and is persisted',
    handApplied && handChoice.active && handChoice.stored === 'Right',
    JSON.stringify({ handApplied, ...handChoice }),
  );
  await pressUntil('[data-testid="settings-hand-auto"]', prefSettled, { key: 'dominantHand', value: 'auto' });

  // The list is taller than the sheet, so a hand has to scroll it without a scrollbar
  // before the last rows are anywhere within reach.
  const devTop = () =>
    page.evaluate(() => Math.round(document.querySelector('[data-testid="settings-dev"]')?.getBoundingClientRect().top ?? 0));
  const devTopBefore = await devTop();
  for (let i = 0; i < 5 && (await devTop()) > 640; i += 1) {
    await gesture('dragVertical', '[data-testid="settings-body"]', -260, 14);
  }
  const devTopAfter = await devTop();
  check(
    'the settings list scrolls by pinch-drag until the last row is in reach',
    devTopBefore - devTopAfter > 40 && devTopAfter < 640,
    `${devTopBefore} → ${devTopAfter}`,
  );

  const devBefore = await page.evaluate(() => !!document.querySelector('[data-testid="debug-panel"]'));
  const devApplied = await pressUntil('[data-testid="settings-dev"]', prefSettled, {
    key: 'devMode',
    value: false,
  });
  const devOff = await page.evaluate(() => ({
    panel: !!document.querySelector('[data-testid="debug-panel"]'),
    stored: JSON.parse(window.localStorage.getItem('airdraw-preferences-v1') ?? '{}').devMode,
  }));
  check(
    'the developer switch changes the panel at once and remembers itself',
    devBefore && devApplied && !devOff.panel && devOff.stored === false,
    JSON.stringify({ devBefore, devApplied, ...devOff }),
  );
  const devBack = await pressUntil(
    '[data-testid="settings-dev"]',
    () =>
      JSON.parse(window.localStorage.getItem('airdraw-preferences-v1') ?? '{}').devMode === true &&
      !!document.querySelector('[data-testid="debug-panel"]'),
  );
  check('and switches back on', devBack);
  check(
    'settings closes by pinch',
    await pressUntil('[data-testid="settings-close"]', () => !document.querySelector('[data-testid="settings"]')),
  );
  await page.screenshot({ path: SHOTS + '40-surfaces-end.png' });
}

// ---- 13. first run: every lesson must be passed by actually doing it ----
const t2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
t2.setDefaultTimeout(6000);
const t2Errors = [];
t2.on('pageerror', (e) => t2Errors.push(String(e.message)));
t2.on('console', (m) => m.type() === 'error' && t2Errors.push(m.text()));
await t2.addInitScript(() => {
  window.localStorage.setItem(
    'airdraw-preferences-v1',
    JSON.stringify({ schema: 1, tutorialDone: false, helloSeen: false, theme: 'night' }),
  );
});
await t2.setViewportSize({ width: 1280, height: 800 });
await t2.goto('http://localhost:5173/?simulate=1&debug=1', { waitUntil: 'domcontentloaded' });
await t2.bringToFront();
// Install first: the scripted hand would otherwise pass lessons 1-2 by itself.
await t2.waitForFunction(() => !!window.__airdraw && !!window.__airdrawThree, null, { timeout: 25000 });
await installDriver(t2);
// 首次体验走的是同一扇前门：welcome → 大厅 → 三维绘画，门后才是 tutorial 的第一课。
await enterApp(t2);
await t2.waitForSelector('[data-testid="tutorial-coach"]', { timeout: 25000 });
const tg = async (fn, ...args) => {
  const out = await gestureOn(t2, fn, ...args);
  if (typeof out === 'string' && out !== 'ok') console.log('  driver:', fn, JSON.stringify(args), out);
  return out;
};
const stage = () => t2.evaluate(() => Number(document.querySelector('[data-testid="tutorial-coach"]')?.getAttribute('data-step') ?? -1));
const waitStage = (want, ms = 32000) =>
  t2.waitForFunction(
    (n) => Number(document.querySelector('[data-testid="tutorial-coach"]')?.getAttribute('data-step') ?? -1) >= n,
    want,
    { timeout: ms },
  );

const reached = [];
check('first run opens inside the tutorial', (await stage()) >= 0 && (await stage()) <= 2, 'stage=' + (await stage()));
await tg('gesturePose', 'point', 1400);
await waitStage(1);
reached.push(await stage());
await tg('sweepCursor');
await waitStage(2);
reached.push(await stage());
await t2.waitForSelector('[data-testid="tut-target"]', { timeout: 8000 });
await tg('click', '[data-testid="tut-target"]');
await waitStage(3);
reached.push(await stage());
await awaitPenReady(t2);
await tg('drawSweep', 2600);
await tg('release');
await waitStage(4);
reached.push(await stage());
await awaitPenReady(t2);
await tg('drawSweep', 2200);
await tg('release');
await waitStage(5);
reached.push(await stage());
await tg('poseUntil', 'open', 'OPEN_PALM', 900);
// The summon is a 700 ms hold read through the ~5 Hz metrics bus; with two WebGL pages
// starving that bus, one hold can be spent on frames the app never saw. A person holds
// the palm again, and this harness already retries presses and dock summons for the
// same starvation. The lesson itself is still asserted exactly once, below.
for (let attempt = 0; attempt < 4 && (await stage()) < 6; attempt += 1) {
  await tg('poseUntil', 'open', 'OPEN_PALM', 1200);
  await waitStage(6, 6000).catch(() => {});
}
await waitStage(6);
reached.push(await stage());
await tg('click', '[data-dock-item="dock-color"]');
await t2.waitForSelector('[data-testid="popover-color"]', { timeout: 9000 });
await tg('click', '[data-testid="color-#fb7185"]');
await waitStage(7);
reached.push(await stage());
await tg('click', '[data-dock-item="dock-size"]');
await t2.waitForSelector('[data-testid="size-slider"]', { timeout: 9000 });
await tg('dragTo', '[data-testid="size-slider"]', 0.72);
await waitStage(8);
reached.push(await stage());
await tg('click', '[data-dock-item="dock-undo"]');
await waitStage(9);
reached.push(await stage());
await tg('poseUntil', 'victory', 'VICTORY', 700);
await waitStage(10);
reached.push(await stage());
const viewOn = await t2.evaluate(() => String(window.__airdraw.debugInternals.inspectMode));
await tg('poseUntil', 'victory', 'VICTORY', 700);
await tg('poseUntil', 'point', 'POINT', 200);
await tg('click', '[data-testid="theme-toggle"]');
// The last lesson finishing unmounts the coach, so completion is the absence of it.
await t2.waitForFunction(() => !document.querySelector('[data-testid="tutorial-coach"]'), null, { timeout: 25000 });
const finished = await t2.evaluate(() => ({
  coach: !!document.querySelector('[data-testid="tutorial-coach"]'),
  prefs: JSON.parse(window.localStorage.getItem('airdraw-preferences-v1') ?? '{}'),
}));
check(
  'all eleven lessons are passed by real gestures',
  reached.length === 10 &&
  reached[9] === 10 &&
  reached.every((v, i) => v >= 1 && v <= 10 && (i === 0 || v >= reached[i - 1])) && finished.prefs.tutorialDone === true && !finished.coach,
  reached.join('→') + ' view=' + viewOn,
);
check('the tutorial ends on the canvas', await t2.evaluate(() => !!document.querySelector('[data-testid="dock-zone"]')));
check('no page errors during the first run', t2Errors.length === 0, t2Errors.slice(0, 2).join(' | '));
await t2.screenshot({ path: SHOTS + '50-tutorial-end.png' });
await t2.close();
await page.bringToFront();

const realErrors = consoleErrors.filter((e) => !e.includes('React DevTools'));
const stacks = await page.evaluate(() => window.__errorStacks ?? []);
if (stacks.length) console.log(stacks.join('\n\n'));
check('no console errors across the stress run', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
await page.screenshot({ path: `${SHOTS}12-final.png` });
await browser.close();
console.log(failures === 0 ? '\nE2E: ALL CHECKS PASSED' : `\nE2E: ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
