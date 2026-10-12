# 第十五→十六阶段日志 · 坐标链、日间固定、玩具与启动页

> 项目不是 git 仓库：改 `src/**` 前先复制 `.bak-p16*`。本轮全部实测数字来自本机 headless SwiftShader + 合成手，真机 40/60/80/100cm 与不同光照的手写验收仍未做，见「未验证」。

## 第一轮：坐标链审计（四份并行只读审计 + 一个可复现探针）

先取证再动手。探针 `node_modules/airdraw-probe/p16coord.mjs` 用引擎自身的 plane→screen 反算瞄准（与套件同一套 `gestureDriver`），逐点读三个量：指针落点、起笔瞬间的 press 光标、以及**该模式渲染器真正使用的那条映射**反推出来的墨迹位置（二维 = `docToInk` + 画布元素原点；三维 = 笔迹点经 `planeToWorld` 再过实时相机的 `projectionMatrix`/`matrixWorldInverse` 投回屏幕）。读另一条映射等于去量一个该渲染器根本没用过的变换。

审计确认的十二条不一致（编号沿用审计记录），本轮修掉前六条：

| 编号 | 事实（定义处） | 后果 | 处置 |
| --- | --- | --- | --- |
| B1 | `rendering/three/plane.ts` 的 `planeToWorld` 是固定 16×9 仿射，没有任何地方读 `camera.fov/position/size`；`CameraRig` 却在 42°↔5°、13.5↔103.1 之间连续插值 | 三维墨迹与光标径向偏离：1440×900 中心 0px、四角 **±57px(x) / ±30px(y)** | `CameraRig` 向引擎注册实时射线（屏幕像素 → 与 z=0 绘画面求交 → `worldToPlane`），落笔取射线命中点，深度仍用手自身 z |
| B3 | `canvasNav.setSurface/setBase` 原先只写在 `handleHands` 里 | 无手/首帧前 base 是构造默认「1 文档单位=1 CSS px」；resize 后 `planeToDoc` 用新映射而 `docToScreen` 用旧 base → 墨迹落在「上一个窗口」；`fitRect` 会照此写出**整会话残留**的绝对 offset | 抽出 `DrawEngine.syncScreenMapping()`，按 `videoSize@viewport` 签名幂等重建，`setViewport` 与每帧各调一次；`ViewportController.isReady()` 让 `fitRect` 在未就绪时直接返回 |
| B4 | `toScreenPoint` 在 `videoSize=0` 时懒造 cover 映射 → 所有点塌到窗口中心 | 相机未就绪时浮层（模型/工程舞台、识别卡）位置错 | 未就绪时退化为「平面铺满窗口」，且**不**把该猜测写进画布相机 base |
| B11 | `App.tsx` 写整窗视口、`DrawingSurface.tsx` 写容器视口，两个所有者 | 目前 `.stage` 是 `absolute inset:0`，两者数值恰好相同 → 潜在而非可见；一旦让画布随属性列让位（第十五阶段已记录：指针被 `clampToViewport` 夹进 stage，顶栏/栏内控件手势不可达）立刻爆炸 | 视口唯一所有者=App（窗口）；画布元素改为只上报自己的原点 `setDrawingArea`，新增 `docToInk/inkToDoc`，点阵与墨迹都减该原点 |
| B2 | `frameFor` 造 `HandFrame` 时 `toPlane(..., false)`（文档约定：帧空间不镜像），但 `two.midpoint` 被直接喂进已镜像的 mapper | 双手缩放/平移锚点左右反了（最大误差 ≈ 0.6 窗宽） | 新增 `framePlane()`，所有进 mapper 的帧点统一翻一次；PlayLab 的 `displayHand` 补偿保持不变，`docs/camera-architecture.md` 的「展示边界各翻一次」重新成立 |
| B5/B6 | 识别卡用 `toScreenPoint` 投文档点；导航图用 `window.innerWidth/Height` 当视口 | 缩放/平移后卡片离开自己的墨迹；导航图与映射对「什么在屏上」各说各话 | 识别卡改 `docToScreen`；导航图改 `canvasNav.getSurface()` |

**测量结果（1440×900，同探针）**：指针误差 ≤2px；二维起笔 vs 光标 **10–14px → 0px**；三维起笔 vs 光标 **±57/±30px → 0px**（五点全中）；zoom 2.4+平移时指针曾被夹在窗口角 (1440,900)，现在 1px 内收敛。

## 第二轮：坐标回归套件与它的五个夹具陷阱

新增 `scripts/phase16-coordinates-e2e.mjs`（`npm run e2e:coords`，结果写 `docs/verification/phase16-coordinates.json`）：1920×1080 / 1366×768 / 1024×768 / 2560×1080 × 三维+二维 × 侧栏开合 × zoom 2.4 与 0.5+平移 × `mirror=0` × 左手，每例五点两条断言（指针 ≤4px、墨迹起笔 ≤4px），门槛未放宽、无删除断言。首跑 15/35，逐条查下来**红点全在夹具**：

1. 模式用捏合切换会落到隔壁段（诊断里出现 `当前为模型操控模式`），整页在 MODEL_CONTROL 里当然不落笔 → 改 DOM 点击 + 等 `workspaceMode` 落地且 `__airdrawMode` 不在 TRANSITION。
2. `gestureDriver.push` 硬编码 `nx = 1 - u + 0.12`（假设镜像开着），`mirror=0` 时指针对不上（差 720px）→ 该例改按 `1-u` 反推。
3. `mkHand` 硬编码 `handedness:'Right'`，左手用例必须自己造手并先推帧再读 `tracking.primary`。
4. 顶栏入场动画从 y=-12 起步，未等完就断言 `bar.top===0` 会把入场当成布局 bug。
5. 五点按窗口比例取，小窗时 0.8w 落进右侧属性栏（`指针移出工具区，再松开捏合` + `context:UI` + `mayDraw:false`）——**笔在控件上方抬起是产品正确行为**，测试必须瞄准可画区；改按实时 rect 求自由盒（顶栏底、属性栏左、dock-zone/导航图上沿），并把 `overTarget` 记进每行证据。另外「重新取得手」不能用 `'open'`：张掌在点阵画布上就是平移手势，会把纸推动（实测出现过 26px 的假偏移）。

## 本轮实测与未验证

- 已跑：`typecheck` ✓、`build` ✓、`verify:core` ALL、`e2e:stage5` 13/13、`e2e:creation` 20/20、`e2e:stage6` 14/14、`e2e:layout` 40/40、**`e2e:coords` 49/49**（`docs/verification/phase16-coordinates.json`）、主 `e2e` 55/56（唯一红 `pinch sweep draws committed 3D strokes`，`mayDraw:true` 却未落笔，属 #72 按压饥饿家族，待复跑判定）、`e2e:toys` 12/13（`fireworks:waiting`，同族）。
- 坐标套件的计数口径：49 条 = 14 次扫描 × 三条（指针 ≤4px／可画点数 ≥3／墨迹起笔 ≤4px）= 42，另加 4 条「顶栏与画布同窗」、1 条「侧栏收放只加宽不动映射」、1 条「左手是主手」、1 条「无运行时错误」。所有真正落下的墨迹误差实测为 **0px**；瞄在 chrome 上的点不判墨迹，改由「可画点数 ≥3」单独守住覆盖面，防止退化成一个中心点。
- **未验证（诚实记录）**：真手在 40/60/80/100cm 写直线/圆/快速转折、左右手、不同光照；轨道模式（inspect）下长时间书写的首尾一致性；B7（光标夹窗口而墨迹不夹）、B8（`SpatialCursor` 每帧 0.55 一阶滞后 + 磁吸 0.4 让显示光标 ≠ 笔点）、B9（`MAX_POINT_SPEED/OUTLIER_HARD_STEP/MIN_POINT_DISTANCE` 是平面单位却作用在文档单位上，zoom≠1 时限速语义随缩放变化）、B10（新笔迹 `group.scale` 绕**世界原点**从 0.7 起，首点最多向屏幕中心偏 30%，另有 `PinchContactDetector` 两帧/40ms 确认延迟让起笔短一截）——这四项是 P16-1 的下一步；接触中点/个人校准偏移作为有效落点的连续过渡尚未实现。
- 玩具日间改造、日夜切换移除、Hello 启动页重做（含「禁止任何计时器自动进入」）本轮未动。
