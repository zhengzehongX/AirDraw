# Phase 14 — 二维画布坐标根因修复、稳定手势导航、三维笔迹平移缩放

用户反馈两条：**单手基本稳定时画布仍剧烈偏移**；**画出的笔迹不随画布一起移动/缩放**。
方法：先用固定输入回放复现，再改代码；不靠加滤波/降灵敏度/加阻尼掩盖；不推倒重写，不清空作品。

## 1. 复现与根因（二维）

回放探针 `node_modules/airdraw-probe/p14replay.mjs`：合成手恒定 14 秒、标定后的 100 CSS px 台阶、同一识别结果连发三次、平移前后墨迹质心像素对比。

- **根因一（漂移/自激）**：`DrawEngine.handleHands` 把掌心先经 `planeToDoc`（即 `screenToDoc(mapper.toScreen(raw))`，穿过**当前视口**的逆变换）变成文档坐标，再交给 `updateCanvasNav`，而后者又用 `mapper.toScreen` 把它当屏幕坐标用。于是导航输入 = f(当前 offset/zoom)：平移会移动自己的输入，`navPanSpeed > 1` 时直接自激振荡；手不动时 offset 一旦非零，"手掌屏幕位置"仍会继续变化 → 画布自己漂。这正是简报禁止的"先逆变换再反更新同一视口"。
- **根因二（笔迹不跟画布）**：`Canvas2DStrokeRenderer` 的历史位图只在 commit/undo/resize 时重建，`DrawingSurface` 的 `onCanvasNav` 只重绘点阵 → 平移/缩放时点阵走了、墨迹留在旧屏幕位置；活动笔画还是增量描边，跨视口变化会糊。
- 次要隐患：`PAN_BOARD`/`ZOOM_BOARD` 直接改控制器且不 notify（点阵/缩略图滞后）、用 window 中心而非容器中心；缩略导航每次 drag 事件都 `remember()`，把 24 层视图栈灌满垃圾；手丢失时导航 `ended` 被丢弃；识别结果无去重，重复帧会二次累加。

## 2. 坐标约定与修复（二维）

唯一约定：`screen = base(doc) × zoom + offset`。`base` 是容器映射（镜像/视频宽高比/容器偏移/DPR 都在它外面），**与视口无关**；导航只写 `zoom/offset`；笔画、点阵、命中测试永远存文档坐标。与 Excalidraw 的 `viewportCoordsToSceneCoords / sceneCoordsToViewportCoords` 同构，集中在 `ViewportController`。

- 导航输入改为**原始 plane 点**（摄像头归一化 → 容器 CSS px，一次映射，不穿视口）。
- 会话绝对基准：进入平移冻结 `palmStart/offsetStart`，每帧 `offset = offsetStart + gain×(palmNow − palmStart)`（gain 默认 1，不随缩放或掌宽变化）；进入缩放冻结 `midStart/d0/s0/anchorBase`，每帧 `s = clamp(s0×(d/d0)^k)`、`offset = mid − base(anchor)×s`。两手间距用同一容器屏幕系（视频像素掌心距，比值安全），不相减两只手的 worldLandmarks；间距过小/身份交换/无效值不做除法。
- 单一写入口 `ViewportController.setView`；命令总线、缩略导航、fit/reset/last 全部走引擎方法并 notify；`handleResult` 按 provider 时间戳去重（旧帧/乱序直接丢弃，渲染循环可重复绘制但不再累加）。
- 渲染：`onCanvasNav` 现在用同一视口快照重投影 点阵 + 全部历史笔迹 + 活动笔画（活动笔画改为存文档点整笔重绘，跨缩放不糊）；DPR 只在 resize 时 `setTransform(dpr,…)` 一次，逐帧不累计变换。
- 手丢失：先 freeze 不 extrapolate；恢复/分离/收回都重立基准；导航结束清掉路由的陈旧捕获（`InputRouter.clearCapture`），"导航结束须重新捏合才落笔"保留。
- 调试：DEV 下 `window.__airdraw.navTrace` 环形缓冲（帧序号、时间戳、模式、手掌屏幕位、视口、是否写入），用于回放区分"识别跳动"与"程序自放大"。

实测（回放）：静止 14s 漂移 **0.00px**；手掌台阶 **100.0px → 视口 100.0px**；同一结果连发 3 次只处理 **1** 次；墨迹质心位移 113.8px 对画布 116px（2px 网格采样误差）。Node 自测新增 5 条：静止不漂、100px 不逐帧累加、双手缩放锚定两手、双手同向平移 1:1、`(200,100)@zoom2/offset(100,50) → (500,250)` 平移后 `(600,250)` 且文档点不变。

## 3. 三维笔迹平移/缩放

新增 `src/rendering/three/spatialNavigation.ts`（纯数学，可 Node 测）+ 引擎侧 `updateSpatialNav` 闸门 + 场景侧 `SpatialNav` 组件。

- 会话在 engage 帧冻结**起始相机**（position/quaternion/fov/aspect）、rig 中心、距离、中点 NDC 与间距；每帧用**起始相机**对固定参考平面（z=0 文档面）求射线交点，按交点差绝对计算新中心；缩放 `distance = clamp(d0/d × distance0)`。禁止用已被本次手势移动过的相机重建基准。
- 方向正确性：手向右 → 交点差向右 → rig 中心向左 → 画面里作品向右。
- 单一相机写作者仍是 `CameraRig`；会话期间 `inspectController.direct` 关闭回正弹簧与惯性（第一个实测 bug：`update()` 在非 inspect 模式每帧把 targetDistance 拉回 13.5，把缩放吃掉），自动取景/惯性只在会话外生效。
- 笔迹挂在场景根的 `SpatialLayer` 文档组下（原本如此，已核实），导航只改相机 → 全部笔迹一起变；探针确认导航前后笔画数据**逐字节不变**。
- 实测：双手拉开 2× → 距离 13.5→9.0（触及 DIST_MIN 钳制）并保持不漂；交叉/间距过小不除、冻结。单手张掌平移的原型实测跟随 2.069 世界单位、手停漂移 0.0000，但**本版未发货**：单手张掌在三维模式同时是「呼出工具坞」的既有手势，死区/保持时长两种拆法都会破坏其中一方（套件第一条「张掌呼出 Dock」直接超时）。两手张掌无此歧义，故本版只发货双手缩放；单手三维平移与射线瞄准落笔一起留到路由 latch 修复后（§5）。

## 4. 回归

| 项 | 结果 |
| --- | --- |
| typecheck / build | 通过 |
| verify:core（含新增 5 条导航回放用例） | ALL CHECKS PASSED |
| e2e:layout | 36/36 |
| e2e:settings | 38/38 |
| e2e:toys / e2e:voice | 13/13 / 21/21（本轮早前） |
| e2e:stage5 | 13/13（本轮早前）；负载连跑时 12/13，见下 |
| e2e | 冷却单跑 55/56：唯一红为「FIST pauses … drawing resumes after」（解除锁定后那一次落笔被吞，与 theme/三维导航后落笔同族，见 §5-1）；**背靠背连跑会出现 13 条级联红**（VICTORY 起整串手势保持类检查失败），与项目记忆里的合成手饿死一致，冷却复跑即恢复，不视为回归 |

连跑级联的证据与纪律记录在项目记忆 `airdraw-suite-load-sensitivity`：同一构建冷却单跑 55/56，连跑 13 红；判定回归只认冷却单跑。

## 5. 开放缺陷（不放宽断言、不隐藏）

1. **「状态切换后的第一次落笔」被路由吞掉**（P12-3 的根，三种形态同族）：三维导航结束后、FIST 解除锁定后（e2e 冷却单跑唯一红）、以及 SET_THEME 混合窗口内（叠加 SwiftShader 下 1–3s 的混合延迟，某些轮次表现为它红）。诊断快照：`InputRouter.context==='UI'` 而 `overTarget=false`、`waitingForRelease=false`，即 App.tsx:289 的 `present/allowed` 在该瞬为假；怀疑换手后 recapture 的 `searching` 窗口或 appMode 的 TRANSITION 采样。本轮已做的缓解：`InputRouter.set` 只在**确实捏着**时才欠一次释放、导航结束 `clearCapture()`；缓解后 theme 形态转绿、FIST 形态仍偶发。复现探针 `p14spatial.mjs`（aim 段）。射线瞄准落笔（指尖 NDC → Raycaster → 锁定绘制平面）已实现并**随本缺陷一起回退**：笔都落不下时瞄准没有意义；代码与数学保留在 `spatialNavigation.ts`，待 latch 修好后接回。归 #72。
2. **单手三维平移与「张掌呼出工具坞」共用同一保持手势**：死区（移动才平移）与保持时长（静止才呼出）两种拆法都会破坏其中一方（e2e 第一条「张掌呼出 Dock」在拆法下直接超时）。本版保留呼出 Dock，三维平移只发货双手缩放；拆法需要一个新手势词汇，归 #71/#72 一并设计。
3. 过程中修掉并记录以防回潮的两个真 bug：空间导航 busy 分支曾每帧 `cancelInput()`，三维模式下一捏合笔画就被收尾（笔永远落不下）；`inspectController.update` 在非 inspect 模式每帧把 targetDistance 拉回 13.5，吃掉手势缩放。
4. phase13 在案的 SET_THEME 延迟已并入 §5-1 同族（本轮冷却单跑该检查转绿）。
5. PlayLab 右滑翻页 KNOWN GAP（phase7）。

真机摄像头/真人操作未在本轮验证；以上全部结论来自 headless SwiftShader + 合成手与 Node 自测。
