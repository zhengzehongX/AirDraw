/**
 * Phase-16 coordinate-chain regression.
 *
 * The contract: the aimed fingertip, the pointer the app draws, the contact point that
 * starts a stroke, and the ink that is finally painted are the same place on screen —
 * within 4 CSS px — whatever the window shape, the chrome occupying part of it, the
 * canvas camera, the mirroring or the acting hand.
 *
 * Each mode is measured by the mapping its own renderer uses: the dot canvas paints
 * where `docToInk` says, spatial ink is placed by the live camera ray, so the test asks
 * the camera too. Reading the other mapping would measure a transform that renderer
 * never applies.
 *
 * Run: APP_URL=http://localhost:5173/ node scripts/phase16-coordinates-e2e.mjs
 */
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { installGestureDriver, enterApp } from './gestureDriver.mjs';

const TOLERANCE_PX = 4;
const url = process.env.APP_URL ?? 'http://localhost:5173/';
const results = [];
const errors = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`, detail ?? '');
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});

const query = (extra) => `${url}?simulate=1&debug=1${extra ?? ''}`;

/** One page per (viewport, mirror, hand) so a stale layout can never flatter the next case. */
const openApp = async ({ width, height, mirror = 1, hand = 'Right' }) => {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', (e) => errors.push(`${width}x${height}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${width}x${height}: ${m.text()}`); });
  await page.addInitScript(
    ([dominantHand]) => {
      localStorage.setItem('airdraw-preferences-v1', JSON.stringify({ schema: 1, tutorialDone: true, helloSeen: true, dominantHand }));
      localStorage.setItem('airdraw-pinch-calibration', JSON.stringify({ contact: 0.3, release: 0.37, projection: 0.3, z: 0.16, calibratedAt: '2026-10-05T00:00:00Z' }));
    },
    [hand],
  );
  await page.goto(query(`&mirror=${mirror}`));
  await page.evaluate(installGestureDriver);
  await enterApp(page);
  return page;
};

const gesture = (page, name, ...args) => page.evaluate(async ([n, a]) => window.__gesture[n](...a), [name, args]);

const frameInfo = (page) => page.evaluate(() => {
  const rect = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }; };
  return {
    window: { w: innerWidth, h: innerHeight },
    mode: window.__airdraw.workspaceMode,
    surface: rect('[data-testid="drawing-surface"]'),
    bar: rect('[data-testid="workspace-bar"]'),
    rail: rect('[data-testid="workspace-rail"]'),
    dockTop: Math.min(rect('[data-testid="dock-zone"]')?.top ?? innerHeight, rect('[data-testid="dock"]')?.top ?? innerHeight, rect('[data-testid="minimap"]')?.top ?? innerHeight),
    railOpen: document.querySelector('[data-testid="workspace-rail"]')?.dataset.open === 'true',
  };
});

/** Plane coordinates of a window pixel, using the engine's own mapping (as the hand does). */
const planeOf = (page, sx, sy) => page.evaluate(([x, y]) => {
  const e = window.__airdraw;
  const p00 = e.toScreenPoint({ x: 0, y: 0, z: 0 });
  const p10 = e.toScreenPoint({ x: 1, y: 0, z: 0 });
  const p01 = e.toScreenPoint({ x: 0, y: 1, z: 0 });
  return { u: (x - p00.x) / (p10.x - p00.x), v: (y - p00.y) / (p01.y - p00.y) };
}, [sx, sy]);

/**
 * A left hand, aimed the same way the driver aims a right one: the driver hard-codes
 * `handedness:'Right'`, so this is the only honest way to put a left hand in front of
 * the selector. The tip offset (-0.12,-0.15) is the driver's own pose constant.
 */
const pushLeftHand = (page, u, v, mode) => page.evaluate(([uu, vv, m]) => {
  const hand = window.__gesture.makeHand(1 - uu + 0.12, vv + 0.15, m);
  hand.handedness = 'Left';
  hand.score = 0.99;
  window.__airdraw.handleResult({ hands: [hand], timestamp: performance.now(), inferenceMs: 0.4, videoWidth: 1280, videoHeight: 720, source: 'synthetic' });
}, [u, v, mode]);

/** Wait for the pointer to arrive; a pointer that stops elsewhere is the finding. */
const aimAt = async (page, tx, ty, push) => {
  const plane = await planeOf(page, tx, ty);
  let last = null;
  let still = 0;
  let cursor = { x: 0, y: 0 };
  for (let i = 0; i < 70; i += 1) {
    await push(plane.u, plane.v, 'point');
    await page.waitForTimeout(45);
    cursor = await page.evaluate(() => ({ ...window.__airdrawInteraction.snapshot.cursor }));
    if (Math.hypot(cursor.x - tx, cursor.y - ty) <= TOLERANCE_PX) return { plane, cursor, converged: true };
    still = last && Math.abs(cursor.x - last.x) < 0.4 && Math.abs(cursor.y - last.y) < 0.4 ? still + 1 : 0;
    last = cursor;
    if (still >= 8) return { plane, cursor, converged: false };
  }
  return { plane, cursor, converged: false };
};
/** Press, draw a short tick, and report where the ink actually is, in screen pixels. */
const drawAndMeasure = async (page, plane, push) => {
  // SwiftShader can starve the driver's own timer past the engine's staleness guard, so
  // wait for the hand to be the acting hand before judging anything it does next.
  for (let i = 0; i < 40; i += 1) {
    await push(plane.u, plane.v, 'point');
    await page.waitForTimeout(40);
    if (await page.evaluate(() => !!window.__airdraw.tracking.primary)) break;
  }
  const before = await page.evaluate(() => window.__airdraw.getCommitted().length);
  await push(plane.u, plane.v, 'point');
  await page.waitForTimeout(120);
  await push(plane.u, plane.v, 'pinch');
  let press = null;
  for (let i = 0; i < 45; i += 1) {
    await push(plane.u, plane.v, 'pinch');
    await page.waitForTimeout(40);
    const sample = await page.evaluate(() => ({ cursor: { ...window.__airdrawInteraction.snapshot.cursor }, pen: window.__airdraw.debugInternals.penDown }));
    if (sample.pen) { press = sample.cursor; break; }
  }
  for (let i = 1; i <= 5; i += 1) {
    await push(plane.u, plane.v + i * 0.012, 'pinch');
    await page.waitForTimeout(40);
  }
  await push(plane.u, plane.v + 0.06, 'open');
  // The ring can complete on the frame after the driver lets go, so wait for the commit
  // itself instead of sampling a wall clock.
  for (let i = 0; i < 60; i += 1) {
    await push(plane.u, plane.v + 0.06, 'open');
    await page.waitForTimeout(40);
    if (await page.evaluate(([n]) => window.__airdraw.getCommitted().length > n, [before])) break;
  }
  if (!press) {
    const why = await page.evaluate(() => { const d = window.__airdraw.inputDiagnostic; return { hint: d.hint, contact: d.contact?.state, router: d.router }; });
    return { press: null, ink: null, why };
  }
  const ink = await page.evaluate(() => {
    const e = window.__airdraw;
    const list = e.getCommitted();
    const last = list[list.length - 1];
    if (!last) return null;
    const first = last.segments[0][0];
    if (e.workspaceMode === 'CANVAS_DRAW') {
      // The dot canvas paints in its own buffer: screen pixels minus the buffer origin.
      const ink2 = e.docToInk(first);
      const area = document.querySelector('[data-testid="drawing-surface"]')?.getBoundingClientRect();
      return { x: ink2.x + (area?.left ?? 0), y: ink2.y + (area?.top ?? 0) };
    }
    // Spatial ink is placed by the camera; project the stored point the same way.
    const state = window.__airdrawThree;
    if (!state?.camera || !state.size) return null;
    const cam = state.camera;
    const world = { x: (first.x - 0.5) * 16, y: (0.5 - first.y) * 9, z: first.z * 0.35 };
    const mul = (m, vec) => { const out = [0, 0, 0, 0]; for (let r = 0; r < 4; r += 1) out[r] = m[r] * vec[0] + m[4 + r] * vec[1] + m[8 + r] * vec[2] + m[12 + r] * vec[3]; return out; };
    const view = mul(cam.matrixWorldInverse.elements, [world.x, world.y, world.z, 1]);
    const clip = mul(cam.projectionMatrix.elements, view);
    if (!clip[3]) return null;
    return { x: ((clip[0] / clip[3] + 1) / 2) * state.size.width, y: ((1 - clip[1] / clip[3]) / 2) * state.size.height };
  });
  if (!ink) {
    // A stroke that never committed is a different finding from a stroke in the wrong
    // place, so say which store was empty and what the gates reported.
    const why = await page.evaluate(() => {
      const e = window.__airdraw;
      return { mode: e.workspaceMode, committed: e.getCommitted().length, canvas: e.rawStrokesFor('CANVAS_DRAW').length, spatial: e.rawStrokesFor('SPATIAL_DRAW').length, hint: e.inputDiagnostic.hint, scene: !!window.__airdrawThree?.camera };
    });
    return { press, ink: null, why };
  }
  return { press, ink };
};

/**
 * Five points inside the part of the window that can actually receive ink. The bar, the
 * property rail and the tool row are deliberately left out: the pen lifts over a control
 * on purpose, so aiming there would assert against the product instead of the mapping.
 */
const boardPoints = (frame) => {
  const w = frame.window.w;
  const h = frame.window.h;
  const left = 28;
  const right = Math.max(left + 120, (frame.rail?.left ?? w) - 28);
  const top = (frame.bar?.height ?? 0) + 28;
  const dock = frame.dockTop ?? h;
  const bottom = Math.max(top + 120, dock - 28);
  const insetX = Math.round((right - left) * 0.12);
  const insetY = Math.round((bottom - top) * 0.12);
  const at = (x, y, label) => ({ x: Math.round(x), y: Math.round(y), label });
  return [
    at((left + right) / 2, (top + bottom) / 2, 'centre'),
    at(left + insetX, top + insetY, 'upper-left'),
    at(right - insetX, top + insetY, 'upper-right'),
    at(left + insetX, bottom - insetY, 'lower-left'),
    at(right - insetX, bottom - insetY, 'lower-right'),
  ];
};

/** One full sweep of points in the current mode/chrome, asserted as a single case. */
const sweep = async (page, caseName, points, opts = {}) => {
  const { hand = 'Right', mirror = true } = opts;
  const push = hand === 'Left'
    ? async (u, v, mode) => { await pushLeftHand(page, u, v, mode); }
    // The driver aims a mirrored hand (`tip = 1 - u`); with mirroring off, plane space
    // *is* video space, so the same pose is reached by asking for the opposite u.
    : mirror
      ? async (u, v, mode) => { await gesture(page, 'push', u, v, mode); }
      : async (u, v, mode) => { await gesture(page, 'push', 1 - u, v, mode); };
  const rows = [];
  for (const point of points) {
    const aimed = await aimAt(page, point.x, point.y, push);
    // The pen lifts over a control on purpose, so such a point is recorded as chrome and
    // not drawn: measuring ink there would assert against the product. The drawable-count
    // check below is what stops this from quietly degenerating to a single point.
    const overTarget = await page.evaluate(() => window.__airdrawInteraction.snapshot.overTarget === true);
    if (overTarget) {
      rows.push({
        label: point.label,
        target: { x: point.x, y: point.y },
        pointerError: { x: Math.round(aimed.cursor.x) - point.x, y: Math.round(aimed.cursor.y) - point.y },
        converged: aimed.converged,
        overTarget: true,
      });
      continue;
    }
    const drawn = await drawAndMeasure(page, aimed.plane, push);
    await page.evaluate(() => window.__airdraw.undo());
    await page.waitForTimeout(140);
    rows.push({
      label: point.label,
      target: { x: point.x, y: point.y },
      overTarget: false,
      pointerError: { x: Math.round(aimed.cursor.x) - point.x, y: Math.round(aimed.cursor.y) - point.y },
      converged: aimed.converged,
      press: drawn.press ? { x: Math.round(drawn.press.x), y: Math.round(drawn.press.y) } : null,
      ink: drawn.ink ? { x: Math.round(drawn.ink.x), y: Math.round(drawn.ink.y) } : null,
      inkError: drawn.ink && drawn.press ? { x: Math.round(drawn.ink.x - drawn.press.x), y: Math.round(drawn.ink.y - drawn.press.y) } : null,
      blocked: drawn.why,
    });
  }
  const drawable = rows.filter((r) => !r.overTarget);
  const worstPointer = rows.reduce((m, r) => Math.max(m, Math.abs(r.pointerError.x), Math.abs(r.pointerError.y)), 0);
  const worstInk = drawable.reduce((m, r) => Math.max(m, Math.abs(r.inkError?.x ?? 0), Math.abs(r.inkError?.y ?? 0)), 0);
  check(`${caseName}: pointer lands where the hand aims (≤${TOLERANCE_PX}px)`,
    worstPointer <= TOLERANCE_PX && rows.every((r) => r.converged),
    { worstPx: worstPointer, rows });
  check(`${caseName}: most of the board is free of chrome`,
    drawable.length >= 3,
    { drawable: drawable.length, of: rows.length, onChrome: rows.filter((r) => r.overTarget).map((r) => r.label) });
  check(`${caseName}: ink starts under the pointer (≤${TOLERANCE_PX}px)`,
    worstInk <= TOLERANCE_PX && drawable.length >= 3 && drawable.every((r) => r.inkError !== null),
    { worstPx: worstInk, rows: drawable.map((r) => ({ label: r.label, inkError: r.inkError, blocked: r.blocked })) });
  return rows;
};

const setMode = async (page, target) => {
  // A DOM click, not a pinch: the suite is measuring a mapping, and a pinch on the
  // segment can land on the neighbour and silently switch the room being measured.
  await page.evaluate((id) => document.querySelector(`[data-gesture-id="mode-${id}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true })), target);
  await page.waitForFunction((id) => window.__airdraw.workspaceMode === id && window.__airdrawMode.getSnapshot().mode !== 'TRANSITION', target, { timeout: 12000 });
  await page.waitForTimeout(600);
};
const setRail = async (page, open) => {
  await page.evaluate(() => {
    const rail = document.querySelector('[data-testid="workspace-rail"]');
    const button = document.querySelector('[data-gesture-id="rail-collapse"]');
    if (rail && button && (rail.dataset.open === 'true') !== open) button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(700);
};

// ---- 1. window shapes, both drawing modes, default chrome --------------------------
const SHAPES = [
  { label: '1920x1080 16:9', width: 1920, height: 1080 },
  { label: '1366x768', width: 1366, height: 768 },
  { label: '1024x768 4:3', width: 1024, height: 768 },
  { label: '2560x1080 ultrawide', width: 2560, height: 1080 },
];
for (const shape of SHAPES) {
  const page = await openApp(shape);
  // The bar slides in from y = -12; measuring the frame mid-animation would report a
  // layout bug that is only an entrance.
  await page.waitForFunction(() => document.querySelector('[data-testid="workspace-bar"]')?.getBoundingClientRect().top === 0, null, { timeout: 6000 }).catch(() => {});
  const base = await frameInfo(page);
  check(`${shape.label}: the bar and the board agree on one window`, base.bar?.top === 0 && base.bar?.height > 0 && base.bar?.left === 0, base);
  await setMode(page, 'SPATIAL_DRAW');
  await sweep(page, `${shape.label} spatial`, boardPoints(await frameInfo(page)));
  await setMode(page, 'CANVAS_DRAW');
  await sweep(page, `${shape.label} canvas`, boardPoints(await frameInfo(page)));
  await page.close();
}

// ---- 2. chrome takes a lane: collapsed rail, then zoom and pan on the sheet --------
{
  const page = await openApp({ width: 1440, height: 900 });
  await setMode(page, 'CANVAS_DRAW');
  const open = await frameInfo(page);
  await sweep(page, 'canvas 1440x900 rail open', boardPoints(await frameInfo(page)));
  await setRail(page, false);
  const collapsed = await frameInfo(page);
  check('collapsing the rail widens the board without moving the mapping', collapsed.railOpen === false && collapsed.surface.width > open.surface.width - 1, { open: open.surface, collapsed: collapsed.surface });
  await sweep(page, 'canvas 1440x900 rail collapsed', boardPoints(await frameInfo(page)));
  await setRail(page, true);
  await page.evaluate(() => {
    const e = window.__airdraw;
    e.canvasNav.setView({ ...e.canvasNav.state(), zoom: 2.4, offsetX: -180, offsetY: -90 });
  });
  await page.waitForTimeout(500);
  await sweep(page, 'canvas zoom 2.4 + pan', boardPoints(await frameInfo(page)));
  await page.evaluate(() => window.__airdraw.canvasNav.setView({ zoom: 0.5, offsetX: 120, offsetY: 60 }));
  await page.waitForTimeout(500);
  await sweep(page, 'canvas zoom 0.5 + pan', boardPoints(await frameInfo(page)));
  await page.close();
}

// ---- 3. the presentation axis: un-mirrored mapping, and the left hand --------------
{
  const page = await openApp({ width: 1440, height: 900, mirror: 0 });
  await setMode(page, 'CANVAS_DRAW');
  await sweep(page, 'canvas un-mirrored', [{ x: 720, y: 450, label: 'centre' }, { x: 360, y: 300, label: 'upper-left' }, { x: 1080, y: 600, label: 'lower-right' }], { mirror: false });
  await page.close();
}
{
  const page = await openApp({ width: 1440, height: 900, hand: 'Left' });
  await setMode(page, 'CANVAS_DRAW');
  // Nothing has been aimed yet, so put a left hand in front of the selector first and
  // then ask which hand it chose.
  for (let i = 0; i < 40 && !(await page.evaluate(() => !!window.__airdraw.tracking.primary)); i += 1) {
    await pushLeftHand(page, 0.5, 0.5, 'point');
    await page.waitForTimeout(50);
  }
  const seen = await page.evaluate(() => window.__airdraw.tracking.primary?.handedness ?? null);
  check('a left hand is the acting hand when it is preferred', seen === 'Left', { primaryHandedness: seen });
  await sweep(page, 'canvas left hand', [{ x: 720, y: 450, label: 'centre' }, { x: 360, y: 300, label: 'upper-left' }, { x: 1080, y: 600, label: 'lower-right' }], { hand: 'Left' });
  await page.close();
}

check('no runtime errors', errors.length === 0, errors.slice(0, 3));

const passed = results.filter((r) => r.pass).length;
mkdirSync('docs/verification', { recursive: true });
writeFileSync('docs/verification/phase16-coordinates.json', JSON.stringify({ passed, total: results.length, tolerancePx: TOLERANCE_PX, results }, null, 2));
console.log(`\n${passed}/${results.length} checks passed`);
await browser.close();
if (passed !== results.length) process.exitCode = 1;
