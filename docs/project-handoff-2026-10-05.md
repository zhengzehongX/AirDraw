# AirDraw 项目状态与交接记录

盘点日期：2026-10-05  
盘点范围：README、USER_GUIDE、第二至第四阶段日志、`src/`、配置与依赖、`scripts/`、`public/`、目录结构及源码注释。  
本次只做静态核对并新增本文档；没有修改应用代码，也没有运行测试或构建。仓库目录没有 `.git`，无法核对提交历史、当前分支或工作区差异。

## 状态摘要

第四阶段的产品 Demo 主体已实现，项目不是从零原型：摄像头视觉输入、统一手势引擎、3D 管体笔迹、空间手势 UI、教程、Guide、作品库和诊断面板都有具体实现。现状更准确地说是“功能覆盖较广、仍需数据恢复与安全语义收口，并缺少本轮运行验证”，不宜仅凭 README 标注为完全完成。

## 规划功能核对

| 分类 | 源码核对结果 |
| --- | --- |
| **已完成** | React 19 + TypeScript + Vite 8；Three.js / R3F 场景；MediaPipe Hand Landmarker 双手 21 点追踪及合成 provider；POINT、PINCH、OPEN_PALM、FIST、VICTORY 分类；主手选择、坐标映射、滤波、异常点抑制与重捕获；3D Tube/曲线笔迹和 Candy、Plastic、Metal、Glass、Neon 材质；GestureInteractionManager 统一 hover/press/drag/hold/release、作用域和冷却；Spatial Dock、查看模式、撤销/重做/局部擦除/长按清空；Hello 粒子开场；11 课教程、应用内 Guide/练习、USER_GUIDE；Gallery 基本打开/复制/删除/PNG/JSON 导入导出；IndexedDB 作品存储与内存回退；日夜主题插值；性能 governor 和 Developer Mode 指标。 |
| **部分完成** | 摄像头、WebGL、安全上下文和初始化失败有说明/重试页面，但运行中断流、设备拔出或持续推理失败没有可靠的状态转换；真机真实手的端到端标定没有在本次审查中验证。Gallery 有基本作品管理但无改名/排序；导入有结构检查但不构成完整 schema/范围校验。无接触交互有鼠标兜底，JSON 文件选择明确依赖系统鼠标/键盘。偏好系统包含主题、画笔字段，但主题切换与画笔状态没有统一接入。 |
| **未完成** | 笔迹文字识别/3D 文字挤出、TensorFlow.js provider、录屏、云端/多设备同步；Phase 4 日志建议的统一开场与工作室 WebGL 上下文尚未实现；跨肤色、光照、遮挡的真实手部标定与用户体验验证。 |
| **存在问题** | Gallery 的长按删除确认按钮同时绑定直接 `onClick={onConfirm}`，鼠标短按会立即删除，绕过源码中设定的 1 秒确认环。打开作品只载入 strokes/theme/camera，没有载入作品保存的 brush。`preferences.brush` 未用于初始化或在 Dock 改变时写回，所以换色/粗细/材质不会作为下次启动默认值恢复。`reducedMotion: system` 没有通过已有的 `prefersReducedMotion()` 接入 React 动画 props。模型回退顺序在本地 GPU 初始化失败后先试远程 GPU 模型，再试本地 CPU 模型，与“无需联网”的文档承诺不一致。JSON 导入仅检查 x/y/z 有限值，未约束坐标、宽度、颜色、camera 数值范围和输入体量。IndexedDB 失败会改用内存，但 UI 未提示持久化失效。主题 toggle 写独立的 `airdraw-theme`，Settings 写 `airdraw-preferences-v1`，二者可能互相覆盖；toggle 结果也未同步到 Preferences。包版本 `0.1.0` 与 Settings 展示版本 `0.4.0` 不一致。 |

> 上述“存在问题”为源码静态核对结果，未在本轮通过浏览器回归复现；请修复后加入针对性回归。历史阶段日志记录 `typecheck/build`、75 项 core 和 53 项 e2e 通过，但那是日志中的既有记录，不代表本次重新验证。

## 技术栈与模块地图

- **应用装配**：`src/App.tsx` 连接状态机、手势路由、教程信号、主题、作品库与页面。
- **状态/偏好**：`src/app/appState.ts` 是 launch → permission → tutorial/studio → help/gallery/settings 的 reducer；`preferences.ts` 管本地偏好。
- **视觉追踪**：`src/hooks/useHandTracking.ts` 管摄像头和 provider 生命周期；`src/services/handTracking/` 含 MediaPipe、模型/相机加载和合成输入。
- **手势与绘制**：`src/utils/gesture/`、`src/utils/smoothing/`、`src/utils/stability.ts`、`src/engine/DrawEngine.ts`、`StrokeStore.ts`。
- **交互 UI**：`src/interaction/GestureInteractionManager.ts` 和 `useInteractive.ts` 提供单一手势语义中心；`src/components/SpatialDock.tsx`、Guide、Gallery、Settings 等消费注册区域。
- **渲染/数据**：`src/rendering/three/Scene3D.tsx` 管 R3F 场景，`LiveTube.ts` 管实时管体，`materials.ts` 管材质；`storage/artworks.ts` 管 IndexedDB。
- **验证脚本**：`scripts/selfcheck.ts`、`gestureDriver.mjs`、`e2e.mjs`；自动化使用合成手，不替代真实摄像头/真实人手验证。

## 启动与常用入口

```bash
npm install
npm run dev          # http://localhost:5173（摄像头需 localhost 或 HTTPS）
npm run typecheck
npm run build
npm run verify:core
npm run e2e
```

`?simulate=1` 用合成手，`?debug=1` 开 Developer Mode，`?mirror=0` 关闭镜像。`public/models/hand_landmarker.task` 和 `public/mediapipe/wasm/` 已随项目存在。包脚本不含独立 `test` 命令。

## 已知技术债与下一步优先级

1. **先收紧作品安全和恢复语义**：移除 Gallery 确认按钮的短按删除旁路；打开作品时恢复 brush；统一 brush 偏好真源；对 JSON 导入做严格 schema、值域和体量校验。
2. **统一持久化与主题偏好**：让设置、顶栏主题按钮、作品打开后的主题选择走同一状态；明确 IndexedDB 回退到内存时提示“仅本次会话保存”。
3. **补齐系统辅助与相机异常**：让 `system` 减弱动效真正控制 JS 动画；监听 MediaStreamTrack `ended` 与持续识别异常，显示准确错误并可重试。
4. **先跑已有验证，再做真机标定**：运行 typecheck/core/e2e，修正回归；随后在真实摄像头下覆盖不同手部、距离、照明、遮挡和运行中拔出设备场景。合成手通过不等于人体工学已验证。
5. **再处理产品体验债**：Gallery 改名/排序，设置长页导航与小屏手势命中，手势翻页按视口缩放；评估开场/工作室共享 WebGL 上下文；最后再推进 i18n、TfJS、多手势扩展等第五阶段方向。

后续 Agent 应沿现有 reducer、DrawEngine/provider、GestureInteractionManager 和 StrokeRenderer 接口渐进修改；先保护已工作的 3D 笔迹与作用域隔离，不重写主架构。
