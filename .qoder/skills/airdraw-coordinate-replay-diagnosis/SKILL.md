---
name: airdraw-coordinate-replay-diagnosis
description: AirDraw (D:\AirDraw) 视口/坐标反馈循环的固定输入回放诊断 —— DEV-only window.__airdraw.navTrace（seq/模式/手掌屏幕位/视口/wrote）区分「识别跳动」与「程序自放大」→ 恒定手 14 秒漂移必须 0.00px → 先从 trace 自标定 px-per-normalized-unit（cover 映射下 1 归一化单位≠容器宽，本项目 1440×900 容器+1280×720 视频为 1600px，别把 100px 折成 111px）→ 断言 100px 台阶只走一次、同一 timestamp 连发 3 次 seq 只 +1 → 墨迹 alpha 质心位移对比画布位移（2px 网格残差）→ 改数学先跑 scripts/selfcheck.ts 的 makeRig 纯数学回放 → bak 标签快照二分可疑块 → 回归判定只认冷却单跑。当用户报「手不动画布自己漂」「笔迹不随画布移动/缩放」「手势缩放被吃掉」「一步手势变成连续累加」，或改过 src/interaction/canvasNavigation.ts、src/rendering/canvas2d/viewport.ts、src/rendering/three/spatialNavigation.ts、DrawEngine 坐标链路需要取证时使用。套件编排/端口/本机 PATH 交给 airdraw-regression-verification，接触与捏合阈值标定交给 gesture-threshold-noise-probe 与 gesture-threshold-change-audit，命中遮挡与层叠红点交给 airdraw-gesture-ui-red-triage；本 Skill 只管坐标自激与重复累计这类根因，不适用于文档、导出、文案或 shader 验证。
---

# AirDraw 坐标回放诊断

## Overview

两条在案用户反馈（单手基本稳定时画布仍剧烈偏移；画出的笔迹不随画布移动/缩放）定出的固定管线：先用固定输入回放复现并归因，再改代码。取证结果结构见 `docs/verification/phase14-coords.json`，根因叙述见 `docs/phase14-log.md`。

## 铁律

- 先回放复现，再改代码。**禁止**用加滤波、降 `navPanSpeed`/灵敏度、加阻尼把漂移压小当作修复。
- 不推倒重写导航模块，不清空用户作品。
- 取证阶段不放宽任何断言；要区分「策略断言」与「安全不变量」请走 `gesture-threshold-change-audit`。
- 判定回归只认冷却单跑：同一构建背靠背连跑会出十几条级联红（VICTORY 之后整串手势保持类失败），冷却复跑即恢复，不算回归（项目记忆 `airdraw-suite-load-sensitivity`）。

## 0. 前置：取证面只在 DEV

- `window.__airdraw` 就是 DrawEngine 实例，仅在 `import.meta.env.DEV` 注入（`src/hooks/useAirDrawSession.ts:31-34`）。因此探针必须打 Vite dev server（`http://localhost:5173/?simulate=1&debug=1`）；在 `dist`/preview 上 `navTrace` 恒空、`__airdraw` 为 undefined。
- 无头启动：`C:/Program Files/Google/Chrome/Application/chrome.exe` + `['--enable-unsafe-swiftshader','--use-angle=swiftshader']`，viewport 1440×900。
- `page.addInitScript` 预置 `airdraw-preferences-v1`（tutorialDone/helloSeen）与 `airdraw-pinch-calibration`（contact 0.3 / release 0.37 / projection 0.3 / z 0.16），否则校准档案为 null 会让手势走默认路径而落不了笔。
- 探针实体放 `node_modules/airdraw-probe/*.mjs`：不进 `tsc -b`/build 的模块图，长跑期间可安全增删。**风险**：`npm ci` 会清空该目录，判据以 `docs/verification/phase14-coords.json` 与 `scripts/selfcheck.ts` 为准，脚本按下面各段重建。
- 本机 PATH 无 node/npm、各套件 APP_URL 默认端口不一致 → 见 `airdraw-regression-verification`。

## 1. 取证面：navTrace 环形缓冲

声明 `src/engine/DrawEngine.ts:115`，DEV 下每处理一帧 push（`:584-594`），上限 240 行后丢最旧。字段：`seq`（已处理结果计数）、`t`、`mode`、`palm`（`mapper.toScreen` 之后的屏幕 CSS px）、`view`（`canvasNav.state()`）、`wrote`（本帧是否写入视口）。

- 取尾部若干行读：手掌没动而 `palm` 仍在变 → 导航输入穿过了被自己改变的视口，即自激。
- `wrote:false` 的行不应改变 `view`。「识别输入不变、view 却在动」= 程序自放大；「识别输入本身在跳」= 上游跳动，两者处置完全不同。
- 单一写作者：会话基准由 `CanvasNavigation` 拥有并返回**完整**视口，由一处赋值回去（`src/engine/DrawEngine.ts:528-532` 的注释就是在案根因）。任何「先逆变换再反更新同一视口」都是简报禁止项。

## 2. 四段固定输入回放（浏览器）

按 `node_modules/airdraw-probe/p14replay.mjs` 的顺序执行，逐段给判据：

1. 先落一笔有墨（`canvas[aria-label="已完成的笔画"]`），否则第 5 段无从对比。
2. **恒定张开手掌 14 秒**：约 300 帧用于 engage，再 120 帧保持同一坐标（33ms 步进）。判据 `Math.hypot(ΔoffsetX, ΔoffsetY) === 0`，在案实测 0.00px。任何非零都是自激，不要用阻尼压小。
3. **100px 台阶**：先读 `navTrace` 尾部 `palm`，推 0.01 归一化单位差再读一次，标定 `pxPerUnit = |palm1.x - palm0.x| / 0.01`；按 `du = 100 / pxPerUnit` 走台阶并保持约 90 帧。判据：`palmStepPx ≈ 100.0` 且视口 `panDelta === 100.0`（多帧保持不得累加）。见 §3 的标定陷阱。
4. **去重**：合成一只有 21 个点的手，用**同一** `timestamp` 连调三次 `eng.handleResult(result)`。判据：`navTrace` 尾部 `seq` 只 +1（闸门在 `src/engine/DrawEngine.ts:904-909`，`result.timestamp <= lastProcessedStamp` 直接丢弃）。重复累计类症状一律先证明这一条。
5. **墨迹跟随**：导航前后各测一次 alpha 质心（`getImageData` 逐 2px 采样、`alpha > 8` 求均值）。在案实测质心位移 113.8px 对画布位移 116px，**残差 ~2.2px 是 2px 网格采样误差，不是滞后**；出现几十 px 量级差才是笔迹没跟上。3D 侧改用 `canvasContentBounds()`（`src/engine/DrawEngine.ts:679`）+ `docToScreen()` 求作品中心对比可视中心。

## 3. cover 标定陷阱（本项目最容易返工的一处）

`createCoverMapper`（`src/utils/coordinates.ts:27-53`）：`scale = max(screenW/videoW, screenH/videoH)`，屏幕 px = `offset + plane × video × scale`。所以 **1 归一化单位 ≠ 容器宽** —— 16:9 平面 cover 进 16:10 容器时，本项目 1440×900 容器 + 1280×720 视频得到 **1600 px/unit**。

把用户说的「100px」按容器宽折成 `100/1440` 单位，实测会跑出 111px，然后被误诊成灵敏度过高。永远按 §2 第 3 段从 trace 自标定；离线可用 `createCoverMapper(1280,720,1600,900).scale === 1600/1280` 这条 `verify:core` 用例反推同一个坑。

## 4. Node 纯数学回放（改过导航/视口数学先跑这条）

`scripts/selfcheck.ts:528-600` 的 `makeRig()`：直接组装 `ViewportController` + `CanvasNavigation`，以 33ms 固定步进喂 `nav.update({ now, handPresent, palmScreen, … , view, toDoc, toBase })` 并把 `effect.view` 写回，无浏览器、无 MediaPipe，结果完全确定。在案 5 条用例：静止不漂 / 100px 台阶不逐帧累加 / 双手缩放锚定两手而非屏心 / 双手同向平移 1:1 / `screen = zoom × doc + offset` 且平移只移动屏幕点。

跑法 `npm run verify:core`（rolldown → node）。新增用例要同步进 `docs/verification/*.json`，断言计数以该文件为准。

## 5. 3D 侧对应物

`node_modules/airdraw-probe/p14spatial.mjs` + `src/rendering/three/spatialNavigation.ts`：会话在 engage 帧冻结**起始相机**（position/quaternion/fov/aspect）与 rig 中心、距离、中点 NDC、间距，每帧用起始相机对固定参考平面（z=0 文档面）求射线交点做绝对基准 —— 禁止用已被本次手势移动过的相机重建基准（`spatialNavigation.ts:12` 注释）。两手间距直接调引擎注入精确值，避开手势驱动的取整。

判据：按住不动 drift=0；笔画数据在导航前后逐点相同；缩放距离落在 `InspectController.DIST_MIN`(9)/`DIST_MAX` 内（`src/rendering/three/inspectController.ts:29`）。会话期间必须置 `inspectController.direct = true`，否则弹簧会吃掉缩放（见 §7）。

## 6. 二分定位可疑块

仓库按子轮打快照：`cp src/... src/....bak-p15d`（在案有 `.bak-p15b/c/d/e` 一整批）。做法：打快照 → 只中和**一个**可疑块（一条 CSS 规则或一个分支）→ 复跑**同一个**探针的同一条判据 → 立刻还原。只有「中和后转绿、还原后转红」才算定位到唯一根因。

证据强度说明：快照纪律与「每个红点归到唯一根因」在 `docs/phase15-log.md` 有案；「注释掉可疑块再复跑探针」本身是从中归纳的通用手段，不是逐字记录。

命中/遮挡/层叠类红点不走这条：交 `airdraw-gesture-ui-red-triage`（`elementsFromPoint` 绘制栈 + `page.mouse.click` 对照实验）。

## 7. 已知签名（防回潮）

- 输入穿过当前视口：掌心先经 `planeToDoc`（= `screenToDoc(mapper.toScreen(raw))`）再被当屏幕坐标用 → 平移移动自己的输入，`navPanSpeed > 1` 时直接自激振荡；手不动但 offset 非零时「手掌屏幕位置」仍会变化，画布自己漂。
- 空间导航 busy 分支曾**每帧** `cancelInput()` → 一捏合笔画就被收尾，笔永远落不下。
- `inspectController.update` 在非 inspect 模式每帧把 `targetDistance` 拉回 13.5 → 吃掉手势缩放；会话期间靠 `direct` 关掉弹簧与惯性（`src/rendering/three/inspectController.ts:93-115`）。
- 拿墙钟和上一帧比：SwiftShader 下单帧可超 350ms/320ms 阈值 → 每帧判「刚回来的手」，重定位缓冲永远填不满、`strokes=0`（`docs/phase12-log.md`）。
- 「状态切换后第一次落笔被吞」（#72 家族：三维导航后 / FIST 解锁后 / SET_THEME 混合窗口）：见 `docs/phase14-log.md` §5 未结缺陷，本诊断里不要顺手放宽它来让自己的判据变绿。

## 8. 收尾

探针输出按 `docs/verification/phase14-coords.json` 的结构落盘（probes / twoD / threeD / openDefects，含 `inkFollowNote` 这类残差口径）。最终判定走 `airdraw-regression-verification` 的冷却单跑（在案 55/56，唯一红属 #72 家族）。交付文案里每条数字回代码定义处核实，见 `verify-doc-claims-against-code`。
