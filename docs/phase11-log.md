# 第十一阶段交接：把真实操作流程打通

日期：2026-10-07。仍然是基于既有架构渐进修改：粒子开场、大厅、教程、二维/三维绘画、模型操控、PlayLab、手势识别、语音菜单、日夜主题、作品保存全部沿用，未推倒重写，未新增依赖（`react-resizable-panels`、`Remotion` 都只作为读过的参考，不进实时链路）。项目不是 Git 仓库，所以每条结论都配一个可复跑的套件。

本阶段的重点不是加功能，而是让「进入应用—选择功能—创作或互动—调整参数—保存—返回继续」这条路径走得完。顺序按用户要求：**先统一工作区布局**，再补点阵画布的对象编辑，然后才是其余各块。

## W1 统一工作区布局

四个区：顶部项目栏、中央主画布、底部当前模式工具、按需侧边属性面板。改动前后各区的实测数字都在 `docs/verification/phase11-layout.json`（36 条断言，`npm.cmd run e2e:layout`），截图在 `docs/screenshots/phase11/`。

### 顶部：一条 56–64px 的项目栏

`src/components/WorkspaceBar.tsx`（新增）取代原来叠在上面的三样东西：`TopStatus` 浮条、`ThemeToggle`、`CameraStatusDot`，以及语音胶囊自己那套右上角控件。一条行里放：返回、作品名（长名省略、点一下改名）、保存状态、当前状态行、模式段、设备入口（主手/摄像头/主题/语音）、作品库/使用说明/设置。

保存状态从「用中文字符串当状态」改成符号量：`workspace.saveState: 'unsaved'|'dirty'|'saving'|'saved'|'error'`，中文文案只是 `SAVE_PHRASE` 的投影（`src/project/workspace.ts:5`）。这一步是必需的——上一轮把 `mark('saved')` 接上以后，`useProjectBridge` 里 `status==='已打开'` 这类散文比较静默失配，autosave 定时器不再重建。现在比较一律走符号量。

四条根因是探针量出来的，不是猜的（`node_modules/airdraw-probe/baredge.mjs`）：

1. **同一个 `id` 注册了两次**。`VoicePill` 和 `WorkspaceBar` 都有 `voice-toggle`，`CameraStatusDot` 和栏里都有 `camera-dot`，`SpatialDock` 和栏里都有 `dock-gallery/dock-guide/dock-settings`。`GestureInteractionManager.regions` 是以 id 为键的 Map，**后注册者覆盖前者**：栏里的设置按钮显示为可点，捏下去执行的是被覆盖的那一份，或者干脆没有矩形。修法：栏成为这些动作的唯一持有者（`App.tsx:645` `barOwnsTop` 时不再渲染浮层版本），`VoicePill` 拆出 `VoiceStatusPanel` 由栏托管，`CameraStatusDot` 只在没有栏时出现。套件新增 `no control is registered twice` 直接统计 DOM 里同 `data-gesture-id` 的个数。
2. **托管组件的浮点坐标没被收回**。`TopStatus` 用 CSS Module 类，`WorkspaceBar.module.css` 里按 `.ad-top-status` 写的重置选不中它，于是它继续 `position:absolute` 盖在摄像头上（截图 01 里那行「AirDraw Spatial ··· Show your hand」压住两个按钮）。修法：重置改写成 `.stateSlot > *`（覆盖任何类名）**加上** `.bar :global(.ad-mode-switcher)`（同特异度的全局规则要靠书写顺序取胜，只留前者会退回绝对定位——这一步我自己踩了一次，套件用 `every target is inside the window` 抓到）。
3. **模式段被 flex 挤扁**。`motion.nav layout` 的投影变换是内联样式，CSS 的 `transform:none` 压不住；栏里 flex 一收紧，按钮换行成两排，行高从 58 变 75。修法：托管时 `layout={false}`（`ModeSwitcher.tsx:13`），`.centre{flex:0 0 auto}` + `.ad-tool-button{flex:0 0 auto;white-space:nowrap}`，可压缩的只剩作品名和状态行（两者都是省略号，不是换行）。
4. **右端控件够不着**。`camera-dot` 以左全部 hover 成功，`dock-gallery` 起三个 hover 失败——正是与 Dock 重名被覆盖的三个（见 1），不是屏幕边缘问题。修好后 `hand can use dock-settings/mode-CANVAS_DRAW/workspace-back` 三条手势点击全 PASS。

### 底部：只放当前模式用得上的 7 项

`SpatialDock` 原来是左侧 2 列 13 项的竖排（`docs/phase5-log.md` 的布局决定），并且和顶部栏重复持有 gallery/guide/settings。现在：

- 三维：Color / Material / Size / Undo / Redo / Erase / 更多（Clear、Save、View、Center）。
- 点阵画布：Color / Size / Undo / Redo / 更多（Clear、Save）——`mode` 属性驱动，`dock-material`、`dock-erase`、`dock-view`、`dock-center` 不再出现在 2D 模式（`SpatialDock.tsx:158` 的 `spatial` 判定；`material` 弹层在切到 2D 时被强制关闭，避免带着上一个模式的弹层进来）。
- 玩具/校准/覆盖层/工程面板打开时整条不渲染（`App.tsx:639` `drawingChrome`），这是第十阶段「一次捏合只能被一个目标消费」的延续。

`更多` 是新增的 `Popover` 取值（`appState.ts:46`），面板宽 320px、开在自己所属那一行的正上方，而不是变成第二条侧栏。

### 侧边：288px 一种宽度

`--ad-panel-w: 288px`（`tokens.css:24`）成为唯一的面板宽度：`.ad-context-dock`（点阵/模型属性）与 `.ad-surface-dock`（材质表面）都改用它，圆角从写死的 32px 改为 `var(--ad-radius-xl)`，右侧位置从 `top:116px` 改为 `top:80px`（贴住 58px 的栏）。窄屏（≤800px）收成 200px 单列，任何时刻左右两侧不会同时挤压画布。

### 顺手清掉的死接口

`SpatialDock` 的 `devMode/dominantHand/onToggleDev/setDominantHand/onOpenGuide/onOpenGallery/onOpenSettings` 全部没有消费点（第十阶段把语言、主手、细节、音量搬进设置屏之后），一并删除；`App.tsx` 的调用处同步收紧。`GestureButton` 补 `data-dock-item={id}` 与 `data-testid={id}`，让「工具按钮」这一概念在两套按钮组件（`GestureButton` 与 `SpatialDock` 的 `DockItem`）上是同一组选择器，既有套件不必改写。

### 顶部栏自己引入的两个新缺陷（由 e2e 抓到，已修）

1. **栏里的 12 个控件没有 scope**。`GestureInteractionManager.isLive` 的规则是「没有 scope 等于全局可命中」，而第十阶段刚刚把 `SurfaceDock`/`ThemeToggle`/`CameraStatusDot` 无 scope 列为缺陷。栏是新写的，又把同一个坑挖了一遍：教程里一次悬停可以顺手打开设置。修法：`WorkspaceBar` 收 `scope` 属性（`App.tsx` 传 `state.context`），12 个 `GestureButton` 全部带上——栏仍然在每个界面都在，但只在**它所属的那个上下文**收输入。
2. **`data-testid="theme-toggle"` 消失了**。教程最后一课要捏合切换主题，套件选择器是 `[data-testid="theme-toggle"]`；旧的 `ThemeToggle` 组件带这个 testid，栏里的 `GestureButton` 只带 `data-gesture-id`，于是 `driver: click [...] no-element`，教程再也走不完。上面那条 `GestureButton` 统一发出 `data-testid`/`data-dock-item`/`data-gesture-id` 三个同源属性，就是为这类"同一个动作换了一个持有者"的情况准备的：选择器不再取决于哪个组件在渲染它。

### W1 验证

`npm.cmd run e2e:layout` 36/36（1440×900、1920×1080、1366×768 三档 × 8 条几何/可达性 + 手势点击 + 底部行 + 更多面板 + 2D 行）：栏高 58px；18 个手势目标零重叠、零重复注册、零出屏、最小 56px；底部行 7 项、距视口底 24px；属性面板 288/320px。回归：`e2e`（手势压力）56/56、`e2e:toys` 13/13、`e2e:settings` 38/38、`e2e:voice` 21/21，四条在修完 metrics 合并后同机连续单独复跑，全绿。截图：`docs/screenshots/phase11/01-studio-spatial-row.png`（三维行 + 更多面板）、`02-studio-colour-panel.png`、`03-studio-night.png`、`04-studio-canvas.png`（点阵模式：3D 专属控件消失、右侧属性面板 288px）。


两处套件跟着改，理由都是界面决定变了而不是断言错了：`phase10-toys-e2e.mjs:215` 原来用 `id.startsWith('dock-')` 当「绘制类控件」的代理，现在 gallery/guide/settings 合法地由顶部栏持有，改为按真实工具 id 列表判定，同时把 PlayLab 大厅里的模式段去掉（大厅本身就是选房间的地方，不该再有第二条切换路径）；`phase10-settings-e2e.mjs:259` 的「恢复全部默认」仍写死 `uiLanguage==='system'`，而默认值上一轮已改为 `zh`（半中半英的界面比任何一种语言都糟），改为比对 `zh` 并注明原因。

`scripts/e2e.mjs` 里三处读 `[data-dock-item="dock-view"]` 的 `data-active` 改成读 `window.__airdraw.debugInternals.inspectMode`（断言的是状态，不是某个按钮的样式），两处 `dock-clear`/`dock-save` 改走新的 `tapMore()`（先呼出工具行、再开「更多」），因为这两项按新布局就在更多里。

### 布局改完才暴露的架构缺陷：引擎的 metrics 落在 React 渲染中间

`e2e.mjs` 在 W1 之后出现三类同时发作的红：`pinch sweep draws committed 3D strokes — strokes=0`（而 `inputDiagnostic` 显示 `drawingAllowed:true`、`mayDraw:true`，`hint` 停在「拇指和食指张开」）、`VICTORY enters/exits view mode` 一红一绿随机翻转、收尾 `no console errors across the stress run` 报 **Maximum update depth exceeded**。抓栈（`scripts/e2e.mjs:44` 起，console.error 包装 + 段标记 `mark()`，栈与段名一起落进 `window.__errorStacks`）后只有一帧有用：

```
at DrawEngine.publishMetrics (src/engine/DrawEngine.ts:888)
at tick (src/engine/DrawEngine.ts:860)
```

根因不是布局，是 `useDrawEngine.ts:45` 的 `useEffect(() => engine.onMetrics(setMetrics))`：**引擎在自己的 rAF 里直接 setState**。React 19 的并发渲染会在单元工作之间让出主线程，让出的间隙正好让 rAF 回调进来排下一个更新；一次 commit 越重，让出次数越多，`nestedUpdateCount` 累到 50 就报 maximum update depth，并且**这次更新被丢掉**。丢的就是 `dockOpen`/`popover`/`inspect` 所依赖的那一份 metrics —— 于是出现「所有闸门都说可以画，笔却不动」和「捏了 VICTORY 但模式没切」这两副面孔。

W1 把顶部栏（12 个按钮 + 托管的状态行/模式段/语音面板）挂进同一次 commit，让每次渲染更重，于是把一个一直存在的架构弱点踩成了必现问题。修法只有一处、5 行：`useDrawEngine.ts:40` 把 metrics 更新合并到**下一帧一次**（`pending` + 单个 `requestAnimationFrame`），最新的 metrics 不丢，React 的渲染窗口里不再被塞更新。改完 `e2e.mjs` 单独跑 **56/56 全绿、0 console error**（`/tmp/e2e-w1e.log`）。

同一段还顺手把夹具改成等结果而不是抓瞬时：`VICTORY enters/exits view mode` 现在用 `inspectSettled(true/false)` 等到 `debugInternals.inspectMode` 真的翻转（超时 6s 才算红）。这比原来「捏完等 400ms 采一次」更严——它同时要求翻转最终发生；负向闸门「两指一闪不得切进查看模式」原样保留。

**结论口径**：以上全部在 `?simulate=1` + 合成手 + SwiftShader 下测得，只说明对象/状态/命中/持久化的契约成立，不代表真机 60fps 或真人手感；真人摄像头与真实语音仍**待验证**。


