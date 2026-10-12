# 第十二阶段交接：无限画板、玩具返回与整体验收

日期：2026-10-07/08。仍是基于现有架构渐进修改：粒子开场、大厅、教程、二维/三维绘画、模型操控、PlayLab 五个玩具、手势识别、语音、日夜主题、中英切换、作品保存全部沿用；未新增任何依赖（Excalidraw / use-gesture / Motion / MediaPipe 示例只作为读过的参考，不进运行时）。项目不是 Git 仓库，因此每条结论都配一个可复跑的套件或探针。

本轮先按用户报的具体缺陷动手，再进入本阶段第一优先级（画板平移与双手缩放）。

## P12-0 日间模式「小玩具缺失找不到」

复现（`node_modules/airdraw-probe/dayhub.mjs`，`?simulate=1`，theme=day，1440×900）：

| 读数 | 修前 | 修后 |
| --- | --- | --- |
| `.card` 背景 | `rgba(0, 0, 0, 0)`（完全透明） | `rgba(255, 255, 255, 0.58)` |
| 卡片中心像素 | `[254, 254, 254, 243]`（白画在白底上） | `[28, 34, 47, 231]` |
| 页面底色 | `rgb(238, 241, 245)` | 同 |

根因有两条，都是「只按夜间设计」：`PlayLab.module.css` 的 `.card` 从来没有背景，夜间靠深色页面衬出来；`LabHub.tsx` 的 `Preview` 用 `rgba(255,255,255,0.95)` 白核与固定紫色画预览，在日间近白卡片上等于不画。所以卡片不是被隐藏，而是**在日间完全没有可见表面**，用户看不到有哪五个玩具。

修法：卡片改用共享玻璃配方（`className={styles.card} ad-glass`，随主题混合的 `--ad-glass-bg`）；预览订阅 `themeController`，墨色取当前主题的 `text`/`accent`（`usePreviewInk`），于是夜间是亮核、日间是深核；相邻卡片透明度从 `1-depth*0.55` 放宽到 `0.42`，日间也能读清标题。同时删掉 `GestureButton` 有 children 时重复渲染 label 造成的「回到画布」出现两次，并给 `lab-back`/`lab-leave`/`lab-retry` 补上真实图标（此前它们落到默认「+」，看起来像同一个按钮）。

## P12-1 无限画板：文档坐标与视口分离

### ViewportController

`src/rendering/canvas2d/viewport.ts` 重写为一个视口控制器，约定 `screen = base(doc) × zoom + offset`：

- `base` 每帧从容器映射采样三点（`p00/p10/p01`），摄像头镜像、视频宽高比、容器偏移、浏览器缩放与 DPR 全部留在 `base` 里，控制器只管 zoom/offset；
- `docToScreen` / `screenToDoc` 严格互逆（自检断言 `screen and document agree in both directions at any zoom`，四种 zoom×offset 组合，误差 1e-6）；
- `zoomAt(anchor, factor)` 用 `offset₁ = anchor − base(doc₀) × zoom₁` 保锚点；`ZOOM_LIMITS` 0.2–8，越界直接返回 false（不产生「无限放大」）；
- `fitRect(null)` 在空画布上退化为原始纸张范围（`zoom≈0.9`），不出现除零；
- `remember()/restore()` 支撑「回到上次视图」；
- 点阵 `dotLayout(zoom, density, opacity)` 的 `spacing` 是文档单位（跟手平移），`radius` 是屏幕像素（任何缩放都是同一个点大小），极端缩放分级点距（×2 / ÷2），超过 20000 点直接不画。

`scripts/selfcheck.ts` 相应重写：`npm.cmd run verify:core` **ALL CHECKS PASSED**。

### 渲染与输入走同一个视口

- `DrawEngine` 持有 `canvasNav`（控制器）与 `canvasNavigation`（会话状态机），新增 `docToScreen` / `planeToDoc`；二维笔迹仍然存文档坐标（沿用既有 0..1 平面单位），**平移缩放不修改任何对象数据**。
- 手部输入先经容器映射得到画布容器 CSS 像素，再 `screenToDoc` 转文档坐标，滤波/落笔/橡皮擦/点阵全部在文档空间；`clamp01` 只在三维模式保留，二维不再被纸张边界钉住（可无限外扩）。
- 橡皮半径按缩放换算（`ERASE_RADIUS_PLANE / zoom`），屏幕上始终是指尖大小。
- `DrawingSurface` 被真正挂上（此前它是从未被渲染的死代码）：三层 canvas（点阵 / 历史 / 正在画），`CanvasPlane` 在 DOM 层接管二维墨迹时隐藏自身贴图平面，避免同一笔迹画两遍且差一像素。

### 手势会话状态机

`src/interaction/canvasNavigation.ts`（新增）：`idle → pan | zoom → frozen → idle`，全部用真实毫秒而不是帧数：

- 单手张掌（`openness ≥ 0.62`）稳定 240ms 建立平移，掌心用 `palmCenter`（手腕+指根），位移是**相对位移**，不累加误差、无长惯性；
- 双手张掌建立缩放，锚点是两手掌心中点，两手同时平移时先平移后缩放；间距用统一屏幕像素的 `handsDistancePx`，不是两只手各自 `worldLandmarks` 相减；
- 第二只手进场时平移会话显式让位（`second hand arrived`），避免配对未稳定期间掌心在两手间跳，导致画板左右抽动；
- 收手/握拳/捏合/UI 捕获 → 结束并 `cancelInput()` + `remember()`，过期捏合、速度、捕获缓冲清空，重新捏合才新建笔画；
- 手丢失先 `frozen`，超 700ms 才彻底复位，不沿用旧基准、不自动落笔。

实测（`node_modules/airdraw-probe/canvasnav.mjs`、`canvaspen.mjs`）：单手平移 `panOffset` 与手掌位移一致；双手缩放 `zoom 1 → 1.4` 且 **anchorDrift = [0, 0]**（两手中点对应的文档点分毫不动）；缩放后捏合落笔 `expect [0.466, 0.561]` vs `got [0.469, 0.563]`；张掌在画布内不再呼出工具栏（工具栏改由顶栏「工具」入口与语音打开）。

### 可见入口与命令

- 顶栏新增「工具」和「暂停手势」两个入口；`PAUSE_GESTURES` 走 `engine.setInputsPaused`，暂停时直接丢弃手部帧（摄像头不关，鼠标/键盘/语音照常）。
- 「更多」面板在二维模式提供 显示全部 / 恢复100% / 上次视图（`VIEW_FIT` / `VIEW_RESET` / `VIEW_LAST`）。
- 语音新增：放大一点、缩小一点、恢复百分之百、显示全部、回到上次视图、返回画布、暂停手势、继续手势，全部经同一条 `AppCommandBus` 与同一个 `canvasNav`，不另开一套视口状态。
- 设置新增 `panSpeed` / `zoomSensitivity` / `dotDensity` 三个 schema 项（范围、步长、默认、格式只写一处），`panSpeed`/`zoomSensitivity` 实时写进引擎，`dotDensity` 直接驱动点阵绘制。
- 右下角可收起导航图 `CanvasMinimap`：内容包围盒 + 当前视口框，点或拖直接跳转。

## 顺带修掉的两个真缺陷

1. **主线程卡顿被当成「手不见了」**。`GestureInteractionManager.tick` 用固定 350ms 判定丢手，而它自己的 rAF 在软件光栅下会被渲染拖到 350ms 以上，于是每一帧都触发 `onHandLost()` → 冷却 350ms + `inputRouter.suspend()` → 表现为「所有闸门都说可以画，笔却不动」。改成按实测喂帧节奏放宽（`max(350ms, 3×feedInterval)`）：源真的停手仍然立刻判丢，渲染忙不再被误判。
2. **导航用的「UI 占用」信号混了双击保护**。`uiHovered` 里含 `state==='cooling'`（防止刚点完就落笔，这个语义要保留），但它同时被平移/缩放当作「UI 抢走了输入」，于是冷却期间画板不动。新增独立的 `setUiCaptured(overTarget || pressId)`，只表示真的有控件被指着或按着。

## 又挖出的两条根因（都由套件红→探针量出来）

3. **顶栏的三段 flex 让模式按钮随状态文字左右滑动。** 加了「工具」「暂停手势」两个入口后，1366/1440 出现 `dock-settings` 出屏（右边缘 1408 > 1366），而 `phase10-settings` 的「手势进入设置」也红了——按钮还在，只是被推出可视区，手势瞄准的是屏幕外的点。更隐蔽的是 `justify-content:space-between` 下，状态行文字变长会把中间的模式段整体推移，夹具按 DOM 实时矩形瞄准、管理器用 500ms 缓存矩形，于是「点 Canvas Draw 结果进了 Model Control」（截图 `docs/screenshots/phase11/04-studio-canvas.png` 抓到的就是这个瞬间）。修法是布局层面的：顶栏改成 `grid-template-columns: minmax(0,1fr) auto minmax(0,1fr)`，两侧各自占中心剩下的那一半，模式段位置不再与文案长度相关；≤1500px 依次让位（先隐藏与状态行重复的手势提示 chip、再隐藏分隔条、再把模式段收成纯图标），控件本身一律不缩小。修完 `e2e:layout` 36/36、`e2e:settings` 38/38。
4. **主线程停顿被当成「手离开了」，并且每帧重新武装重定位缓冲。** 现象是 `strokes=0` 而 `drawingAllowed:true / mayDraw:true`，`hint` 停在「拇指和食指张开」。两处判定都在拿墙钟和上一帧比较：`GestureInteractionManager.tick` 的固定 350ms，以及 `DrawEngine.tick` 里 `now - lastResultAt > TRACKING_LOST_GRACE_MS(320)`。SwiftShader 下渲染一帧可以超过这两个值，于是引擎每帧都判「刚回来的手」，`needsRecapture` 每帧把重定位缓冲重置成长度 1 —— 缓冲永远填不满，`updateStroke(penPinched && recapture === null)` 永远不画。修法：两处都改成跟随实测节奏（`max(阈值, 3×EMA(喂帧间隔))`），并且**缓冲已在填充时只有真正的身份切换才重置**。这条修完，e2e 从 9 条红回到 1 条（且那 1 条是已知的时序敏感项，见下）。

顺带把 `uiHovered` 的两种含义拆开：`uiHovered`（含双击冷却，用来抬笔）保持不变，新增 `uiCaptured`（真的有控件被指着或按着）给导航用——否则冷却期内画板不动，用户会觉得「手在动，板不听」。

## 仍未闭环的一条：React "Maximum update depth exceeded"

现象：`e2e.mjs` 收尾的 `no console errors across the stress run` 报 React 的嵌套更新上限，抓栈（`scripts/e2e.mjs` 里的 console.error 包装 + 段标记）稳定落在：

```
at forceStoreRerender (react-dom_client.js)
at DrawEngine.publishMetrics (src/engine/DrawEngine.ts)
at tick (src/engine/DrawEngine.ts)
```

已经试过并**排除**的两种做法（都留下证据，别再重复走）：

1. 在 `useDrawEngine` 把 `setState` 合并到下一帧 rAF —— 报错换了栈仍出现（`useDrawEngine.ts:47`），说明不是频率。
2. 在 `publishMetrics` 比较「UI 可见字段」签名，相同就不通知 —— `e2e.mjs` 第 1 节直接崩：`[data-testid="dock"]` 透明度永远不到 0.9。原因是 App 里 OPEN_PALM/VICTORY/FIST 的判定写在依赖 `metrics` 的 `useEffect` 中，**每次发布就是这些状态机的时钟**；`gestureDurationMs` 不在签名里，张掌计时器再也不被复查。已回退，并把这条写进项目记忆。

当前判断：这不是「发布太频繁」，而是「手势状态机寄生在渲染回调上」。真正的解法属于 P12-3：把按住时长/确认帧这类判定从 React 的 `useEffect` 移到引擎与命令总线的非渲染路径，之后 metrics 才可以自由节流或改为轮询。本轮不假装它已修好；在这一版里它只影响控制台断言那一条，功能断言 55/56 全过（唯一红的就是这条控制台检查）。

### 玩具里常驻的两个门 + 无限画布的导出边界

- `LabChrome` 现在常驻 `lab-canvas`（返回画布，走统一的 `RETURN_TO_CANVAS`：停止玩具输入 → `runtime.back()` → 回 studio → 回到进玩具前的那个模式，视口/工具/草稿因为都存在引擎与工程里，回来即原状）和 `lab-back`（玩具大厅）。`phase10-toys-e2e.mjs:222` 的「玩具播放期间活动区域只有 `lab-back`」相应改成 `lab-back,lab-canvas` 两枚 `scope:'toy'` 的入口——断言的意图（菜单不许抢捏合）不变，放宽的只是这次真正要暴露的东西。实测 `boardui`：`inLab:'playlab' → back:'studio'`，运行时异常 0。
- 画板无限之后，笔迹可以落在原纸张 0..1 之外，而 `exportPaper` 一直按 `x×1600` 画——**越界的墨会被静静裁掉**。`freehand.ts` 的 `paperFrame()` 处理这个：内容仍在纸张内时导出与过去逐像素一致（`e2e:stage5` 的 PNG/SVG 三条断言不变），一旦越界就把取景框移到作品上（只缩小不放大，保持纸张分辨率口径）。

## 已跑与待跑

已跑（同一台机器、一次一个浏览器、套件之间留白）：

| 套件 | 结果 |
| --- | --- |
| `typecheck` / `build` | 干净 / 成功 |
| `verify:core`（含新视口 12 条 + 点阵 7 条断言） | ALL CHECKS PASSED |
| `e2e:layout` | 36/36 |
| `e2e:stage5`（二维/三维/模型 20 次往返） | 13/13，运行时异常 0 |
| `e2e:toys` | 13/13 |
| `e2e:settings` | 38/38 |
| `e2e:voice` | 21/21 |
| `e2e`（手势压力） | 55/56 —— 唯一红项是上面那条控制台断言；`FIST pauses` 已修（夹具改为**在笔画进行中**轮询 `penDown`，而不是 sweep 结束后再查，见 `scripts/e2e.mjs` 第 10 节注释） |
| i18n 键位对比 | zh/en 各 332 条，无缺失、无重复 |

探针数字（`node_modules/airdraw-probe/`）：双手缩放 `anchorDrift = [0, 0]`、`zoom 1 → 1.4`；缩放后落笔 `expect [0.466, 0.561]` vs `got [0.469, 0.563]`；单手平移与手掌位移一致；`afterhold` 证明「确认后 `inputRouter.awaitRelease` 为真、下一次连续捏合被正确忽略、需要一次真正的松手」；`dayhub` 卡片背景 `rgba(0,0,0,0) → rgba(255,255,255,0.58)`、预览中心像素 `[254,254,254] → [28,34,47]`。

待做：P12-2 玩具大厅滑动与 `RETURN_TO_CANVAS` 的实机复现与逐玩具验收（命令、语音别名「返回画布／Back to canvas」、来源模式与视口/工具/草稿的保存已就位，但玩具内的「返回画布」按钮还没进 `LabChrome`，大厅滑动的 `swipeAllowed` 链路还没实测）；P12-3 交互状态机统一（含把上面那条时钟问题根治）；P12-4 排版与微响应；P12-5 全功能矩阵（1366/1920/窄窗/系统文字放大、双语与截图对比）与真人摄像头、真实语音实测——**这两项目前均为待验证，不以模拟绿灯冒充**。


