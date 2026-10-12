# AirDraw 第二阶段开发日志

日期：2026-10-03
范围：更稳定的视觉识别 + 可扩展手势识别系统 + Three.js 真正 3D 绘画。
第一阶段能力（摄像头授权、MediaPipe 追踪、食指指针、捏合绘画、撤销/清空、调试面板）全部保留。

---

## 1. 参考的 GitHub 项目与实际采纳点

| 项目 | 采纳的内容 | 未采纳 / 改造的内容 |
| --- | --- | --- |
| `google-ai-edge/mediapipe-samples-web` | 视频循环骨架：`video.currentTime` 同帧去重守卫；`timestamp = now > last ? now : last + 1` 的单调时间戳钳制（`detectForVideo` 拒绝非递增时间戳）；`numHands: 2` + 三个 0.5 置信度阈值的初始化方式 | 未引入 Web Worker 中转（当前主线程同步检测 + 限频已够用，减少工程复杂度）；未照搬其“不做任何平滑”的做法 |
| `google-ai-edge/mediapipe`（web tasks API） | 确认 `HandLandmarkerResult` 只有 `landmarks / worldLandmarks / handedness(Category+score)`，**没有逐关键点置信度** → 调试面板的“置信度”使用 handedness score；采用 `worldLandmarks`（米制、腕心坐标）作为深度反馈来源 | 不把 worldLandmarks 直接映射为世界坐标（单目深度抖动大），仅做笔刷调制 |
| `tensorflow/tfjs-models`（hand-pose-detection demo） | 适配器接口形状参考其 `estimateHands()` 输出：`{ keypoints, keypoints3D, handedness: string, score }` → 我们的 `HandTrackingProvider` / `TrackedHand` 按此设计，未来可无缝接入 tfjs 做性能对比 | 未安装 tfjs（避免破坏当前包体积与工程结构）；未采纳其无同帧守卫的裸 rAF 循环 |
| `andypotato/fingerpose` | 手势分类思想：三点（mcp/pip/tip）内角法计算 finger curl，阈值 130°/60° 划分 NoCurl/HalfCurl/FullCurl；`GestureDescription` 加权评分（匹配 +w、不匹配 −w，归一化到 0–10）与 minScore 门槛 | 未使用其屏幕空间 direction 投票（相机相对方向随手部旋转翻转，噪声大）；补充了 fingerpose 没有的**时间迟滞**（连续 3 帧确认 + duration 累计） |

## 2. 实际采用的技术

- **统一数据层**：`HandTrackingResult { hands: TrackedHand[], timestamp, inferenceMs, videoWidth/Height, source }`；
  `TrackedHand { landmarks(21 归一化), worldLandmarks(米制), handedness, score }`。
  `HandTrackingProvider` 接口下有 `MediaPipeHandProvider`（生产）与 `SyntheticHandProvider`（`?simulate=1`），
  tfjs provider 只需实现同一接口。
- **稳定性联合判断**：
  - `VelocityLimiter`：单帧步长超过硬阈值视为异常点并**保持上一位置**；连续 3 帧异常才接受（真实重入）；
    合理但过快的步长按最大速度钳制（把 1 帧尖峰变成几帧的平滑追赶）；
  - `PalmScaleSmoother`：手掌尺度做 ±30%/帧 速率钳制的 EMA，防止单帧 glitch 改变捏合归一化基准；
  - **重捕获缓冲**：丢失/换手后先缓存 3 帧取中位数作为滤波器重置锚点，再允许落笔；
  - One Euro（指尖）+ EMA（捏合比例、深度 z）保持不变；
  - 捏合 = 拇指尖-食指尖距离 ÷ 当前手掌尺寸，`pinchStartThreshold 0.45 / pinchReleaseThreshold 0.62` + 连续 3 帧确认。
- **GestureEngine**（独立模块，不散落在组件里）：POINT / PINCH / OPEN_PALM / FIST / VICTORY，
  输出 `{ gesture, confidence(0–10), durationMs, handedness }`；PINCH 优先于 curl 描述。
  本阶段实际操作仍为 POINT=移动指针、PINCH=落笔。
- **危险操作长按阈值**：`HoldActionController` —— 握拳保持 1.5s 撤销一笔、张掌保持 3s 清空，
  带进度 toast，松开即取消；触发后手势引擎复位防止连发。
- **双手识别**：`PrimaryHandSelector` 粘性主手选择（置信度边际 0.25 + 连续 10 帧才切换），
  副手只追踪与显示，防止左右手来回切换造成笔迹跳跃。
- **3D 绘画**：Three.js + React Three Fiber + Drei。
  - 笔画点存**归一化绘画平面坐标**（x/y∈[0,1]，镜像只应用一次），2D/3D 渲染器共用同一份历史；
  - 实时预览用预分配 BufferAttribute 的 `THREE.Line`（零每帧分配），落笔完成转
    `距离采样 → CatmullRomCurve3 → TubeGeometry` 的真实体积 Mesh；
  - 材质：`MeshPhysicalMaterial` 五预设（Candy / Glossy Plastic / Metal / Glass / Neon），
    统一 `MaterialPreset` 数据结构；材质实例按 (preset,color) 共享缓存并统一 dispose；
  - 灯光：环境光 + 主方向光 + 紫色轮廓光 + Drei `Environment`（本地 Lightformer 探针，**不联网**）+
    mipmapBlur Bloom（阈值 0.82、强度 0.55，控制曝光）；
  - 摄像机绘写时固定；“查看模式”下 OrbitControls 限制角度/距离的轻微旋转；
  - 资源管理：undo/clear/质量切换时 dispose geometry；单笔点数上限 400（超限折半压缩）；
    材质缓存有界（调色板 × 预设）。
- **性能自适应**：`usePerfGovernor` 以 min(主线程 rAF fps, 场景 fps) 为信号，带迟滞地切换
  high/medium/low 三档：检测频率 30/24/18、tube 径向段 12/8/6、tubular 倍率、Bloom 开关、
  环境探针分辨率、DPR 上限、采样密度；**不触碰手势识别阈值**。
- **调试面板增强**：camera/render/scene fps、推理耗时、draw calls、geometries、quality tier、
  手势+置信度+保持时长、hands/主手/置信度、pinch 归一化距离刻度条、depth z、outliers、traj points、view。
  摄像头预览增加：双手骨骼、主手高亮、拇指-食指 pinch 连线、手势标签。

## 3. 修改 / 新增的模块

- 新增：`src/rendering/three/{Scene3D.tsx, materials.ts, plane.ts}`、`src/utils/gesture/{curl.ts, GestureEngine.ts, holdActions.ts}`、
  `src/utils/stability.ts`、`src/utils/primaryHand.ts`、`src/hooks/usePerfGovernor.ts`、
  `src/services/handTracking/{MediaPipeHandProvider.ts, SyntheticHandProvider.ts}`、`scripts/e2e.mjs`、`public/favicon.svg`。
- 重写：`src/types/{hand.ts, drawing.ts}`（HandTrackingResult / 平面坐标 Point / 材质与手势类型）、
  `src/engine/DrawEngine.ts`（多手、平面坐标、稳定性链、手势与长按接入）、
  `src/engine/StrokeStore.ts`（z 分量、材质、点数上限压缩）、
  `src/rendering/canvas2d/Canvas2DStrokeRenderer.ts`（平面→屏幕映射）、
  `src/hooks/useHandTracking.ts`（provider 化）、工具栏/预览/调试面板/状态层组件。
- 删除：`HandTrackingService.ts`、`simulation.ts`（由两个 provider 取代）。
- 保留：`StrokeRenderer` 接口（2D 实现 + 3D 场景并行消费引擎数据）、第一阶段全部交互与错误处理。

## 4. 当前性能数据

| 环境 | 数据 |
| --- | --- |
| 真实 GPU 浏览器（第一阶段实测，仍适用） | detect 29–30 fps（限频 30）、主线程 render 144 fps、推理 GPU delegate <1 ms |
| 无头 Chrome + SwiftShader 软件渲染（e2e） | scene fps 38–59，governor 自动降档 `low`（detect 限频 18、实测 14–16），Bloom/环境探针自动关闭 —— 自适应机制按预期工作 |
| GPU 资源 | 2 笔时 draw calls 3、geometries 3；clear 后 geometries 回到基线 2（网格+线），无泄漏 |
| 单笔几何 | 高档位 ~2.0–2.5k 顶点/笔（tubular≤700、radial 12），点数上限 400 |
| 核心逻辑自检 | `npm run verify:core` 50 项断言全过 |
| 端到端自检 | `npm run e2e` 19 项断言全过（含撤销/清空的 dispose、材质切换、2D/3D 切换、双手粘性、长按撤销 toast、手势时间线） |

## 5. 已知问题

- 软件渲染（无 GPU）环境下 governor 会长期停在 low 档：画面朴素但功能完整；真实 GPU 上为 high 档。
- Glass 预设使用 transmission，在低配 GPU 上开销明显（已由 governor 的 DPR/段数降级部分缓解）。
- 手势置信度在手部快速翻转时会在 POINT/NONE 间短暂摆动（3 帧确认已把误触控制在 ~100ms 内）。
- 真实摄像头 + 真手的端到端验证仍缺（自动化环境无物理手）；捏合/手势阈值集中在 `src/config.ts`。
- 查看模式下 OrbitControls 与 DOM 指针叠加层并存，旋转时指针位置不随视角反投影（设计如此：绘写时摄像机固定）。

## 6. 第三阶段待开发

1. Hello 粒子聚合开场与粒子爆炸（复用 `CursorState`/指标流驱动粒子系统）。
2. 新手教程动画（分步引导：举手 → 移动 → 捏合，用 `PointerState`/`GestureState` 做进度判定）。
3. 文字自动识别与 3D 文字挤出（笔画 Mesh → 字形分析 → ExtrudeGeometry）。
4. TensorFlow.js hand-pose-detection provider 实装与 MediaPipe 的性能/精度对比面板。
5. 复杂双手交互（副手从“仅追踪”升级为控制：缩放/旋转画布、橡皮等）。
6. 录屏导出（`canvas.captureStream()` + MediaRecorder）。
7. AI 内容生成（草图 → 生成式补全）调研。
