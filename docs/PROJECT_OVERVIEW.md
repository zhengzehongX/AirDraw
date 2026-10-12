# AirDraw 项目说明 | Project Overview

## 中文
AirDraw 是一款基于 React、TypeScript、Three.js / React Three Fiber 与 MediaPipe Hand Landmarker 的浏览器创作工具。它将二维绘画、三维空中笔迹、模型导入和手势变换放在统一工程中。食指用于指向，捏合用于绘画或操作对象，双手用于导航 3D 世界；支持本地保存、撤销/重做、材质和多种导出。

项目持续开发中。手静止后光标与笔迹仍可能存在偏移；真人摄像头、双手稳定性与硬件帧率需要单独实测。摄像头帧和关键点在浏览器内处理。浏览器语音识别可能依赖厂商在线服务，不能承诺离线。工程保存在浏览器本地，重要作品请导出 AirDraw JSON 备份。

- 当前功能：Canvas Draw、Spatial Draw、Model Control。
- 互动玩具已从当前应用入口和运行时移除；历史日志仅作开发记录。
- 环境：Node.js 20+、npm、现代 Chromium；摄像头需 localhost 或 HTTPS。
- 启动：npm install，然后 npm run dev。生产构建：npm run build。
- 文档：[快速入门](QUICK_START.md)、[中文指南](USER_GUIDE_ZH.md)、[English guide](USER_GUIDE_EN.md)、[摄像头架构](camera-architecture.md)、[工程数据格式](project-schema.md)。
- 模型授权见 [ATTRIBUTION.md](../public/models/library/ATTRIBUTION.md)。项目当前没有根许可证；复用源码前需确认权利状态。

## English
AirDraw is a browser-based creative workspace built with React, TypeScript, Three.js / React Three Fiber and MediaPipe Hand Landmarker. It brings together 2D drawing, 3D air strokes, model import and gesture transforms in one project. The index finger points, pinches draw or manipulate objects, and two hands navigate the 3D world. It supports local project storage, undo/redo, materials and multiple export formats.

The project is under active development. Pointer/stroke drift may remain after the hand becomes still; real camera, two-hand stability and hardware frame rate require separate testing. Camera frames and landmarks are processed in the browser. Browser speech recognition may rely on vendor online services and is not guaranteed offline. Projects live in browser storage; export AirDraw JSON to back up important work.

- Current workspaces: Canvas Draw, Spatial Draw and Model Control.
- PlayLab toys have been removed from the current application; older logs are historical records.
- Requirements: Node.js 20+, npm and a modern Chromium browser; camera access requires localhost/HTTPS.
- Start: npm install, then npm run dev. Production build: npm run build.
- Docs: [Quick start](QUICK_START.md), [English guide](USER_GUIDE_EN.md), [中文指南](USER_GUIDE_ZH.md), [Camera architecture](camera-architecture.md), [Project schema](project-schema.md).
- Model terms are documented in [ATTRIBUTION.md](../public/models/library/ATTRIBUTION.md). There is currently no root-level project license; clarify reuse rights before redistribution.
