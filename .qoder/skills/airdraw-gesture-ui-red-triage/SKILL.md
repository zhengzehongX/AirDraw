---
name: airdraw-gesture-ui-red-triage
description: AirDraw (D:\AirDraw) 手势 UI 红点的取证式归因阶梯 —— 探针读 document.elementsFromPoint 绘制栈与 __airdrawInteraction.snapshot.hoverId 序列，再用 page.mouse.click 做对照实验，把「应用逻辑坏」和「捏合命中被隔壁面板/顶栏/WebGL 画布吃掉」分开；gestureDriver 的 ok 只代表任意区域激活，必须再看 lastActivatedId、activationCount、snapshot.state（cooling 是 350ms 双击保护、不是失败）与 engine.inputDiagnostic.gates；一串连带红（保存→画廊→导出）通常只有一个源头，从最早那条倒推；「卡一闪就没」用 new Error().stack 存 window.__histLog 抓 React 发布栈定位回写方；套件保留双页时用 decoy 第二页复现并按 200ms 采样 hold。判定轮必须在空闲机器上冷却单跑，先数前台 Chrome 再怀疑 headless 泄漏，崩溃行号必须在当前文件重读。当 e2e 或浏览器套件出现 no-element/no-activate/no-press、返回 ok 但状态没变，或需要区分抖动/负载假红与真回归时使用。阈值定数与放宽交 gesture-threshold-noise-probe 和 gesture-threshold-change-audit，玩具与 GLSL 交 airdraw-shader-toy-verification，套件编排/端口/PATH/断言计数交 airdraw-regression-verification。
---

# AirDraw 手势 UI 红点取证

## Overview

手势控件点不动，绝大多数不是业务逻辑坏了，而是那一捏被用户看不见的图层吃掉：摄像头预览的 52×52 关闭按钮压住作品库「打开」、`backdrop-filter` 让顶栏自成层叠上下文使 DebugPanel 画在菜单之上、全屏 WebGL 画布可命中地盖在所有 DOM 浮层上。这三条都曾用同一套探针取证定案，记录在 `docs/phase15-log.md:45-83`。

本 Skill 规定**取证顺序**和**判定纪律**：先用测量区分「逻辑坏」与「命中被抢」，再决定动谁；判定轮必须在空闲机器上冷却单跑。环境细节（PATH 没有 node/npm、套件顺序、`docs/verification/*.json` 计数口径、长跑冻结模块图）不在此重复，见 `airdraw-regression-verification`。

## 何时使用

- 浏览器套件红点签名是 `no-element` / `no-activate` / `no-press`，或返回 `ok` 但 `window.__airdrawApp()` 状态没变；
- 一串连带红（save/gallery/PNG/回读）需要判断是多个缺陷还是一个源头；
- 用户报「点不到」「捏合没反应」「这个控件手势不生效」；
- 需要判定某条红是抖动、负载假红还是真回归。

不适用：给阈值定数或放宽（`gesture-threshold-noise-probe`）、阈值改了但症状不变（`gesture-threshold-change-audit`）、玩具不挂载与 GLSL 报错（`airdraw-shader-toy-verification`）。

## Step 0 — 先冻结，再查负载

判定完成之前**不改 `src/`**（改了当轮长跑作废），也不放宽任何断言。

先排除机器因素：

```powershell
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Select-Object ProcessId,CommandLine | Format-List
```

- 有非 headless 的前台 Chrome 在跑 ⇒ 它正在抢 CPU/GPU，本轮结果不能当回归读；
- `CommandLine -match 'headless'` 为空 ⇒ **不是**浏览器泄漏，别再往泄漏上猜（历史上一轮 45/11 就是这么排除的，实际是前台 Chrome 抢资源，见 `docs/phase15-log.md:83`）。

## Step 1 — 每条红钉到唯一闸门

把断言文案映射到唯一被检对象（一个 `data-gesture-id`、一条命令派发、一个闸门位）。崩溃或 `ReferenceError` 给出的行号**必须在当前文件重读**（`grep -n` 那一行），不要用上一轮的旧行号推断——探针文件改过一轮后行号就错位了。

## Step 2 — 复制既有探针作基底

`node_modules/airdraw-probe/p15*.mjs` 是 scratch 区，不要从零写。选一个最接近目标的（`p15gal2.mjs` 对照实验、`p15help.mjs` 绘制栈+hover、`p15tut.mjs` 双页 decoy、`p15save.mjs` 逐控件 covered 报告），改标题注释里的「要回答的三个问题」。固定骨架：

```js
import { chromium } from 'playwright-core';
import { installGestureDriver, enterApp } from '../../scripts/gestureDriver.mjs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
// 必须显式给 APP_URL —— 各套件默认端口不一致（scripts/e2e.mjs 是 5173，stage5/stage6 是 5174）。
const browser = await chromium.launch({ executablePath: CHROME, headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console:${m.text()}`); });
await page.addInitScript(() => {
  localStorage.setItem('airdraw-preferences-v1', JSON.stringify({ schema: 1, tutorialDone: true, helloSeen: true }));
  localStorage.setItem('airdraw-pinch-calibration',
    JSON.stringify({ contact: .30, release: .37, projection: .30, z: .16, calibratedAt: '2026-10-05T00:00:00Z' }));
});
await page.goto(`${process.env.APP_URL ?? 'http://localhost:5173/'}?simulate=1&debug=1`);
await page.evaluate(installGestureDriver);
await enterApp(page, { target: 'CANVAS_DRAW' });
const gesture = (name, ...args) => page.evaluate(async ([n, a]) => window.__gesture[n](...a), [name, args]);
const say = (k, v) => console.log(`${k}: ${JSON.stringify(v, null, 1)}`); // 每个文件自备 helper
```

跑法写在文件头注释里：`Run: APP_URL=http://localhost:5173/ node node_modules/airdraw-probe/pXX.mjs`。

## Step 3 — 绘制栈取证（谁画在最上面）

对每个候选控件中心取栈顶，别只看 `elementFromPoint` 的第一项：

```js
say('items', await page.evaluate((ids) => ids.map((id) => {
  const el = document.querySelector(`[data-gesture-id="${id}"]`);
  if (!el) return { id, missing: true };
  const r = el.getBoundingClientRect();
  const stack = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).slice(0, 6)
    .map((e) => `${e.tagName}[${e.getAttribute('data-testid') ?? e.getAttribute('data-gesture-id') ?? (e.className || '').toString().slice(0, 24)}]`);
  return { id, at: { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) },
    paintedTop: stack[0], hitSelf: stack[0]?.includes(id) ?? false, pointerEvents: getComputedStyle(el).pointerEvents };
}), ['dock-save', 'recognition-confirm', 'lab-back']));
```

读数口径：
- 栈顶不是自己 ⇒ 命中会被抢；历史上出现过 `HEADER[debug]` 压在 `BUTTON[dock-guide]` 之上（菜单因 `backdrop-filter` 自困在层叠上下文里，`z-index:101` 出不去）。
- 该元素自身 `pointer-events: none` ⇒ **不得**下「被盖住」的结论（`elementFromPoint` 对它永远返回别的东西）；这是遮挡检查的护栏，缺了它会静默禁掉控件。
- 矩形在视口内不等于可命中：滚动容器会裁剪（教程章节行在视口内但被 rail 裁掉），断言「可选」必须要求它落在 rail 自己的盒子里。

## Step 4 — hover 序列取证（手势实际指到了谁）

```js
say('hoverSeq', await page.evaluate(async (sel) => {
  const el = document.querySelector(sel); const r = el.getBoundingClientRect();
  const u = (r.left + r.width / 2) / innerWidth, v = (r.top + r.height / 2) / innerHeight;
  const seen = [];
  for (let i = 0; i < 24; i += 1) {
    window.__gesture.push(u, v, 'point');
    await new Promise((res) => setTimeout(res, 33));
    seen.push(window.__airdrawInteraction.snapshot.hoverId);
  }
  return { found: [...new Set(seen)], last: seen.at(-1) };
}), '[data-gesture-id="gallery-open-0"]');
```

序列止于隔壁 id（实测过的签名是 `camera-preview-close`、`debug-zone`）⇒ 拾取/层叠问题，直接跳到 Step 5 做对照，**不要**先去读业务 handler。

## Step 5 — 鼠标对照实验

```js
await page.mouse.move(4, 4);            // 先把指针停泊到中立位置，避免残留 hover 污染
const box = await page.locator(sel).boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
say('mouseControl', await page.evaluate(() => ({ context: window.__airdrawApp?.()?.context,
  mode: window.__airdrawMode?.getSnapshot?.().mode, objects: window.__airdrawWorkspace.project.objects.length })));
```

| 鼠标 | 手势 | 结论 |
| --- | --- | --- |
| 成功 | 失败 | 应用逻辑无恙，坏的是手势命中层（遮挡、层叠、`pointer-events`、hitTest） |
| 失败 | 失败 | 才查 command 派发 / reducer / 数据前提 |
| 成功 | 成功 | 这条红是时序或负载，转 Step 8 |

## Step 6 — 激活与闸门读数

`gesture('click', sel)` 的返回值语义（`scripts/gestureDriver.mjs:163,204`）：**`'ok'` 只代表任意区域被激活**，不代表点中了你要的那个。必须补读：

```js
say('after', await page.evaluate(() => ({
  lastActivatedId: window.__airdrawInteraction.lastActivatedId,   // GestureInteractionManager.ts:199
  activations: window.__airdrawInteraction.activationCount,        // :203
  state: window.__airdrawInteraction.snapshot.state,               // 'cooling' 是 350ms 双击保护
  hover: window.__airdrawInteraction.snapshot.hoverId,
  press: window.__airdrawInteraction.snapshot.pressId,
  hold: window.__airdrawInteraction.snapshot.holdProgress,
  diag: window.__airdraw.inputDiagnostic,                          // DrawEngine.ts:468 hint/router/gates
})));
```

三类答案要分开：`lastActivatedId` 是别的控件 ⇒ 命中被抢；`state==='cooling'` 或 `pressId` 仍在 ⇒ 被节流闸门挡住，不是失败（driver 自己就等 24×33ms 熬过它）；`gates.uiHovered===false` 或 `router.waitingForRelease===true` ⇒ 闸门还锁着，落笔条件没到。

遮挡与区域总览可直接问管理器：`__airdrawInteraction.containsPoint({x,y,z})` 与 `__airdrawInteraction.rects`（`scripts/phase10-toys-e2e.mjs` 里的 `liveRegionReport` 就是这个用法）。

## Step 7 — 级联红点从最早一条倒推

一串红常常只有一个源头。先看**最早**那条红的动作是否真的成功，再看下游：

- `hold-to-clear` 一次丢手（`{state:"lost", press:null, hold:0}`）⇒ 无笔迹 ⇒ save/gallery/PNG/分辨率/回读六连红；
- `dock-save` 被吞 ⇒ 作品库 0 张卡 ⇒ 导出与回读连带红。

下游这几条按「没有输入产物的必然结果」处理，不逐条猜修、不逐条放宽。

## Step 8 — 「一闪就没」类抓 React 发布栈

控件出现过又消失，别只看一次结果。在可疑回调入口塞栈采样，找出是谁在重置它的定时器：

```js
await page.evaluate(() => { window.__histLog = []; });
await page.evaluate(() => {
  window.__histOff = window.__airdraw.onHistoryChange(() => {
    window.__histLog.push(new Error('history').stack.split('\n').slice(1, 6).join(' | ').replace(/\s+/g, ' ').slice(0, 400));
  });
});
// ...执行那段序列...
say('publishers', await page.evaluate(() => ({ count: window.__histLog.length, first: window.__histLog.slice(0, 3) })));
```

实测过的一条：识别卡 850ms 定时器被反复重置，发布栈落在 `DrawEngine.replaceProjectStrokes` ← `src/project/useProjectBridge.ts` 的自动保存回写——不是识别逻辑坏，是回写把卡「闪掉」了。配套时间线采样（每 260ms 记一次 `card` 是否在场 + 它的 rect）能把「从未出现」和「出现又被抹掉」分开。

## Step 9 — 双页负载用 decoy 复现

套件若保留 studio 页又在第二页开教程/浮层，单页探针永远复现不了。按 `p15tut.mjs` 的做法：先开一个持续绘画的 decoy studio 页，再走目标序列，每 200ms 采一次 hold 现场（hidden flag、`metrics.gesture`、其持续时长、`dockOpen`）。这样「hold 被节流」「手势抖动」「dock 开了但课程漏判」变成三个可分别证伪的答案，而不是三个猜测。

## Step 10 — 结论分层，修在真正的层

- 命中被抢 ⇒ 修层叠/排版（给该浮层应有的 `z-index`、浮层期间不渲染创作辅助、只给按钮恢复 `pointer-events:auto`）或修 `GestureInteractionManager.hitTest` 的遮挡判定；不要用 `setTimeout` 重试或放宽断言掩盖。
- 时序 ⇒ 轮询真实产物（`waitForFunction` 看状态），别把墙钟当完成条件：SwiftShader 下主线程可能拖到引擎 staleness 守卫丢手，模式切换的 TRANSITION 定时器也会迟到于松手。
- 逻辑 ⇒ 才动 handler/reducer。

改遮挡检查时同步加 Step 3 的 `pointer-events` 护栏。

## Step 11 — 判定轮与记录

1. 空闲机器、单跑（一次只开一个 headless Chrome），把每轮 `PASS/FAIL` 计数写进 `docs/phase15-log.md` 的运行表——负载不能读成回归，也不能读成通过。
2. 已知间歇家族保持原样并记录，**禁止为变绿删断言**：#72（UI 捏合后的冷却/latch）、`KNOWN GAP: a right swipe goes back one card`。
3. 结论落进 `docs/`：探针在 `node_modules/airdraw-probe/`，`npm install` 会清掉它，只有日志是持久的。

## 反面清单（本流程三次误判换来的）

1. **把节流闸门当根因** —— `state==='cooling'` 与 350ms 双击保护是产品对人的保护，harness 该熬过它；把它写成缺陷会去改一个本来正确的常量。
2. **按旧行号读崩溃点** —— `p15dock.mjs:56 ReferenceError` 重读时那一行已经是别的语句；先 `grep -n` 再推理。
3. **没数进程就怀疑 headless 泄漏** —— `-match 'headless'` 为空即排除；真因是前台 Chrome 抢 CPU/GPU。

## 探针环境坑

- Windows 下 `import 'D:\...'` 抛 `ERR_UNSUPPORTED_ESM_URL_SCHEME`；从 `node_modules/airdraw-probe/` 引 harness 一律用相对路径 `'../../scripts/gestureDriver.mjs'`。
- `say()`/`check()` 是各探针文件自备的 helper，跨文件照抄会 `ReferenceError`。
- 输出别写 `D:\tmp\`（不存在 ⇒ ENOENT）；用仓库内路径并先 `mkdirSync(..., {recursive:true})`。
- 必须显式传 `APP_URL`；`?simulate=1` 决定不开摄像头，`&debug=1` 才有诊断面板。

## 验证本 Skill

- 纸面回放 `docs/phase15-log.md:45-53`（遮挡根因）与 `:81-83`（负载级联）：按 Step 0→5 走，应分别得到「命中被抢、逻辑无恙」与「负载假红、非泄漏」。
- 实跑（需本机 dev server）：把某控件临时设为 `pointer-events:none`，或把 DebugPanel 层级压回去，Step 3/4 应报出 `paintedTop` 非自身与 `hoverSeq` 落在隔壁 id。
- 引用的 API 实名已核：`lastActivatedId`/`activationCount`（`src/interaction/GestureInteractionManager.ts:199,203`）、`inputDiagnostic`（`src/engine/DrawEngine.ts:468`）、click 返回值（`scripts/gestureDriver.mjs:163,204`）。若这些名字变更，先改本 Skill 再改 harness。
