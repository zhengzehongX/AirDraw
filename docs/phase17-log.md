# 第十七阶段：六项核心整改与当前验收边界

日期：2026-10-11。基于用户后续完善的源码渐进修改；原文件备份在 `.bak-p17/`，未引入依赖、第二摄像头或第二套菜单。

## 已落地修改

1. `DrawingSurface` 只拥有点阵画布尺寸；历史/live Canvas 由 renderer 管理尺寸与 DPR。改变 width/height 后重新设置 transform，避免第二写作者重置。DrawEngine 保存绘画区 rect，渲染器 resize 使用该区域。
2. `SpatialCursor` 去除额外追赶，仅 UI 捕获时磁吸；DrawEngine 屏幕坐标稳定区共用于指针、二维 screenToDoc 和三维射线。半径 2 CSS px，锚点不累积 EMA 漂移；重新捕获时清空。CameraRig 按笔迹实际 z 平面求射线交点，修复先求 z=0 再改 z 的视差。
3. `StrokeMesh` 去除世界原点缩放出现动画，改为轻微反射反馈，不改轨迹数据。笔尖直接使用当前目标，不再另行插值。
4. recapture 缓冲已在填充时不因重复“返回”状态重新启动。仅身份变化等可靠条件取消；仍保持现有校准、CONTACT/HOLD 门槛和安全释放，不放宽阈值。三次合成会话能够提交笔画，但历史 mayDraw=true 的所有失效场景未全部重现。
5. `Canvas2DStrokeRenderer` 与导出共享 freehand outline、tool 宽度倍率、透明度及虚拟压感；避免 workspace 同步 rebuild 后 commit 再画一次。项目替换笔画时重建历史缓存；纸张背景订阅实际状态。
6. capture 建立作品 Canvas 合成接口，二维通过文档路径重投影；背景置于 WebGL 后方，不覆盖混合内容。临时隐藏网格、笔尖和选择辅助线，finally 恢复可见性、尺寸、DPR、背景及 alpha。导出面板卸载 DrawingSurface 时仍可生成二维图。CanvasRecorder 录制合成画面并 requestFrame，缺少该 API 时使用 30fps captureStream；失败释放资源、停止按钮 finally 更新状态。
7. `LabGestures` 每手独立 session，事件带 handId/role/sessionId/state/cancelled；身份 epoch、手丢失、UI 捕获安全结束并要求释放后重新抓取。Orb 与 Fireworks 只消费事件所属手，不根据“副手存在”复制主手事件；FluidInk 读取每手 HOLD。runtime 排队分发完整帧，异步 mount 增加代次防护，退出完成导航状态并卸载。

## 坐标约定

- HandFrame 保留标准摄像头坐标。镜像在现有映射边界执行，DPR 不参与手势坐标。
- 屏幕位置使用 CSS px，窗口指针可到达顶栏/侧栏；画布绘制使用绘画区局部坐标，Canvas 像素由 DPR transform 处理。
- 二维文档笔迹归一化于 1600×900 的逻辑纸张，screenToDoc/docToScreen 使用同一导航状态；freehand 的笔宽以文档像素定义。
- 三维以当前 CameraRig 矩阵将稳定屏幕点投向实际 z 平面；worldToPlane/planeToWorld 成对转换。生成几何不另行平移/缩放。

## 本轮新测试证据

- `phase17-core.ts`：18/18，包含静止噪声无累积漂移、移动无追赶偏差、身份重置，以及主副手独立事件、UI/loss/epoch 释放、实际 Orb/Fireworks 消费。
- `phase17-e2e.mjs`：21/21，隔离 Chrome + SwiftShader + 合成手。16 项实际 Canvas 像素覆盖 DPR 1/1.25/1.5/2 与 1920×1080/1440×900/1366×768/768×768，检查平移缩放后墨迹位置、旧像素清除和荧光笔 alpha。混合合成测试使用替代 WebGL 渲染源，验证两层真实像素和状态恢复；不能称完整混合工程验收。
- 真实 App/InputRouter 三次合成捏合均提交三维笔画；二维透明 PNG 有墨迹且角落透明；高清输出 2732×1536；WebM 解码呈现后包含彩色墨迹和白纸，录制停止。资源 loadeddata 尚不保证视频纹理已呈现，测试使用 requestVideoFrameCallback 后读取帧，未降低像素断言。
- `tsc -b` 与 `vite build` 最新修改后通过。主包约 2006KB，仍有体积警告。
- 本轮过程中曾运行全量历史 e2e，8 项失败且伴随 HMR 模块/Hook 警告；该运行不是稳定源码的最终回归，不能用后续聚焦测试掩盖它。完整套件尚待重新跑。其他本轮较早的 contact-regression 18/18、stage6-core 143/143、playlab-core 55/55 与 selfcheck 通过，不能代替最终集成验收。
- 原始证据：`verification/phase17-core.json`、`phase17-e2e.json`、`phase17-input-trace.json`、`phase17-canvas.png`、`phase17-webm-frame.png`。

## 真人结果与未完成验收

用户反馈“不会断笔，但是还会有偏移；手静止轻微抖动，画笔还是会动”，确认两种绘画模式都有。之后加入稳定区与深度射线修改，尚无最新真人结论。**①与③不能标记完全验收通过。** 尚需最新截图/输入诊断定位剩余偏差，并检查稳定区对慢速转折的影响。

未完成：40/60/80/100cm 与左右手实测、30次真实捏合/非接触、30秒持续书写、系统缩放、橡皮擦最终像素命中、菜单与导航恢复压力、所有纸张/工具/SVG、保存关闭重开、完整2D/3D/Mixed缩略图和PNG/WebM、双手交叉实机、录制失败取消兼容、长时间GPU/内存验证。没有将这些标为通过。

## GitHub 参考与许可证

已实际调用 GitHub connector 读取官方源码/说明与许可证：

- [MediaPipe Web](https://github.com/google-ai-edge/mediapipe-samples-web)：Apache-2.0，核对 Hand Landmarker 入口/配置；继续使用现有 Worker，不复制示例。
- [R3F](https://github.com/pmndrs/react-three-fiber)、[Drei](https://github.com/pmndrs/drei)、[Three.js](https://github.com/mrdoob/three.js)：MIT，继续使用项目现有依赖和场景，不复制仓库代码。
- [perfect-freehand](https://github.com/steveruizok/perfect-freehand)：MIT，读取官方 getStroke/Path2D/simulatePressure/thinning 文档，复用项目已安装算法统一实时和导出轮廓。
- [Motion](https://github.com/motiondivision/motion)：MIT，保留现有动效体系，本轮没有新 Motion/Remotion 依赖。

## 后续优先级

P0：定位真人两模式剩余偏移；在当前不可变源码上重跑全量输入回归，特别是教程/UI/导航释放。P1：补齐混合工程导出、保存恢复和手身份交叉；对录制合成分配与同步 GPU readback 做性能分析。P2：实际渲染帧验证三维投影和生命周期，长笔画 freehand 每帧全量轮廓仍为 O(n)，避免将 livePoints.push 优化误称整个渲染为 O(1)。主包拆分与异步 toy 缓存并发安全需后续验证。
