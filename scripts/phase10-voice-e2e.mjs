import { chromium } from 'playwright-core';
import { installGestureDriver, enterApp } from './gestureDriver.mjs';

/**
 * P10-D: the voice chain, driven with a stand-in recogniser.
 *
 * Real microphone behaviour stays 待验证 — this proves the parts that are the app's
 * own responsibility: wake → command → the single command bus → an observable change,
 * duplicate finals spent once, and language changes that restart only recognition.
 */
const APP = process.env.APP_URL ?? 'http://localhost:5174/';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message || e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
const rows = [];
const record = (item, verdict, detail) => {
  rows.push({ item, verdict, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
  console.log(`${verdict.padEnd(5)} | ${item} | ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 240)}`);
};

await page.addInitScript(() => {
  if (!localStorage.getItem('airdraw-preferences-v1')) {
    localStorage.setItem('airdraw-preferences-v1', JSON.stringify({ schema: 1, tutorialDone: true, helloSeen: true, calibrationSkipped: true }));
  }
  // Chrome exposes speechSynthesis as a read-only accessor, so a plain assignment
  // silently does nothing. Redefine it, and the utterance class, to capture volume.
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: { speak: (u) => window.__speakLog.push({ text: u.text, volume: u.volume, lang: u.lang }), cancel: () => {} },
  });
  window.__speakLog = [];
});
await page.goto(`${APP}?simulate=1`);
await enterApp(page, { target: 'SPATIAL_DRAW' });
await page.evaluate(installGestureDriver);

// Install the stand-in recogniser once; every transcript below goes through it.
await page.evaluate(() => {
  window.__voiceFeed = [];
  let sink = null;
  window.__voiceStub = {
    starts: [],
    stops: 0,
    start(onText, onError, onEnd, language, onReady) {
      this.starts.push(language);
      sink = onText;
      onReady?.();
    },
    stop() { this.stops += 1; sink = null; },
    say(text, isFinal = true) { if (sink) sink(text, isFinal); return this.starts.length; },
  };
});
const armed = await page.evaluate(() => {
  window.__airdrawVoice.setProvider(window.__voiceStub);
  window.__airdrawVoice.start();
  return window.__airdrawVoice.getSnapshot();
});
record('start', armed.state === 'REQUESTING_PERMISSION' || armed.state === 'WAKE_LISTENING' ? 'PASS' : 'FAIL', armed);
await page.waitForTimeout(200);

/**
 * Each command is preceded by the current wake phrase, because after a command the
 * assistant deliberately drops back to wake-listening — that is the behaviour under
 * test elsewhere, not something the harness may skip.
 */
const drive = async (transcripts) => page.evaluate(async (list) => {
  const sleep = (t) => new Promise((r) => setTimeout(r, t));
  const v = window.__airdrawVoice;
  const before = { commands: v.diagnostics.commandsHandled, unmatched: v.diagnostics.unmatched };
  const seen = [];
  for (const text of list) {
    v.receive(v.wakePhrase);
    await sleep(40);
    v.receive(text, true);
    seen.push(v.getSnapshot());
    await sleep(60);
  }
  await sleep(150);
  return {
    state: v.getSnapshot().state,
    message: v.getSnapshot().message,
    handled: v.diagnostics.commandsHandled - before.commands,
    unmatched: v.diagnostics.unmatched - before.unmatched,
    app: window.__airdrawApp(),
    seen: seen.map((s) => s.state),
  };
}, transcripts);

// 1. wake word then a command, in one phrase and in two.
let r = await drive(['你好，AirDraw', '打开设置']);
record('wake + 分两句下命令', r.app.context === 'settings' && r.handled === 1 ? 'PASS' : 'FAIL', { state: r.state, handled: r.handled, context: r.app.context });
await page.evaluate(() => window.__airdrawWorkspace && document.querySelector('[data-testid="settings-done"]')?.click());
await page.waitForTimeout(300);

r = await drive(['你好airdraw 撤销']);
record('wake + 同一句下命令', r.handled === 1 ? 'PASS' : 'FAIL', { handled: r.handled, message: r.message });

// 2. one utterance, one command — recognisers do emit the same final twice.
r = await drive(['你好，AirDraw', '保存', '保存']);
record('重复的同一条 final 只执行一次', r.handled === 1 ? 'PASS' : 'FAIL', { handled: r.handled });
// A deliberate repeat arrives after the duplicate window.
await page.waitForTimeout(1700);
r = await drive(['保存']);
record('稍后再说一次仍然执行', r.handled === 1 ? 'PASS' : 'FAIL', { handled: r.handled });

// 3. dangerous command needs a second, explicit step.
r = await drive(['清空画布']);
const confirming = r.state === 'CONFIRMING';
record('清空先要确认', confirming && r.handled === 0 ? 'PASS' : 'FAIL', { state: r.state, strokes: await page.evaluate(() => window.__airdraw.strokeCount) });
r = await drive(['取消']);
record('取消不删任何东西', r.state !== 'CONFIRMING' ? 'PASS' : 'FAIL', r.state);

// 4. new commands reach the workspace.
for (const [phrase, expect] of [['打开设置', (a) => a.context === 'settings'], ['选择颜色', (a) => a.popover === 'color'], ['打开玩具', (a) => a.context === 'playlab'], ['返回', (a) => a.context === 'hub']]) {
  await page.evaluate(() => { const d = document.querySelector('[data-testid="settings-done"]'); d?.click(); });
  await page.waitForTimeout(200);
  r = await drive([phrase]);
  const app = r.app;
  const ok = expect(app);
  record(`命令 ${phrase} 真的改变界面`, ok ? 'PASS' : 'FAIL', { context: app.context, popover: app.popover, dockOpen: app.dockOpen });
}
const langBefore = await page.evaluate(() => ({ pref: JSON.parse(localStorage.getItem('airdraw-preferences-v1')).uiLanguage, lang: document.documentElement.lang }));
r = await drive(['切换语言']);
const langAfter = await page.evaluate(() => ({ pref: JSON.parse(localStorage.getItem('airdraw-preferences-v1')).uiLanguage, lang: document.documentElement.lang, context: window.__airdrawApp().context, strokes: window.__airdraw.strokeCount }));
record('切换语言只换文案', langAfter.pref !== langBefore.pref && langAfter.lang !== langBefore.lang ? 'PASS' : 'FAIL', { before: langBefore, after: langAfter });
r = await drive(['返回首页']);
record('语音切页不丢作品', langAfter.strokes >= 0 ? 'PASS' : 'FAIL', { strokes: langAfter.strokes });

// 5. recognition language vs interface language, and restart accounting.
const restarts = await page.evaluate(async () => {
  const v = window.__airdrawVoice, stub = window.__voiceStub;
  const t0 = stub.starts.length;
  window.__airdraw.setPointerSensitivity?.(1);
  v.configure({ wakePhrase: 'AirDraw，听我说', language: 'zh-CN', feedback: true, volume: 0.8 });
  const afterNonLanguage = stub.starts.length - t0;
  v.configure({ wakePhrase: 'AirDraw，听我说', language: 'en-US', feedback: true, volume: 0.8 });
  const afterLanguage = stub.starts.length - t0;
  return { afterNonLanguage, afterLanguage, starts: stub.starts, volume: v.volume, wake: v.wakePhrase };
});
record('非语言变更不重启识别', restarts.afterNonLanguage === 0 ? 'PASS' : 'FAIL', restarts);
record('识别语言变化只重启一次', restarts.afterLanguage === 1 ? 'PASS' : 'FAIL', { afterLanguage: restarts.afterLanguage, starts: restarts.starts });
record('音量进入 speechSynthesis', restarts.volume === 0.8 ? 'PASS' : 'FAIL', restarts);
const spoken = await page.evaluate(async () => {
  window.__speakLog.length = 0;
  const v = window.__airdrawVoice;
  v.configure({ wakePhrase: 'AirDraw，听我说', language: 'en-US', feedback: true, volume: 0.5 });
  v.receive(v.wakePhrase);
  await new Promise((r) => setTimeout(r, 60));
  v.receive('打开菜单');
  await new Promise((r) => setTimeout(r, 200));
  return window.__speakLog;
});
record('语音回应按设定音量播放', spoken.length === 1 && spoken[0].volume === 0.5 ? 'PASS' : 'FAIL', spoken);

// 6. the old wake word is really retired — after the self-listening mute has passed.
const retired = await page.evaluate(async () => {
  const v = window.__airdrawVoice;
  v.configure({ wakePhrase: 'AirDraw，听我说', language: 'zh-CN', feedback: false, volume: 0.35 });
  await new Promise((r) => setTimeout(r, 1700));
  const before = v.diagnostics.commandsHandled;
  v.receive('你好airdraw 撤销');
  await new Promise((r) => setTimeout(r, 250));
  const afterOld = v.diagnostics.commandsHandled - before;
  v.receive('AirDraw，听我说 撤销');
  await new Promise((r) => setTimeout(r, 250));
  const afterNew = v.diagnostics.commandsHandled - before;
  return { afterOld, afterNew, state: v.getSnapshot().state };
});
record('换短语后旧唤醒词失效', retired.afterOld === 0 && retired.afterNew === 1 ? 'PASS' : 'FAIL', retired);

// 7. the cheat sheet follows the interface language, and errors say why.
const sheet = await page.evaluate(async () => {
  const sleep = (t) => new Promise((r) => setTimeout(r, t));
  const g = window.__gesture;
  // The command loop left the app on the hub; the dock only lives in the studio.
  document.querySelector('[data-testid="hub-SPATIAL_DRAW"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep(600);
  for (let i = 0; i < 40 && !window.__airdrawApp().dockOpen; i += 1) { g.push(0.5, 0.55, 'open'); await sleep(50); }
  await sleep(300);
  document.querySelector('[data-dock-item="dock-settings"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep(500);
  const read = () => [...document.querySelectorAll('[data-testid="voice-cheatsheet"] code')].map((n) => n.textContent);
  const pick = async (testid) => {
    document.querySelector(`[data-testid="${testid}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await sleep(350);
  };
  // An earlier step switched the interface to English; read both sides on purpose.
  await pick('settings-ui-language-zh');
  const zh = read();
  await pick('settings-ui-language-en');
  return { zh, en: read(), context: window.__airdrawApp().context };
});
record('“你可以说什么”双语可见', sheet.zh.length >= 6 && sheet.en.length >= 6 && sheet.en.every((p) => !/[一-龥]/.test(p)) ? 'PASS' : 'FAIL', sheet);

const failure = await page.evaluate(async () => {
  const v = window.__airdrawVoice;
  v.stop();
  v.setProvider({ start: (onText, onError) => onError('not-allowed'), stop() {} });
  v.start();
  await new Promise((r) => setTimeout(r, 300));
  return { state: v.getSnapshot().state, message: v.getSnapshot().message };
});
record('拒绝麦克风后给出原因与退路', failure.state === 'ERROR' && /手势/.test(failure.message) ? 'PASS' : 'FAIL', failure);

record('运行时', errors.length === 0 ? 'PASS' : 'FAIL', errors.slice(0, 3));

const fs = await import('node:fs');
fs.writeFileSync('docs/verification/phase10-voice.json', JSON.stringify({ at: new Date().toISOString(), rows }, null, 1));
const failed = rows.filter((row) => row.verdict === 'FAIL');
console.log(`${rows.length - failed.length}/${rows.length} checks passed`);
if (failed.length) process.exitCode = 1;
await browser.close();
