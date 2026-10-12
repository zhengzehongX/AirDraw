import { chromium } from 'playwright-core';
import { installGestureDriver, enterApp } from './gestureDriver.mjs';

/**
 * P10-B acceptance: for every control, the same five questions —
 * ① can a hand/mouse/keyboard actually move it, ② did the number change,
 * ③ did the service receive it, ④ did anything observable change,
 * ⑤ does it survive a reload.
 */
const APP = process.env.APP_URL ?? 'http://localhost:5174/';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message || e).slice(0, 400)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)); });
const rows = [];
const record = (item, check, verdict, detail) => {
  rows.push({ item, check, verdict, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
  console.log(`${verdict.padEnd(6)} | ${item} | ${check} | ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 220)}`);
};

await page.addInitScript(() => {
  // Only seed a first-run profile: this script re-runs on every navigation, and a
  // second write would erase whatever the test just changed.
  if (!localStorage.getItem('airdraw-preferences-v1')) {
    localStorage.setItem('airdraw-preferences-v1', JSON.stringify({ schema: 1, tutorialDone: true, helloSeen: true }));
  }
});
await page.goto(`${APP}?simulate=1`);
await enterApp(page, { target: 'SPATIAL_DRAW' });
await page.evaluate(installGestureDriver);

// Reach settings the way a hand does: hold an open palm to raise the dock, then
// take the settings item. The dock is a gesture affordance, so it needs the hold.
async function openSettings() {
  const raised = await page.evaluate(async () => {
    const sleep = (t) => new Promise((r) => setTimeout(r, t));
    const g = window.__gesture;
    for (let i = 0; i < 120 && !window.__airdrawApp().dockOpen; i += 1) {
      g.push(0.5, 0.55, 'open');
      await sleep(50);
    }
    return { dockOpen: window.__airdrawApp().dockOpen };
  });
  await page.waitForTimeout(300);
  const tapped = await tap('[data-dock-item="dock-settings"]');
  await page.waitForTimeout(400);
  const settings = await page.locator('[data-testid="settings"]').count();
  return { ...raised, tapped, settings: settings > 0 };
}

const opened = await openSettings();
record('导航', '手势呼出 Dock 并进入设置', opened.settings ? 'PASS' : 'FAIL', opened);
if (!opened.settings) { await browser.close(); process.exit(1); }

const prefs = () => page.evaluate(() => JSON.parse(localStorage.getItem('airdraw-preferences-v1') || '{}'));

/**
 * The settings body scrolls by translating an inner container (a pinch can never
 * reach a scrollbar), so a row can sit outside the sheet's window or under the
 * sticky footer. Wheel until the point we mean to click is really the element.
 */
async function reveal(selector) {
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const box = await page.locator(selector).boundingBox().catch(() => null);
    if (!box) return null;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    if (cy > 150 && cy < 700) {
      const hits = await page.evaluate(
        ([sel, x, y]) => {
          const target = document.querySelector(sel);
          const top = document.elementFromPoint(x, y);
          return !!target && !!top && (top === target || target.contains(top) || top.contains(target));
        },
        [selector, cx, cy],
      );
      if (hits) return { ...box, cx, cy };
    }
    await page.mouse.move(720, 480);
    await page.mouse.wheel(0, cy >= 700 ? 200 : -200);
    await page.waitForTimeout(140);
  }
  const box = await page.locator(selector).boundingBox().catch(() => null);
  return box ? { ...box, cx: box.x + box.width / 2, cy: box.y + box.height / 2 } : null;
}

async function tap(selector) {
  const box = await reveal(selector);
  if (!box) return false;
  await page.mouse.click(box.cx, box.cy);
  await page.waitForTimeout(220);
  return true;
}

/** Fields under test: stored value → where it must land in the running service. */
const KEY_DESCRIPTORS = {
  pointerSensitivity: { max: 1.6 },
  pointerSmoothing: { max: 1 },
  pinchAssist: { max: 1 },
  gestureHoldMs: { max: 1400 },
  toyIntensity: { max: 1 },
  voiceVolume: { max: 1 },
};
const fields = [
  { key: 'pointerSensitivity', read: () => window.__airdraw.indexFilter.x.gain, expect: (v) => v, aim: 0.9 },
  { key: 'pointerSmoothing', read: () => window.__airdraw.indexFilter.x.minCutoff, expect: (v) => +(1.5 * Math.pow(2, 0.5 - v)).toFixed(4), aim: 0.9 },
  { key: 'pinchAssist', read: () => window.__airdraw.pinchDetector.assist, expect: (v) => v, aim: 0.8 },
  { key: 'gestureHoldMs', read: null, expect: null, aim: 0.85 },
  { key: 'toyIntensity', read: () => window.__airdrawLab.gestures.gain, expect: (v) => +(0.7 + v * 0.6).toFixed(4), aim: 0.95 },
  { key: 'voiceVolume', read: () => window.__airdrawVoice.volume, expect: (v) => v, aim: 0.75 },
];

for (const field of fields) {
  const input = `[data-testid="settings-input-${field.key}"]`;
  const box = await reveal(input);
  if (!box) { record(field.key, '①控件存在', 'FAIL', 'no native range input'); continue; }

  // ① mouse: click the track at `aim` of its width.
  const before = await prefs();
  await page.mouse.click(box.x + box.width * field.aim, box.cy);
  await page.waitForTimeout(120);
  const afterMouse = await prefs();
  const moved = afterMouse[field.key] !== before[field.key];
  record(field.key, '①鼠标可操作', moved ? 'PASS' : 'FAIL', `${before[field.key]} → ${afterMouse[field.key]}`);

  // ① keyboard: focus and step twice — toward the middle, so an extreme is movable.
  await page.locator(input).focus();
  const beforeKey = (await prefs())[field.key];
  const descriptor = KEY_DESCRIPTORS[field.key];
  const key = beforeKey >= descriptor.max ? 'ArrowLeft' : 'ArrowRight';
  await page.keyboard.press(key);
  await page.keyboard.press(key);
  await page.waitForTimeout(120);
  const afterKey = (await prefs())[field.key];
  record(field.key, '①键盘可操作', afterKey !== beforeKey ? 'PASS' : 'FAIL', `${beforeKey} → ${afterKey}`);

  // ① hand: drag the same track with a pinch.
  const beforeDrag = (await prefs())[field.key];
  const drag = await page.evaluate(async ([sel]) => await window.__gesture.dragTo(sel, 0.35), [input]);
  await page.waitForTimeout(150);
  const afterDrag = (await prefs())[field.key];
  record(field.key, '①捏合拖拽可操作', afterDrag !== beforeDrag ? 'PASS' : 'FAIL', `${drag} ${beforeDrag} → ${afterDrag}`);

  // ③ the service behind it holds the same number, through the documented mapping.
  if (!field.read) {
    record(field.key, '③服务已应用', 'n/a', '消费处直接读 prefs（App 的张掌计时用 gestureHoldMs）');
    continue;
  }
  const storedNow = (await prefs())[field.key];
  const wanted = field.expect(storedNow);
  const serviceValue = await page.evaluate(`(${field.read.toString()})()`);
  const matches = typeof serviceValue === 'number' && Math.abs(serviceValue - wanted) < 0.01;
  record(field.key, '③服务已应用', matches ? 'PASS' : 'FAIL', { prefs: storedNow, expected: wanted, service: serviceValue });
}

// ④ effects that a human can see, measured rather than asserted.
const effects = await page.evaluate(async () => {
  const sleep = (t) => new Promise((r) => setTimeout(r, t));
  const engine = window.__airdraw;
  const step = (gain, cutoff) => {
    engine.setPointerSensitivity(gain);
    engine.setPointerSmoothing(cutoff);
    const f = engine.indexFilter.x;
    let value = 0;
    // A unit step through the filter: six frames in, how far it has arrived.
    f.reset?.(0);
    const t0 = performance.now() / 1000;
    for (let i = 1; i <= 6; i += 1) value = f.filter(t0 + i / 60, 1);
    return +value.toFixed(4);
  };
  const lowFloor = step(1, 1);
  const highFloor = step(1, 0);
  return { smoothResponse: lowFloor, crispResponse: highFloor, pinchEnter: engine.pinchDetector.enterThreshold ?? null, assist: engine.pinchDetector.assist };
});
record('平滑程度', '④效果有变化', effects.crispResponse > effects.smoothResponse + 0.02 ? 'PASS' : 'FAIL', effects);

// Choice controls: theme, motion, interface language, toy detail.
const theme = await page.evaluate(() => ({ attr: document.documentElement.dataset.theme, nightControls: document.querySelectorAll('[data-testid="settings-theme-night"]').length }));
record('日间产品', '夜间入口移除且环境保持日间', theme.attr === 'day' && theme.nightControls === 0 ? 'PASS' : 'FAIL', theme);

const langBox = await reveal('[data-testid="settings-ui-language-en"]');
if (langBox) {
  await page.mouse.click(langBox.cx, langBox.cy);
  await page.waitForTimeout(300);
  const lang = await page.evaluate(() => ({ pref: JSON.parse(localStorage.getItem('airdraw-preferences-v1') || '{}').uiLanguage, htmlLang: document.documentElement.lang, heading: document.querySelector('[data-testid="settings"] .ad-eyebrow')?.textContent, smoothingLabel: [...document.querySelectorAll('[data-testid="settings-body"] span')].slice(0, 40).map((s) => s.textContent).join('|').slice(0, 160) }));
  record('界面语言', '①②③切换生效', lang.pref === 'en' ? 'PASS' : 'FAIL', lang);
  await page.waitForTimeout(200);
  await tap('[data-testid="settings-ui-language-zh"]');
  const back = await prefs();
  record('界面语言', '②切回中文', back.uiLanguage === 'zh' ? 'PASS' : 'FAIL', back.uiLanguage);
  await tap('[data-testid="settings-ui-language-system"]');
}

const detailBox = await reveal('[data-testid="settings-detail-performance"]');
if (detailBox) {
  await page.mouse.click(detailBox.cx, detailBox.cy);
  await page.waitForTimeout(300);
  const detail = await page.evaluate(() => ({ pref: JSON.parse(localStorage.getItem('airdraw-preferences-v1') || '{}').toyDetail, locked: window.__airdrawQuality.locked, current: window.__airdrawQuality.current, particles: window.__airdrawQuality.profile.particles }));
  record('玩具细节/粒子', '③服务已应用', detail.locked === 'performance' && detail.current === 'performance' ? 'PASS' : 'FAIL', detail);
  await tap('[data-testid="settings-detail-auto"]');
  await page.waitForTimeout(200);
  const auto = await page.evaluate(() => ({ locked: window.__airdrawQuality.locked, current: window.__airdrawQuality.current }));
  record('玩具细节/粒子', '自动档交还给调度器', auto.locked === null ? 'PASS' : 'FAIL', auto);
}

// ⑤ reload: everything set above must come back and be applied by itself.
const beforeReload = await prefs();
await page.reload({ waitUntil: 'load' });
await enterApp(page, { target: 'SPATIAL_DRAW' });
await page.evaluate(installGestureDriver);
await page.waitForTimeout(500);
const afterReload = await prefs();
const serviceAfterReload = await page.evaluate(() => ({
  gain: window.__airdraw?.indexFilter?.x?.gain ?? null,
  smoothing: window.__airdraw?.indexFilter?.x?.minCutoff ?? null,
  assist: window.__airdraw?.pinchDetector?.assist ?? null,
  hand: window.__airdraw?.handSelector?.mode ?? null,
  theme: document.documentElement.dataset.theme ?? null,
  lang: document.documentElement.lang ?? null,
}));
record('全部字段', '⑤刷新后存储仍在', JSON.stringify(beforeReload) === JSON.stringify(afterReload) ? 'PASS' : 'FAIL', { before: Object.keys(beforeReload).length, stored: afterReload.pointerSensitivity, theme: afterReload.theme, ui: afterReload.uiLanguage, hold: afterReload.gestureHoldMs });
const reopened = await openSettings();
record('导航', '刷新后仍可进入设置', reopened.settings ? 'PASS' : 'FAIL', reopened);
const stored = await prefs();
const applied = await page.evaluate(() => ({
  gain: window.__airdraw?.indexFilter?.x?.gain ?? null,
  smoothing: window.__airdraw?.indexFilter?.x?.minCutoff ?? null,
  assist: window.__airdraw?.pinchDetector?.assist ?? null,
}));
const reloadOk = Math.abs((applied.gain ?? -1) - (stored.pointerSensitivity ?? -2)) < 0.01
  && Math.abs((applied.assist ?? -1) - (stored.pinchAssist ?? -2)) < 0.01;
record('全部字段', '⑤刷新后服务自动应用', reloadOk ? 'PASS' : 'FAIL', { stored, applied, early: serviceAfterReload, smoothingFromPref: null });

// The reset button: one press must put every field back, and say so once.
const resetBox = await reveal('[data-testid="settings-reset-all"]');
if (resetBox) {
  await page.mouse.click(resetBox.cx, resetBox.cy);
  await page.waitForTimeout(400);
  const reset = await page.evaluate(() => ({
    stored: JSON.parse(localStorage.getItem('airdraw-preferences-v1') || '{}'),
    trackingKey: localStorage.getItem('airdraw-tracking-config'),
    calibrationKey: localStorage.getItem('airdraw-pinch-calibration'),
    themeMirror: localStorage.getItem('airdraw-theme'),
    gain: window.__airdraw.indexFilter.x.gain,
    assist: window.__airdraw.pinchDetector.assist,
    intensity: window.__airdrawLab.gestures.gain,
    locked: window.__airdrawQuality.locked,
  }));
  // `uiLanguage` defaults to 中文, not to the browser's language: an English browser
  // would otherwise get a half-translated shell, which is worse than either language.
  const defaultsBack = reset.stored.pointerSensitivity === 1 && reset.stored.pinchAssist === 0 && reset.stored.toyIntensity === 0.5 && reset.stored.voiceVolume === 0.35 && reset.stored.uiLanguage === 'zh' && reset.stored.toyDetail === 'auto';
  record('恢复全部默认', '①③一次性复位', defaultsBack && reset.gain === 1 && reset.assist === 0 && Math.abs(reset.intensity - 1) < 0.01 && reset.locked === null ? 'PASS' : 'FAIL', reset);
  record('存储键', '主题不再双写', reset.themeMirror === null ? 'PASS' : 'FAIL', { airdrawTheme: reset.themeMirror });
}

// One pinch, one target: the dock must not be reachable from inside a toy.
await tap('[data-testid="settings-done"]');
const enteredLab = await page.evaluate(async () => {
  const sleep = (t) => new Promise((r) => setTimeout(r, t));
  for (let i = 0; i < 30 && window.__airdrawApp().context !== 'playlab'; i += 1) {
    const door = document.querySelector('[data-gesture-id="mode-PLAYLAB"]') ?? document.querySelector('[data-testid="hub-PLAYLAB"]');
    door?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await sleep(120);
  }
  return window.__airdrawApp().context;
});
const exclusivity = await page.evaluate(async () => {
  const sleep = (t) => new Promise((r) => setTimeout(r, t));
  const g = window.__gesture;
  const before = window.__airdrawInteraction.activationCount;
  window.__airdrawLab.request('orb');
  for (let i = 0; i < 60 && window.__airdrawLab.state.status !== 'ready'; i += 1) { g.push(0.5, 0.5, 'open'); await sleep(50); }
  const mgr = window.__airdrawInteraction;
  const live = [...mgr.regions].filter(([, r]) => {
    const s = r?.scope;
    return mgr.screenOwner === 'toy' ? s === 'toy' : !s || s === 'global' || s === mgr.scope;
  }).map(([id]) => id);
  return { live, owner: mgr.screenOwner, status: window.__airdrawLab.state.status, context: window.__airdrawApp().context, activationsDuringEnter: window.__airdrawInteraction.activationCount - before };
});
// Same contract as phase10-toys-e2e: inside a toy the only live regions are the toy's
// own plus the two permanent way-home buttons (玩具大厅 / 返回画布). Nothing from the
// drawing docks may survive into a toy.
const TOY_CHROME = ['lab-back', 'lab-canvas'];
record('输入排他', '玩具内只有玩具的控件可点', exclusivity.owner === 'toy' && TOY_CHROME.every((id) => exclusivity.live.includes(id)) && exclusivity.live.every((id) => TOY_CHROME.includes(id) || id.startsWith('lab-')) ? 'PASS' : 'FAIL', { enteredLab, ...exclusivity });

record('运行时', '无异常', errors.length === 0 ? 'PASS' : 'FAIL', errors.slice(0, 4));

const fs = await import('node:fs');
fs.writeFileSync('docs/verification/phase10-settings.json', JSON.stringify({ at: new Date().toISOString(), rows }, null, 1));
const failed = rows.filter((row) => row.verdict === 'FAIL');
console.log(`${rows.length - failed.length}/${rows.length} checks passed`);
if (failed.length) process.exitCode = 1;
await browser.close();
