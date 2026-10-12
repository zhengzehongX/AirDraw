# AirDraw 第二十一阶段开发日志

日期：2026-10-11。本阶段延续 Project Workspace、共享摄像头与单一 AppMode/R3F 场景；没有引入第二套输入/菜单逻辑或新依赖。

## 实施内容

- **模式隔离：** `ProjectStage` 中的工程模型、实体与转换对象只在 `MODEL_CONTROL` 可见；离开模型模式后场景对象以模式权重收起，项目数据仍保留，返回模型工作室可继续编辑。修复此前模型会跟随工程混进绘画页面的问题。
- **连续工具操作：** 对象仍可由模型面板直接选择 Move、Rotate、Scale；在画布区域保持 V 手势约 400ms 循环三种对象工具。双手同时捏合后直接映射世界缩放、平移、环绕和俯仰，不再先打开 Orbit/Pan/Zoom 工具组。现有双手交叉、丢手、身份/输入代次变化与 UI 抢占仍会结束当前会话。
- **空间参照：** Spatial Draw 显示绘画平面的原点、轴线和网格；Model Control 显示地面网格和 Drei XYZ 方位标记。方位标记放在创作区左上，避开覆盖画布右侧的模型工具栏。新工程和重置模型视角使用轻微俯视角；已有工程保存的视角仍优先读取。
- **水面触控：** Model Control 下方增加实时水面。只有共享 PinchContactDetector 已处于 HOLD、InputRouter 将输入交给模型工作区、指向射线落在水面且没有选中对象/双手世界操作/UI 命中时才产生局部波纹。使用八个复用波源与本地 GLSL 位移，没有下载或复制水面源码。
- **Hello 粒子：** 欢迎页增加粒子数量与点尺寸，使用更清楚的日间蓝灰层次；保留既有 GPU Shader 字形聚合、鼠标/新鲜手势指针排斥和减少动态效果路径。
- **渲染修复：** Drei `GizmoHelper` 使用 `renderPriority=2` 时会让 HUD 只绘制 Gizmo portal、跳过默认工作场景。本阶段改为优先级 1，并在说明中留下注释；隔离浏览器从模型球、水面、地面和方位标记重新可见。

## GitHub 参考与许可

- [Drei GizmoViewport](https://github.com/pmndrs/drei/blob/master/src/core/GizmoViewport.tsx)：使用项目已有的 MIT 包/API 显示只读 XYZ 方位标记；未复制实现代码。[Drei LICENSE](https://github.com/pmndrs/drei/blob/master/LICENSE)。
- [Three.js Water2](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/objects/Water2.js)：参考水面交互/材质的视觉目标；本项目波纹 shader 为本地实现，没有复制该文件。[Three.js LICENSE](https://github.com/mrdoob/three.js/blob/dev/LICENSE)。
- [Blender 视口导航说明](https://docs.blender.org/manual/id/4.5/editors/3dview/navigate/navigation.html)：借鉴世界视角与对象操作分离、导航动作可预测的组织方式；没有复制 Blender 源码。[Blender COPYING](https://github.com/blender/blender/blob/main/COPYING) 标明 GPL。
- Remotion 留在视频制作链路之外；这里是实时摄像头/R3F交互，不将其加入 Canvas 或 MediaPipe 渲染过程。

## 验证证据与边界

- TypeScript `tsc -b` 通过；Vite 生产构建通过。构建仍报告主 bundle 约 1.94 MB（gzip 约 573 KB），本阶段未做拆包。
- 隔离 Chrome + SwiftShader：从 Hello 进入功能大厅和 Model Control，确认模型球、水面及网格绘制；切到 Spatial Draw 后模型对象不再可见，绘画网格保留；无浏览器 `pageerror`/console error。此处是视觉/程序场景检查，不等同于真人摄像头性能。
- 合成手势驱动：保持 V 手势后活动工具从 Move 切到 Rotate；在水面中心用合成 pinch 保持后，水面 shader 的八个波源槽中出现新触点时间戳，输入状态为 HOLD。这只验证软件路由，不代表真实手指水面命中准确率。
- 没有运行完整 E2E/30分钟 soak；没有真人手势、双手交叉、不同距离、真实导入模型的完整操作验收。以实机作为最终接触/延迟评估。

## 文件范围

- `src/rendering/three/ProjectStage.tsx`：按 Model Control 模式权重显示工程 3D 对象。
- `src/rendering/three/Scene3D.tsx`：XYZ 方位标记、空间网格、水面层、恢复主场景渲染。
- `src/rendering/three/WaterTouchSurface.tsx`：水面触点射线、输入仲裁与波纹 Shader。
- `src/model/worldNavigation.ts`：双手直接视口操作、默认/重置视角。
- `src/model/modelController.ts`、`src/App.tsx`、`src/components/ModelDock.tsx`：V 手势工具轮换和工作区说明。
- `src/rendering/three/ParticleHello.tsx`：Hello 粒子对比与尺寸；`src/i18n/zh.ts`、`src/i18n/en.ts`：双语文案。
- `README.md`、`USER_GUIDE.md`：当前模式行为和使用步骤。

## 后续真人验收

1. 保持同一工程在 Model Control、Spatial Draw、Canvas Draw 间往返：模型只在模型模式显示、项目对象仍可回来编辑；三种模式的场景不闪黑或留下旧页面元素。
2. 真人以单手 pinch 分别 Move、Rotate、Scale，再用 V 手势切工具；确认落点无跳变、每次松手释放对象。
3. 双手 pinch 分别开合、横移、转动连线、上下移动；中断/交叉后不残留变换，松开并重新捏合可恢复。
4. 用真实手指指向水面并捏合轻滑；确认触点位置与屏幕预览一致，选择模型或操作 UI 时水面不抢事件。
5. 比较 Hello 粒子静止和指针经过时的扩散；检查减少动态效果与窄窗口可读性。

