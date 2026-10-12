# AirDraw 第六阶段（Project Workspace）现状核对与交接

核对日期：2026-10-05。基线：`project-handoff-2026-10-05.md`（第五阶段开发前）与 `phase5-log.md`（第五阶段）。
本文只描述**当前代码的真实状态**，全部结论有命令或 `file:line` 证据；README 与日志中无法在代码里落实的说法会被点名——
**包括我自己写错的说法**，撤回记录见文末两张修复表之后的"这两条撤回"。
核对阶段不改代码；核对之后本轮又做了两批修复，逐条列在文末"本轮已修复（第一批 / 第二批）"，
最终回归数字与 30 分钟长跑见"最终回归"一节。

## 一句话结论

核对时的判断已经处理掉了：那轮核对发现**面向真人手的默认接触阈值比真实捏合更紧**（未校准用户几乎画不出笔画，
也就是"二维笔画无法使用 / 笔触不灵敏"的直接原因），并且工程数据完整性有几处会真的吃掉用户作品。
本轮两批修复把 P0 与主要 P1 关掉：默认阈值按真实比例手模型重定（0.22/0.34/0.24 + 5 帧多数投票）、
校准改为可跳过的邀请、相册打开不再覆盖当前工程、清屏尊重锁定、GLB 按祖先级联剔除、环绕不再占用 Undo 步骤、
长按确认在鼠标与键盘上也可完成；每一项都有对应断言，最终回归与 30 分钟长跑见文末两节。

**仍然成立的风险**：所有绿灯都来自合成手。0.22 的默认接触带宽（实测 d3 ≈ 0.20 已判为接触）需要真人矩阵复核，
这是下一轮的第一优先级，不是再改代码。

## 核对方式与结果

> 这是**动手之前**的基线运行，保留原数字作为"当时确实是这个状态"的证据；
> 本轮修复后的最终数字在文末"最终回归"一节。

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run build`（此前记录） | 通过；主包体积告警仍在 |
| `npm run verify:core` | 75/75 |
| `npm run verify:stage5` | 552/552 |
| `npm run verify:contact` | 13/13 |
| `npm run verify:stage6` | 127/127 |
| `APP_URL=http://localhost:5173/ node scripts/stage6-e2e.mjs` | 14/14 |
| `… scripts/stage6-creation-e2e.mjs` | 13/13（`docs/verification/stage6-creation-e2e.json` 里记录的 3 项失败已不复现，属陈旧产物） |
| `… scripts/stage5-e2e.mjs` | 13/13 |
| `… scripts/stage5-tutorial-e2e.mjs` | 12/12，但**重复连跑时出现过 `three cycles finish calibration` 失败**（时序敏感，见下文 P1-4） |
| `… scripts/stage5-worker-e2e.mjs` | 5/5 |

**关键事实：所有自动化都用合成手，而合成手的捏合几何恰好落在默认阈值之内**（`scripts/gestureDriver.mjs:40`
的 pinch 姿态归一化后 d3 ≈ 0.1446，默认 contact = 0.16）。因此"全绿"不能证明真人可用——下面的测量说明了差距。

## P0 根因：默认接触阈值比真实捏合更紧

用真实比例的 MediaPipe 世界坐标（掌宽 0.09 m、指尖抖动 4 mm、20 fps）驱动 `PinchContactDetector`
（默认 profile，`confirmFrames = 4`）：

| 拇指-食指间距（掌宽归一化） | 结果 |
| --- | --- |
| 0.13（用力顶紧） | 150 ms 后 HOLD，可落笔 |
| **0.18（指腹刚好相触）** | **永不 HOLD**，`state = NEAR`，提示"指尖接近，尚未确认三维接触" |
| 0.24（大手 / 离镜头远） | **永不 HOLD** |

而 `PinchContactDetector.ts:55` 在**未校准**时还会把半径进一步收紧为 `min(contact, 解剖估计)`；
`zGap ≤ 0.12`（`PinchContactDetector.ts:57`）对侧掌角度的真实捏合也常常不成立。
浏览器内实测：完美静止的合成捏合从捏合到 `penDown` 需要 **415 ms**（4 帧确认 + 光标收敛），
真实用户的手不会静止不动，`|approachSpeed| < 2.5` 与"4 帧全通过、一帧失败即清零"（`:63`）叠加后，
表现就是"要捏很久、经常没反应"。

后果链：`App.tsx:132` 让**首次用户必须先完成三次捏合校准**才能画（`calibrating` 直接进
`setDrawingAllowed`，`App.tsx:141/153`）；若用户改点"使用默认值"（`PinchCalibration.tsx`），
就落回上面那张表 → **画不出来**。个人校准本身是可靠的（同一模型下 5 组几何都能在 4–6 s 内产出
`contact ≈ 0.16–0.25` 的 profile），所以这不是校准算法的问题，而是**默认阈值 + 把校准设为强制前置**的组合。

## 规划功能核对

> 下表是**核对当时**的结论，保留原样作为证据。其中 ③④⑤⑧⑨⑩⑬⑭ 与"未完成"里的
> "旧相册作品不会变成工程"已在本轮修好（见文末两张修复表），⑥⑦ 经复核不成立、已撤回；
> ⑪⑫ 属于文档缺陷，也已补。

| 分类 | 代码核对结果 |
| --- | --- |
| **已完成（代码存在、已接线、有回归覆盖）** | 三模式与单 Canvas 连续过渡（`app/AppMode.ts`、`Scene3D.tsx:527`）；共享 Worker 推理与单摄像头流（`services/handTracking/WorkerHandProvider.ts`、`tracking.worker.ts`）；OPEN/NEAR/CONTACT/HOLD/RELEASE 五态与三次捏合校准（`PinchContactDetector.ts:3`、`PinchCalibrationSession.ts`）；`InputRouter` 单焦点 + 释放锁 + epoch（`InputRouter.ts:4-11`）；SceneObject 15 字段与 8 类型、schemaVersion 2 与 legacy 迁移（`project/types.ts:3`、`project/storage.ts:5-26`）；IndexedDB `airdraw-projects`（projects/snapshots 双库）+ 保存前快照 + `openProject(id,true)` 恢复（`storage.ts:27-31`、`ProjectPanel.tsx:45`）；1800 ms 防抖自动保存与状态文案（`useProjectBridge.ts:36-37`）；图层面板选择/重排（按住 ⋮ 500 ms 拖动）/显隐/锁定/复制/重命名/长按删除/编组（`ProjectPanel.tsx:25-28,43`）；CommandHistory 100 步并接管 `engine.undo/redo`（`CommandHistory.ts:5`、`DrawEngine.ts:331-337`），拖动按"松手才提交"合并（`ProjectStage.tsx:34`、`ModelDock.tsx:11`）；几何识别 line/circle/ellipse/rectangle/triangle/arrow/star + 850 ms 空闲分析 + 可撤销接受（`recognition/geometry.ts`、`RecognitionSuggestion.tsx:11,15`）；Make 3D 四种方式 + 160 ms 预览 + 原始笔迹自动锁定（`project/geometry.ts:19-35`、`ProjectPanel.tsx:34,41`）；GLB/JSON/WebM 导出与 2D PNG/SVG（`project/export.ts`、`CanvasDock.tsx:12`、`ProjectPanel.tsx:46`）；双手缩放/掌面旋转/抓取不跳变与丢失冻结（`ProjectStage.tsx:33-55`、`model/handTransform.ts`）；Snap 关闭/网格/15°/中心（`ModelDock.tsx:13`）；教程与 Guide 已扩到三模式。 |
| **部分完成** | 识别文字：`RecognitionProvider` 接口与注册表齐备，但只有回显字符串的 `MockRecognitionProvider`，且仅在开发者模式的设置里可设（`TrackingTuning.tsx:4,9`）。`textShapes.ts` 是系统字体的位图轮廓追踪，**运行时不可达**（`geometry.ts:16` 要求 `type==='solid' && text`，而全代码库没有任何地方创建带 text 的 solid；识别到的 text 被写进 `stroke2d`，`RecognitionSuggestion.tsx:15`）。工程缩略图会保存、会校验，但**从没有任何界面读取它**。`Outline` 只是半径 ×0.15 的 Tube（`geometry.ts:33`），`Relief` 是挤出后按到中心距离缩放 z（`:28-31`）。相机为近似正交；双 HDR 环境主题混合未实现。 |
| **未完成** | `light` / `camera` / `background` 三种 SceneObject 类型无生产者、无渲染分支（`types.ts:3`、`geometry.ts:41`、`ProjectStage.tsx:65`）。`migrateProject` 只认 `schemaVersion ≤ 2`，没有 `SCHEMA=3` 与升级链（`storage.ts:4,7`），`migrate()` 与 `migrateArtwork()` 无调用者 → **旧相册作品不会变成工程**。工程 UI 无 Open/Save As 语义区分（两者都走 `save(true)`，无命名输入）、无重开上一个工程、无退出前 flush（全代码库没有 `beforeunload`/`pagehide`/`visibilitychange`）。图层面板无变换数值编辑。~~无对象组之外的多选手势~~ **复核后不成立**：`ProjectStage.tsx:49` 在抓取瞬间读副手关键点（四指指尖比各自 PIP 更远离腕部即判为张掌），据此 `workspace.select(id, multi)` 加选，编组与批量变换都走这条路；真正缺的是**手势级断言**——代码在读，测试没在证，记入测试缺口。真实人手 40/70/100 cm、左右手、肤色、光照、遮挡、交叉的标定矩阵；长时显存/FPS 曲线（现有 soak 是 SwiftShader + 合成捏合夹具，`docs/verification/stage6-soak.json` 自述 scope）。 |
| **存在问题** | ① **默认接触阈值不可用于真人**（见上表）。② ~~2D 工具是空按钮~~ **已复核为不成立**：`canvasTool` 与 `canvasPressure` 确实被读取（`DrawEngine.ts:607,663` → `freehand.ts:4,6`：marker ×2 宽、highlighter ×3 宽且 alpha 0.32、压感切换 thinning/simulatePressure、橡皮走 `removeNear`）。剩下的只是"四种工具的差异是否够认得出"与"marker 没有半透明"这类口味问题，以及**这些差异目前没有任何回归断言**。③ 相册"打开作品"会污染当前工程：`App.tsx:378-389` 调 `engine.loadArtwork()` 但未置 `projectCapturePaused`，桥接层于是把它当作新墨并 `captureStrokes` **整体替换 stroke2d/stroke3d 对象集**，1800 ms 后自动保存覆盖工程（`useProjectBridge.ts:26,37` → `workspace.ts:24-30`）。④ "清空"无视锁定：`engine.clear()` 清空 store 后由桥接层重建对象表，**被 Make 3D 锁定的原始笔迹会被连带删除**（`DrawEngine.ts:433-441`）。⑤ `useProjectBridge.ts:35` 的 `o.stroke!` 无保护，而 `storage.ts:14` 允许 `stroke2d` 不带 stroke（legacy 迁移分支或手工 JSON 导入即可造出）→ `CanvasPlane`/`freehand` 随后在 `s.segments` 上抛错。⑥ ~~GLB 忽略对象变换~~ **复核后改口径**：`geometry.ts:38` 的 `buildObject` 会写入 position/quaternion/scale，`buildProject:41` 也按 `parentId` 重建层级，因此对象变换本来就是进得来的；真正的偏差是 `geometry.ts:41` 只按 `o.visible` 过滤，而场景用 `objectGraph.isVisible` **级联**祖先可见性 → 隐藏父组下的可见子对象会被重挂到根节点并导出。⑦ ~~WebM 录制器在生产构建找不到 canvas~~ **复核后不成立**：`dataset.airdrawCanvas` 在 `Scene3D.tsx:506` 于 `import.meta.env.DEV`（`:508`）**之外**设置，生产构建同样能选到。⑧ 每次相机环绕都会产生一条可撤销的工程修改并触发自动保存（`App.tsx:78`）。⑨ 画布纸面每帧 O(N²) 计算可见性（`CanvasPlane.tsx:15,21` 两次 `strokesFor`，内部 `objects.find` 在 `flatMap` 里）。⑩ MODEL_CONTROL 下二维墨可能双份渲染（`ProjectStage.tsx:22` 与 `CanvasPlane.tsx:16-17` 同时画）。⑪ `docs/phase6-log.md` 被 README 两处链接但不存在（本文补齐该职责）。⑫ `docs/project-schema.md:7` 把旧库写成 `airdraw-gallery`，实际是 `airdraw`（`storage/artworks.ts:16`）。⑬ 长按删除按钮在鼠标路径上完全无效（`GestureButton.tsx:4-5` 有 `holdMs` 时不绑 `onClick`，`GestureInteractionManager.ts:413` 直接 return）。⑭ 图层行只能加选不能减选/单选（`ProjectPanel.tsx:27` 硬编码 `add=true`）。 |

## 技术栈与模块地图（当前）

React 19 + TypeScript + Vite 8 + Three.js/R3F + drei/postprocessing + `motion`（DOM 与场景共用一套动效值）+
`perfect-freehand`（2D 墨迹轮廓）；MediaPipe Tasks Vision Hand Landmarker 跑在 **module worker** 里
（`services/handTracking/tracking.worker.ts`，Vendored UMD 引导由 Blob ESM 适配）。

- 输入链：`useHandTracking` → `HandTrackingResult` → `DrawEngine`（主手/平滑/接触/两种笔迹）→
  `PinchContactDetector` → `InputRouter`（模式与焦点）→ `GestureInteractionManager`（UI 语义）。
- 应用状态：`app/appState.ts`（reducer）+ `app/AppMode.ts`（HOME/三模式/TRANSITION）+ `interaction/InputRouter.ts`。
  注意 `projectPanel` 是 `App.tsx:104` 的裸 `useState`，**不在 reducer 里**，所以 `canDraw()` 与 selfcheck 的路由断言覆盖不到它。
- 工程层：`project/{types,workspace,storage,objectGraph,geometry,conversionSource,textShapes,builtin,sessionSnapshot,CommandHistory,export,importModel,useProjectBridge}`。
- 渲染：`rendering/three/{Scene3D,ProjectStage,ModelStage,CanvasPlane,LiveTube,ParticleHello,materials,inspectController,framing,capture}`、`rendering/canvas2d/{freehand,polyline}`。
- 界面：`components/{ModeSwitcher,SpatialDock,CanvasDock,ModelDock,SurfaceDock,ProjectPanel,RecognitionSuggestion,CreationTutorial,PinchCalibration,TrackingTuning,GestureButton,…}`。
- 设计令牌：`design/motion.ts`、`styles/tokens.css`、`styles/workspace.css`。

## 启动与调试入口

```bash
npm install
npm run dev            # http://localhost:5173（摄像头要求 localhost/https）
npm run typecheck && npm run build
npm run verify:core && npm run verify:stage5 && npm run verify:contact && npm run verify:stage6
APP_URL=http://localhost:5173/ node scripts/stage6-e2e.mjs
APP_URL=http://localhost:5173/ node scripts/stage6-creation-e2e.mjs
APP_URL=http://localhost:5173/ node scripts/stage5-tutorial-e2e.mjs   # 校准+教程
APP_URL=http://localhost:5173/ node scripts/stage5-worker-e2e.mjs     # 真 MediaPipe + 假摄像头
APP_URL=http://localhost:5173/ node scripts/e2e.mjs                   # 第四阶段产品回归（仍在使用）
```

`?simulate=1` 合成手、`?debug=1` 开发者模式、`?mirror=0` 关镜像。
运行时诊断：`window.__airdraw.inputDiagnostic`（mode / hint / contact 全指标 / router / gates / recentFrames）、
`window.__airdrawWorkspace.project`、`window.__airdrawInteraction.snapshot`。
**排查落笔问题先读 `inputDiagnostic.hint` 与 `contact`，它直接指出被哪一道闸拦住。**

## 本轮已修复（2026-10-05 晚，含测量）

| # | 问题 | 改动 | 证据 |
| --- | --- | --- | --- |
| 1 | 默认接触阈值比真实捏合更紧，未校准用户画不出 | `DEFAULT_CONTACT` 距离 0.16→0.22、释放 0.26→0.34、投影 0.18→0.24；**深度阈值保持 0.12**（实测真实捏合的 zGap≈0.05，绑住人的从来是距离而不是深度） | 真实比例手模型：0.13/0.18 掌宽间距 150 ms 落笔；0.24/0.30/0.40/0.75 一律不落笔 |
| 2 | 一帧噪声就清零，导致"捏很久没反应" | 确认改为**最近 5 帧多数通过**（4/5）；`approachSpeed` 改用 EMA 平滑并把误触上限从 2.5 放宽到 6（逐帧深度噪声本身就有 ~2/s） | `verify:stage5` 732/732（含新增 180 条"指腹相触必须落笔"断言） |
| 3 | 首次启动被强制校准挡住，画不出任何东西 | 校准改为**可跳过的邀请卡**（`prefs.calibrationSkipped`），首启直接进教程且教程里就能落墨；设置里保留可视化重校准 | `stage5-tutorial-e2e` 22/22，含"首启直入教程""未校准默认值能出墨""邀请不吞掉笔" |
| 4 | **设置/说明书/作品库面板被顶到视口外**：`.stage` 只有一个 auto 行，行高被内容撑到 1872 px，720 px 的面板"居中"到 top=576，于是滚动手势的落点根本在视口之外（Δ0），下部条目永远点不到 | 三个覆盖层统一 `grid-template-rows: minmax(0,1fr)` + `.inner { min-height:0 }` | 实测面板 rect 由 `[576,720]` 变为 `[40,720]`；随后设置项捏合与滚动断言全部转绿 |
| 5 | 开发者模式下日夜切换点不到 | DebugPanel 与主题按钮同在 `top:16/right:16` 且面板 z=48 压住按钮 → 面板下移到 `top:78` | 探针 `coveredBy` 从关闭按钮变为按钮自身 |
| 6 | 手势拖动滚不动长列表 | 新增 `GESTURE_SCROLL_GAIN = 2.4`：平滑光标只走手部位移的一部分，1:1 映射等于永远滚不到底 | 单次 260 px 捏合拖动滚动量由 ~60 px 提升到 ~350 px |
| 7 | 测试自己把产品测成假红/假绿 | `ensureDock` 改读**状态机真值**（新增 DEV 句柄 `window.__airdrawApp`，不再拿 opacity 猜开关）；拖动先等悬停成立再捏合；滚动抓取点对准面板边缘空白；说明书章节按"在滚动口内"挑选而不是按序号；undo/设置项允许重试 | 第四阶段套件 53/53；此前同一套件在改动前只能跑到 15/53 |

**验证汇总（第一批当时的数字；第二批之后的最终结果见文末"最终回归"）**：`verify:core` 75、`verify:contact` 13、`verify:stage5` 732、`verify:stage6` 127；
浏览器 `e2e` 53/53、`stage5-e2e` 13、`stage5-tutorial-e2e` 22、`stage5-worker-e2e` 5、`stage6-e2e` 14、`stage6-creation-e2e` 13。
`stage6-creation-e2e` **单独运行 13/13 通过，但与另外四个套件连跑时 3 项超时**：五个无头 Chrome 抢 CPU 时检测帧率跌到个位数，
捏合还没确认完页面就换帧了。这是当前手势回归的已知脆弱点，写在这里以免下一个人把它当成产品缺陷或悄悄删掉。

## 30 分钟工作区长跑（2026-10-05 10:11–10:43 UTC 实测）

> 口径说明：这一轮跑的是**第一批（P0 落笔）修复后的构建**，不含下面第二批改动；
> 第二批之后的长跑另见文末"最终回归"。

`SOAK_MS=1800000 APP_URL=http://localhost:5173/ node scripts/stage6-soak.mjs` → **PASS**，
1 800 012 ms、**179 次三模式轮转**（每 10 s 一次）、**179 个采样点、0 条运行时异常**，
每 30 次切换做一次"保存→重新打开→对象数必须一致"的往返检查（全部通过）。
夹具：100 条由真实接触轨迹生成的笔迹对象 + 2 个自包含 GLB 模型 = **102 个工程对象**，全程不变。

| 指标 | 结果 |
| --- | --- |
| 同一个 Canvas | 179/179 采样都是同一个 DOM 节点，`canvas[data-airdraw-canvas]` 数量始终 1 |
| WebGL 上下文丢失 | 0 |
| geometries | 稳定 **123**（除第 1–6 个采样还在挂载） |
| textures | 稳定 **5** |
| draw calls（按当次所处模式） | Canvas Draw **5** · Spatial Draw **10** · Model Control **105** |
| JS heap | 75.7–109.3 MB 区间往复，**最后一个采样 76.8 MB 低于第一个 106.5 MB** |

没有单调增长的几何体/纹理/堆，所以这轮没有对象、材质或 GPU 资源泄漏；
`heap` 的锯齿是渲染与自动保存的正常起伏。

**两个诚实的边界**：① 105 次 draw calls 只出现在 Model Control —— 那里每个工程对象各自成 Mesh，
二维墨的"每 24 笔合并一块"优化没有覆盖到这条路径（Spatial Draw 是 10）。30 分钟内不增长，
但这是 Model Control 的扩展性上限，记入 P2。② 本轮依旧是 headless SwiftShader + 合成手，
不能据此宣称真实 GPU 60fps 或真人接触准确率。

## 本轮已修复（第二批：工程数据完整性、导出与可达性）

| # | 问题 | 改动 | 证据 |
| --- | --- | --- | --- |
| 8 | 相册"打开作品"会把当前工程冲掉：`engine.loadArtwork()` 触发笔画捕获，桥接层把它当成新墨**整体替换** stroke2d/stroke3d，1800 ms 后自动保存覆盖工程 | 打开前先把当前工程落盘（失败就拒绝打开并说明原因），再把作品**转成它自己的工程**（`projectFromArtwork`：按 stroke.mode 分成 stroke2d/stroke3d，带主题/纸张/相机/缩略图），交 `workspace.open` 走既有桥接链路 | `verify:stage6` 新增"an artwork opens as a project of its own"；`e2e` 新增"opening a piece leaves the stored project alone" |
| 9 | "清空"无视锁定：Make 3D 的原稿被一起删掉，撤销 Make 3D 后无处可解锁 | `captureStrokes` 把同类型**锁定对象原样保留**（并从引擎笔画里排除它们，避免重复），无变化时不再写历史 | `verify:stage6` 3 项（清屏保留原稿 / 新墨不复制原稿 / 未变化的墨不产生历史）；`stage6-creation-e2e` "clearing the canvas keeps the locked original" |
| 10 | `stroke2d` 没有 stroke 时 `o.stroke!` 在渲染处抛错 | `migrateProject` 直接拒绝"笔迹对象缺少笔迹数据"（进入恢复快照路径），桥接层同时改成 `flatMap` 过滤，双保险 | `verify:stage6` "stroke object without ink is rejected" |
| 11 | 关标签页会丢最后一次防抖内的改动 | 自动保存抽出 `commit()`，`pagehide` + `visibilitychange` 立即冲刷 | 结构性修复（IndexedDB 异步写入，尽力而为） |
| 12 | GLB 把**隐藏父组下的可见子对象**导出来（场景里祖先不可见会级联隐藏，导出却按 `o.visible` 单判） | `buildProject` 改用 `isVisible(o, project.objects)` 级联判定 | `verify:stage6` 3 项：隐藏组不泄漏 / 可见子对象保留 / 组矩阵进入导出（world x = 3） |
| 13 | 每次环绕视角都产生一条可撤销的工程修改，转几十下就把真实编辑挤出 100 步栈 | 新增 `workspace.camera()`：写进工程、置脏、**不入 Undo 栈**；`environment()` 仍留给主题/纸张这类真编辑 | `verify:stage6` "orbiting the view is not undoable" + "still marks the project for saving"；`stage6-creation-e2e` 同名单 |
| 14 | 只有"长按确认"的按钮在鼠标和键盘上**完全点不动**（`holdMs` 时既不绑 onClick 也没有指针路径） | `GestureButton` 增加 pointer/keyboard 按住：同一个计时器、同一个确认环（CSS `@keyframes ad-pointer-hold` 覆盖内联 dashoffset），抬起/移出/失焦即取消 | `stage6-creation-e2e`："a short mouse press does not delete" + "a mouse hold completes the delete confirmation" |
| 15 | 图层行只会加选、不会减选 | `workspace.toggleSelection()`（行内再点一次取消）+ `clearSelection()` + 面板"取消选择"按钮（无选中时禁用） | `verify:stage6` 3 项 + `stage6-creation-e2e` 2 项 |
| 16 | 二维四种工具确实接了线，但**马克笔与钢笔看不出区别**，而且没有任何断言 | 抽出 `paintAlpha(tool)`：笔 1 / 马克 .72 / 荧光 .32 / 橡皮 1，`paintPaper` 与 SVG 导出共用 | `verify:core` 新增 5 项：宽度阶梯（笔<马克<荧光）、闭合轮廓落在纸面内、透明度分层、压感开关真的改变轮廓面积 |
| 17 | MODEL_CONTROL 下同一份二维墨被画两遍（纸面纹理 + 每对象一个 Mesh） | 纸面纹理透明度随 `MODEL_CONTROL` 权重淡出，模型视图里只保留对象自身的 Mesh | 结构修复；`stage6-e2e` / `e2e` 回归无退化 |
| 18 | 纸面每帧 O(N²)：`strokesFor` 里每笔都 `objects.find`，而且一帧调两次 | 桥接层按 workspace emit 建立 `stroke→object` 索引；`CanvasPlane` 每帧只取一次笔画数组 | 结构修复（100 笔纸面的重绘从 N² 次查找降为 N 次） |
| 19 | 放宽默认阈值后，测试夹具里的"接近但未接触"姿态其实已经**进入接触带**（d3 ≈ 0.20 < contact 0.22），stage5 的"30 次接近不落笔"因此真实地测到了一条笔画 | `gestureDriver` 的 `near` 位移 .044 → .07（实测 d3 0.199 → 0.316），并把测量过程写进注释 | 逐档实测：.025→HOLD、.044→HOLD、.055/.07/.09→NEAR（每次都从张开手起量，避免迟滞带把 HOLD 带过来）；`stage5-e2e` 13/13 |
| 20 | 表面材质 Dock 的四个按钮（光滑/木材/金属/石材）**图标全是同一个加号**，只能靠文字区分 | `GestureButton` 的图标分支补 `surface-*`：圆 / 木纹 / 高光斜线 / 石点 | 生产构建截图 `docs/verification/production-smoke.png`（四个图标已不同） |
| 21 | 摄像头预览里两条文字**叠在同一行**：DOM 的"模拟手部信号，未打开摄像头"贴在底部，而 canvas 自己在底部画"手势 · 左/右手" | `.notice` 改为顶部遮罩（渐变方向跟着翻），canvas 的手势标签继续留在底部 | 裁剪截图 `docs/verification/camera-preview-crop.png`：上下分离，互不遮挡 |

**生产构建冒烟**（`npm run build` + `vite preview` + headless Chrome，`dist` 而非 DEV）：控制台零错误、
2 个 canvas 中恰好 1 个带 `data-airdraw-canvas`（**这就是撤回 ⑦ 的实测依据**：录制器在生产里选得到画面）、
`__airdraw` / `__airdrawWorkspace` / `__airdrawApp` 三个调试句柄都不存在、调试面板不渲染。
回归套件本身跑不了生产构建（它们要读 DEV 全局），所以这一步单独做。

**这两条撤回**（写日志时我没核实，现在按代码更正）：⑥ "GLB 忽略对象变换"（`buildObject` 一直被调用，变换是进得来的，真正的问题只是祖先可见性）、⑦ "WebM 在生产构建选不到 canvas"（`dataset.airdrawCanvas` 设在 `import.meta.env.DEV` 之外）。

## 最终回归（两批修复之后，同一份代码重跑）

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run build` | 通过；`index.js` 1,836.57 kB / gzip 533.93 kB（主包体积告警仍在，P2） |
| `npm run verify:core` | **80/80**（新增 5 条二维工具断言） |
| `npm run verify:contact` | 13/13 |
| `npm run verify:stage5` | 732/732 |
| `npm run verify:stage6` | **143/143**（新增 16 条：锁定原稿 / 缺笔迹拒绝 / 视角不入栈 / 相册转工程 / GLB 祖先可见性与矩阵 / 图层选择切换） |
| `node scripts/e2e.mjs` | **56/56**（新增 3 条：相册作品开成独立工程 + 库里原工程一笔不少） |
| `node scripts/stage5-e2e.mjs` | 13/13 |
| `node scripts/stage5-tutorial-e2e.mjs` | 22/22 |
| `node scripts/stage5-worker-e2e.mjs` | 5/5 |
| `node scripts/stage6-e2e.mjs` | 14/14 |
| `node scripts/stage6-creation-e2e.mjs` | **20/20**（新增 7 条：清屏保留原稿 / 环绕不入栈 / 图层行选中 / 再点取消 / 鼠标短按不删 / 鼠标长按删除 / 取消选择控件禁用态） |
| `SOAK_MS=1800000 node scripts/stage6-soak.mjs` | **PASS**，见下 |

### 最终 30 分钟长跑（11:29–11:59 UTC，第二批之后的构建）

1 800 011 ms、**179 次三模式轮转**、179 个采样点、**0 条运行时异常**、每 30 次切换的
"保存→重新打开→对象数一致"往返全部通过；102 个工程对象全程不变。

| 指标 | 结果 | 与第一批那轮（10:11–10:43）比较 |
| --- | --- | --- |
| 同一个 Canvas / 上下文丢失 | 179/179 同一个 DOM 节点、始终 1 个 `data-airdraw-canvas`、丢失 0 | 一致 |
| geometries / textures | 稳定 123 / 5（前 6 个采样还在挂载） | 一致 |
| draw calls（按所处模式） | Canvas 5 · Spatial 10 · Model Control 105 | 一致（第二批没改变这条开销结构） |
| JS heap | 76.5–110.9 MB 往复，first 91.2 → **last 80.2** | 同样无单调增长 |

两轮长跑口径相同（headless SwiftShader + 合成手 + 接触生成的轨迹夹具），
所以能说的是"没有对象/纹理/堆泄漏、切换与自动保存在 30 分钟内不劣化"，
不能说的是真实 GPU 帧率或真人接触准确率。

**生产构建冒烟**（`npm run build` + `vite preview` + headless Chrome，跑的是 `dist`）：控制台零错误；
两个 canvas 里恰好一个带 `data-airdraw-canvas`（录制器要选的就是它，生产同样选得到）；
`__airdraw` / `__airdrawWorkspace` / `__airdrawApp` 三个调试句柄都不存在；调试面板不渲染。
回归套件本身跑不了生产构建（它们要读 DEV 全局），所以这一步单独做，截图见
`docs/verification/production-smoke.png` 与 `docs/verification/camera-preview-crop.png`。

**本轮自己又踩了一次老规则**：30 分钟长跑已经启动之后，为了同步说明书文案改了
`src/guide/content.ts`——它只是数据，但同样在模块图里，HMR 立刻刷新页面，那一轮长跑当场作废。
这是同一条规则第三次付出代价（前两次是 `src/**` 的逻辑改动）。规则不变：**先改完、先构建，再启动长跑**。

## 下一步优先级（渐进，不重写架构）

**已经做完的**，列在这里防止下一个人重复劳动：

- ~~P0 让真人能落笔~~：默认 profile 0.22/0.34/0.24/0.12 + 5 帧多数投票 + EMA 速度闸；校准改为可跳过的邀请；验收夹具换成带噪声的手模型（第一批，表 #1–#3、#19）。
- ~~P0 工程数据完整性~~：相册打开成为独立工程、清空尊重锁定、缺笔迹的对象被拒绝、`pagehide` 冲刷（第二批 #8–#11）。
- ~~P1 2D 工具与图层可达性~~：`paintAlpha` 分层 + 5 条断言、图层行可取消选择、长按确认可用鼠标/键盘（第二批 #14–#16）。
- ~~P1 导出与性能~~：GLB 祖先级联可见性、环绕不入 Undo、纸面索引化与 MODEL_CONTROL 去双份（第二批 #12、#13、#17、#18）。

**剩下的，按优先级：**

1. **P1 真实人手矩阵。** 现在所有绿灯都来自合成手；`contact`/`release`/`projection` 三个数需要在
   40/70/100 cm、左右手、不同肤色与光照下各测一组"张开—接近—真接触"的 d3 分布，确认
   **0.22 不会把"接近"读成"接触"**（本文实测边界：d3 0.20 已经算接触）。真人走查还要覆盖教程完成率、
   误画率与"未捏合却出墨"的零容忍检查。
2. **P1 识别闭环。** 让 `solid + text` 真正可达（新增"文字对象"入口，复用面板里已有的屏幕字母键盘），
   或者删掉 `geometry.ts:16` 的分支；识别置信度改为从几何拟合度算出来（现在 `RecognitionSuggestion.tsx`
   对文字用常量 0.8）；`segments.flat()` 前按段分组，避免断笔被当成一笔识别。
3. **P1 第六阶段产品面。** 统一 Workspace 布局（顶部项目名+保存状态、底部三模式、侧边上下文 Dock、按需面板）
   的玻璃展开动效与行高排版；长名称省略+悬停看全名；反馈优先用对象自身动画而不是 Toast；
   教程补"第一次 Make 3D"闭环（识别→转换→双手变换→保存），并同步 `USER_GUIDE.md`。
4. **P2 Model Control 的绘制开销。** 30 分钟长跑显示：Canvas Draw 5 / Spatial Draw 10 / **Model Control 105**
   次 draw calls —— 工程对象在模型视图里各自成 Mesh，二维墨的 24 笔合并不覆盖这条路径。
   100 对象不增长所以不是泄漏，但对象数继续翻倍时会先撞到这里。
5. **P2 数据结构升级链。** `SCHEMA=3` + 迁移链（当前 `migrateProject` 只认 ≤2，未来字段没有升级路径）；
   旧相册作品的**批量**迁移（现在只有"打开某一张时"才转成工程）；工程缩略图目前只有写入、没有任何界面读取它。
6. **P2 收尾。** SVG 纳入工程导出或明确只导 2D；`Outline`/`Relief` 要么名副其实要么改文档说法；
   测试 Chrome 路径可配置；主包体积拆分；`?simulate=1` 之外的键盘/读屏可达性。
7. **P2 测试缺口（有代码、没证据的地方）。** 副手张掌多选（`ProjectStage.tsx:49`）没有手势级断言；
   `projectFromArtwork` 生成的工程缩略图仍然没有界面读取；WebM 只断言"导出时没带摄像头画面"，
   没有断言录到的内容确实是刚才那一笔；GLB 只校验了魔数与版本，没有解析回场景比对三角形数。
   这四条各需要一个断言，而不是各需要一次重构。

沿现有 reducer / DrawEngine / InputRouter / workspace 接口渐进修改：**先保护已可用的 3D 笔迹、作用域隔离与工程持久化**，
再动阈值与接线；任何"看起来做了"的按钮都必须有一条读它的代码和一条断言它的测试。

沿现有 reducer / DrawEngine / InputRouter / workspace 接口渐进修改：**先保护已可用的 3D 笔迹、作用域隔离与工程持久化**，
再动阈值与接线；任何"看起来做了"的按钮都必须有一条读它的代码和一条断言它的测试。
