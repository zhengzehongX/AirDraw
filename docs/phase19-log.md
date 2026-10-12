# 第十九阶段：移除互动玩具与创作体验升级

日期：2026-10-11。按用户最新要求渐进修改，保留摄像头、识别、绘画、工程和导出架构。未新增依赖。

## 已完成

1. 移除 PlayLab 的功能大厅入口、模式按钮、运行层、设置项和语音匹配；App 不再创建 LabRuntime。旧 reducer 导航不再进入玩具页面，旧命令会明确反馈已移除。`src/playlab` 与历史日志作为归档保留，共享手部类型未被删掉。
2. `LaunchScreen` 增大主标题与操作字号、收紧空间比例，保留两次明确确认以及跳过入口。修正跳过按钮被内部布局层遮挡。`ParticleHello` 按实际字形边界采样，放大字形、减小深度，聚合后停止整体旋转；沿用单个 GPU Points。
3. `FeatureHub` 改为三个带示意图的创作入口，强化标题与内容层级；辅助入口支持既有手势交互，减少动态效果时禁用预览运动。
4. `CameraPreview` 移除固定显示宽度，视频和骨骼以同一宽高比适配面板。用户截图中的面板窄、视频宽问题修正，骨骼不隐藏，说明不随视频镜像。
5. 调整日间玻璃不透明度和阴影；取消嵌套 HAND_LOST 透明度导致的整体泛白。顶部窄窗口收纳低频入口，底部窄窗口把粗细与历史放入“更多”，保留原业务操作。修正教程图标语义与说明长度。
6. 导航缩略图位置避开属性栏，窄窗口默认收起。所有创作模式继续使用现有共享 Canvas 和识别服务。

## 验证与边界

- `node node_modules/typescript/bin/tsc -b`：通过。
- `node node_modules/vite/bin/vite.js build`：通过；主包 1,991.40 kB，gzip 585.74 kB，仍有体积警告。没有提高告警阈值。
- 独立 Chrome 浏览器上下文，`127.0.0.1:5174/?simulate=1`，隔离 localStorage；通过真实 DOM 控件进入启动、Hello、大厅、画板和摄像头预览。截图覆盖 1440×900、1366×768、768×800、390×844。截图位于 `docs/verification/phase19-*.png`。
- 这是模拟手输入下的视觉检查，不是完整业务回归；未请求真实摄像头或麦克风权限，未验证不同距离的捏合准确率、硬件帧率或真实骨骼追踪质量。
- 未重跑旧阶段完整自动回归。第十八阶段记录的长序列失败、教程导航超时，以及用户反馈的二维/三维静止偏移仍为开放问题。本轮不宣称解决。

## GitHub 参考与许可证

- [Motion](https://github.com/motiondivision/motion/blob/main/LICENSE.md)：GitHub connector 核对 MIT，沿用现有 Motion 微响应与减少动态效果能力。
- [Three.js Points 示例](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_points_sprites.html) 与 [许可证](https://github.com/mrdoob/three.js/blob/dev/LICENSE)：GitHub connector 核对 MIT，参考 Points 的呈现方式，改进项目原有粒子字形采样，没有复制外部实现或增加粒子引擎。
- 未引入 Remotion 实时链路或新增动画库。

## 剩余事项

- 真人静止偏移需最新输入诊断和同一时刻圆形光标/墨迹证据继续定位。
- 完整绘画、模型、工程恢复、导出、语音和长时间资源回归尚未在本阶段执行。
- 旧 PlayLab 源码、兼容命令类型与旧翻译键保留为归档；后续确认不再需要共享类型和历史脚本后可独立清理。
- 主包仍较大；需测量后再拆分低频模型、导出与说明功能，不能以布局修改代替性能验收。
