# Camera 与输入架构（第八阶段）

## 所有权

`CameraService` 是模块级唯一实例，React 通过 `useSyncExternalStore` 订阅。页面只借用同一个 stream；Spatial Draw、Canvas Draw、Model Control、PlayLab、Gallery、Help 不创建摄像头或识别器。应用退出释放租约后停止 track、Worker、视频帧回调和监听。StrictMode 的临时卸载通过延期释放避免重复初始化。

状态：`IDLE → REQUESTING_PERMISSION → STARTING → WARMING_UP → READY`；异常进入 `DEGRADED / RECOVERING / ERROR`。用户点击 Enter AirDraw 后请求 `1280×720 / 30fps / user`，约束不支持时回退默认视频参数。视频 metadata 和六个有效递增视频帧到齐才开放交互。权限提示是浏览器控制，不能通过网页手势确认。

## 推理与渲染

`WorkerHandProvider` 优先 requestVideoFrameCallback，旧浏览器回退 rAF。20–30fps 上限、单个在途任务；忙时丢帧，不累计队列。最长边640的 ImageBitmap 送往 Worker，预览保留原始高清流。Worker 关闭 bitmap，持有唯一 Hand Landmarker；AUTO 优先本地 GPU，再本地 CPU，再远程资源。双手和三种置信度仍通过原配置接口更新。

页面隐藏暂停推理，并取消笔画/抓取；恢复页面重新预热，不重新申请权限。track ended、持续 mute 和失效设备触发最多两次恢复尝试，恢复复用识别 Worker。只有识别器故障并已销毁时 Retry 才创建新的 Worker。浏览器可能对设备恢复再次显示权限提示，应用不能绕过。

## 坐标与捏合

HandFrame 保持标准非镜像坐标。原始视频、识别帧不翻转；DOM 指针、绘画映射、PlayLab 显示适配各自在展示边界翻转一次。预览仅镜像视频和对应骨骼坐标，文字不镜像；骨骼保留。

`AdaptivePinchDetector` 提供 OPEN / APPROACHING / PINCHED / HOLDING / RELEASING；兼容旧 OPEN / NEAR / CONTACT / HOLD / RELEASE 消费者。未确认 CONTACT 不可执行按钮、绘画或玩具抓取。2D掌宽归一化、世界距离、深度可靠性、运动与个人校准融合；强2D或可靠世界距离可进入，稳定且明显深度分离仍阻止首次触发。默认世界进入参考9mm、2D参考0.24掌宽，是调试参数，并非测量皮肤物理接触的保证。

接触分数 EMA，连续两帧稳定且至少33ms确认；从完全张开通常约67ms进入。释放距离约进入的1.9倍，至少四帧且100ms分离确认。锁存容忍三帧噪声，笔画可跨180ms以内短暂缺失；长缺失、主手变化或异常跳跃结束当前笔画，恢复重新定位，并要求明确松开后重新捏合。缺失期间不生成长距离预测轨迹，下一可靠点安全续接。

首次校准提示和 Settings 重新校准采集三次分开—接近/轻触—分开，保存个人距离、掌宽、主手、灵敏度、设备信息及版本。算法参数只在 Developer Mode 和输入诊断中公开。

## 诊断与限制

`cameraService.getDiagnostics()`：streamAcquisitions、workerCreations、recoveries、warmupFrames、skippedFrames、activeTracks。Developer Mode 同时显示2D/世界距离、分数、阈值、稳定帧、识别/渲染FPS与推理耗时。

目前屏幕跟随使用既有平滑/渲染插值；尚未实现完整时间戳两帧 landmark 插值。SwiftShader 压测存在长帧阻塞和断笔，不能声称达到60fps。真实40/60/80/100cm、不同手型与光照验收仍需人手设备记录。

参考：[官方 Worker 示例](https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/workers/hand-landmarker.worker.ts)（Apache-2.0）、[requestVideoFrameCallback](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback)。本阶段借鉴生命周期与单任务调度方式，未复制外部实现。

