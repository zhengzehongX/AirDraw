# AirDraw 第三阶段开发日志

日期：2026-10-04
目标：从"手势绘画工具"升级为**完全依靠摄像头视觉识别的无接触 3D 创作应用**。
第一、二阶段能力（MediaPipe 关键点、GestureEngine、3D 笔迹、材质系统、撤销/清空、调试与性能监控）全部保留。

---

## 1. 手势操作表（Gesture UI Interaction System）

| 手势 | 语义 | 判定细节 |
| --- | --- | --- |
| `POINT` 食指指向 | 移动空间光标 | 食指伸展 + 其余三指弯曲；光标为柔和圆形指示器，靠近按钮时磁吸 |
| `PINCH` 捏合 | 主确认动作（= 点击） | 必须"指向目标 → 稳定悬停 90 ms → 捏合 → 在目标上释放"才生效 |
| `PINCH + MOVE` | 拖动：滑块、笔刷大小、视角旋转 | 按压后位移超过 10 px 进入 drag 态，取消激活 |
| `OPEN_PALM` 张掌保持 ~0.7 s | 呼出 / 收起工具 Dock | 手离开 Dock 区域 1.4 s 后自动收起 |
| `FIST` 握拳 | 暂停绘制 / 锁定输入 | **不执行任何危险操作**；锁定期间取消未完成按压 |
| `VICTORY` 剪刀手 | 进入 / 退出查看模式 | 边沿触发，进入后摄像机可旋转 |
| 长按捏合（1 s） | 清空确认环 | Clear → 浮层 → "Hold to Clear" 走完整环才执行 |
| 长按捏合（1.5 s / 3 s） | 二阶段遗留的握拳撤销 / 张掌清空 | 已在三阶段移除，改为 Dock + 确认环（见 §5） |

防误触机制：全局手势锁与 350 ms 冷却（一次捏合绝不触发两个按钮）、悬停 dwell 门槛、
离开目标即取消按压、手部丢失立即取消所有未完成交互、UI 命中区比视觉尺寸大 10 px 并带磁吸。

## 2. 架构

```
src/
├── theme/
│   ├── themes.ts              # 日夜两套端点值（颜色 + 灯光 + Bloom + 玻璃参数）
│   └── themeController.ts     # 0.8 s 缓动插值：写 CSS 变量 + 通知 Three.js
├── interaction/
│   ├── GestureInteractionManager.ts  # 唯一的手势 UI 语义中心（hover/press/drag/hold/cooldown/handLost）
│   ├── useInteractive.ts             # 注册区域 + 输出 MotionValue（scale/glow/hold）
│   └── SpatialCursor.tsx             # 空间光标（磁吸、按压压缩、丢失淡出）
├── components/
│   ├── TopStatus.tsx          # 顶部居中极简状态（含 "Show your hand"）
│   ├── ThemeToggle.tsx        # 日月形态转换按钮
│   ├── CameraStatusDot.tsx    # 右下角极简摄像头状态点（捏合展开预览）
│   └── SpatialDock.tsx        # 悬浮 Dock + 颜色/材质球 + 弧形滑杆 + 清空确认环 + 设置
├── rendering/three/
│   ├── LiveTube.ts            # 预分配环形缓冲的增量生长管（每帧只画新段）
│   ├── inspectController.ts   # 查看模式：带惯性阻尼与幅度限制的球坐标
│   ├── plane.ts               # 平面↔世界映射 + 转角保持重采样（抽稀时保留 knot）
│   └── Scene3D.tsx            # 主题灯光 / 笔迹按块合并（24 笔一块）/ 出现与消散动画 / 笔尖球 / 端帽 / 色相微变
├── engine/
│   ├── DrawEngine.ts          # + uiHovered 门、inputLocked、inspectMode、redo、erase、save/restore
│   └── StrokeStore.ts         # + committedPointCount 与 commit-time LOD（墨量预算）
└── App.tsx                    # 手势→语义装配、Dock 启闭、Focus Mode、主题、保存/恢复
```

**核心消歧规则**：`pinch 命中 UI 区域 = 点击`，`pinch 在画布上 = 落笔`，二者互斥
（`engine.setUiHovered()`）。这条规则是"无鼠标可用"的前提，也是二阶段测试暴露的真实缺陷。

## 3. 3D 笔迹流畅度改造

- 流水线：原始 landmark → 异常点剔除 + 速度钳制 → One Euro / EMA → 距离重采样（含**转角保持**）
  → Catmull-Rom → 平面/世界坐标映射。
- **绘制中**：`LiveTube` 预分配 720 环 × 10 段顶点的 position/color/index 缓冲，
  每个新采样点只追加一个环并推进 `drawRange`，**不再每帧重建整条 TubeGeometry**。
- **抬笔后**：在提交路径一次性生成高质量 `CatmullRomCurve3 + TubeGeometry`，
  并用 `mergeGeometries` 融合两端球体作为圆润端帽；撤销/清空/换档时 dispose。
- **已提交笔迹按块合并**：`planInk()` 把连续同材质同颜色的笔迹每 24 笔合成一个 chunk，
  一个 chunk 只有一个 mesh（签名 = 材质|颜色|笔迹 id 列表），签名命中缓存就不重建，
  因此画 96 笔仍只有 ~8 个 draw call；否则每笔一个 mesh，帧时间随笔数线性增长。
- **入场动画只给最新一笔**：历史笔迹是静态 mesh，不再各自挂 `useFrame`；
  `StrokeMesh`/`DyingStroke` 动画结束后 `settled/finished` 立即短路，避免常驻每帧回调。
- **落笔期墨量预算（commit-time LOD）**：`Stroke` 带 `lod` 因子，提交时按
  `INK_BUDGET_POINTS / 已提交点数` 计算（下限 `INK_LOD_MIN`）。
  只影响**之后**新画的笔迹，已着墨的不重建；实测 96 笔连续书写时
  每笔新增三角形从 2051 降到 608（约 3.4 倍），场景总三角数从 ~260k 压到 ~168k。
- **重采样压缩也保转角**：`resamplePolyline` 的 stride 抽稀会强制保留 `knot`（转角点、端点），
  否则 LOD 变粗时汉字折角会被抽掉（`decimation keeps corner knots`）。
- 笔尖跟随：3D 预览球（直径≈笔刷）以 60 fps 向指尖插值（`delta * 22`），捏合后与新生笔迹自然相连。
- 材质：一笔沿轨迹有 ±0.022 的极细微色相漂移（顶点色），不闪变；高光随日夜环境联动。
- 采样密度自适应：governor 档位决定 `minPointDistance` 与 `tubularScale`，慢写更细、快挥更疏。

## 4. 日夜主题系统

单一 0.8 s 缓动插值同时驱动：CSS 变量（背景、玻璃、文字、阴影、模糊半径）与
Three.js（环境光/主光/轮廓光强度、`scene.environmentIntensity`、Bloom 强度、
背景色、材质 `envMapIntensity`、网格透明度）。切换过程中手部追踪与绘制完全不受影响；
`prefers-reduced-motion` 下时长收敛为 1 ms（结果一致，无动画）。主题偏好写入 localStorage。

## 5. 与二阶段的差异与取舍

- 移除引擎内置的"握拳 1.5 s 撤销 / 张掌 3 s 清空"：与三阶段的 `FIST=暂停`、`OPEN_PALM=Dock`
  语义冲突，危险操作统一改走 Dock + 确认环（更符合"绝不因快速手势误删"）。
  随之删除只服务于该逻辑的 `src/utils/gesture/holdActions.ts` 与 `HOLD_UNDO_MS / HOLD_CLEAR_MS`
  配置项——长按确认改由 `GestureInteractionManager` 的 `holdMs / onHoldProgress / onHoldComplete` 承担
  （`CLEAR_HOLD_MS`）。
- 移除常驻左侧工具栏与常驻摄像头预览：改为自动隐藏 Dock 与状态点；骨骼与指标只在 Developer Mode 出现。
- 颜色/材质球使用 CSS 渐变模拟真实材质（candy/metal/glass/neon 各有高光与反射配方），
  而非为每个球开一个 WebGL 上下文——浏览器上下文数量与性能都不允许。
- 动画统一使用 framer-motion（MotionValue 直驱 DOM/材质），未混入第二套动画库。
- 停留/冷却等时序参数集中到 `src/config.ts`（`HOVER_DWELL_MS`、`GESTURE_COOLDOWN_MS`、
  `DOCK_OPEN_HOLD_MS`、`CLEAR_HOLD_MS`、`FOCUS_MODE_RETURN_MS`），交互管理器直接引用同一份常量，
  避免两处定义漂移。

## 6. 自检结果

`npm run verify:core`：**60 项断言全部通过**（含转角保持、抽稀时保留转角节点、重采样端点、
点数压缩、材质预设随笔画提交、墨量预算 LOD 递减）。
`npm run typecheck` / `npm run build`：无错误。
`node scripts/e2e.mjs`：**21 项手势 UI 断言全部通过**，包括

- OPEN_PALM 呼出 Dock、Color 浮层捏合展开、**连续 20 次按钮选择全部命中**；
- 捏合未松开快速扫过多个按钮 → 零误选；
- 手部丢失 → 顶部 "Show your hand" + 取消未完成按压 + 恢复后仍可正常选择；
- 双手同框选择、捏合绘制 3D 笔迹、**捏合切换日夜且绘制不中断**；
- 撤销 ×3 / 重做 ×2 栈计数正确；
- VICTORY 进出查看模式、PINCH+MOVE 带阻尼旋转（相机 x 0 → -7.62）；
- Clear 二次确认：Cancel 保留作品，Hold-to-Clear 走完确认环才清空且场景图回落；
- FIST 锁定：在途笔画收尾、`locked=true`、恢复后可继续画；
- 全流程零控制台错误。

性能与长跑（`SOAK_MS=900000`，21 项功能 + 8 项长跑断言 = **29/29 全通过，全程零控制台错误**）：

- **阶段 A：12 个「书写 24 笔 → 清空」周期**（15 分钟内约 288 笔）。每个周期画满时
  draw calls 5 / geometries 11–13 / scene children 8–9 / 三角形 ≈70k / scene fps 4–8；
  清空后 2 / 11 / 6 / 352 / 18–19。**12 个周期数值重复**（空场景 fps 19 → 最差 18 → 19），
  说明没有 mesh、材质、对象泄漏，空场景帧率不随时间下降。
- **阶段 B：96 笔不清空的堆积**。draw calls 5→7（合并成块）、geometries 13→14、
  三角形 72.6k→160.4k，而**每新增一笔的增量从 2041 降到 610 个三角形**（墨量预算生效 3.3 倍）；
  清空后回到 calls 2 / geo 11。
- **改造前同一测试的对照**：83 笔 → 85 draw calls / 93 geometries / 225k 三角形 / 2 fps；
  298 笔 → 307 geometries（每笔一个 mesh、每笔一个常驻 `useFrame`）。
- 长跑断言刻意分成「有界画布循环」与「无界堆积」两段：前者才是在找泄漏，
  后者量到的是软件光栅吞吐（headless SwiftShader ≈10k 三角形/fps），不是应用缺陷。
- **e2e 驱动改为按帧确认而不是按时间确认**：手势需要 3 帧确认，软件渲染下 3 帧可能超过 800 ms，
  固定时长的 `gesturePose('fist', 800)` 会在确认落地前就采样（曾因此出现一次 FIST 断言假失败）；
  新增 `poseUntil(mode, expect, holdMs)` 保持姿态直到引擎报告该手势，再额外保持一小段。
- 其余：真实 GPU 下检测 29–30 fps、推理 <1 ms、渲染 60+ fps。
- **真机（真实摄像头 + 真实手）验证方式**：Qoder 内置浏览器面板对 `localhost` 是 `denied`，且面板隐藏时
  rAF 被节流，不适合真手测试。用独立 profile 启动一个真实 Chrome 窗口并自动放行摄像头提示：

  ```bash
  chrome.exe --user-data-dir="$LOCALAPPDATA/AirDrawCameraProfile" \
    --use-fake-ui-for-media-stream --remote-debugging-port=9333 \
    "http://localhost:5173/?debug=1"
  ```

  `--use-fake-ui-for-media-stream` 只跳过授权气泡、仍使用**真实**摄像头
  （不要加 `--use-fake-device-for-media-stream`，那是假视频）。经 CDP 连接后实测：
  `permissions.query({name:'camera'}) = granted`、`video 1280x720 ready=4 playing`、
  camera 20–29 fps、GPU delegate、inference 17.3 ms、render 61–74 fps、quality high，
  `OPEN_PALM`（10.0）与 `PINCH → Drawing` 由真实手势触发，双手切换与丢失/恢复正确，零控制台错误。

## 7. 已知问题

- 光标从静止到 350 px 级大幅移动需要约 0.5 s 收敛（速度钳制 + One Euro 的代价）：
  换来的是不飞线、不跳点；快速连续点选时表现为"手指到位后再捏"，符合真实使用节奏。
- Dock 自动收起判定基于光标离开区域 1.4 s：从 Dock 直接下笔会被视为"离开"，需再次张掌呼出。
- 查看模式旋转时 DOM 光标不随视角反投影（绘写时摄像机固定，不影响落笔）。
- **软件渲染下帧时间由三角形/片元吞吐决定**：无头 SwiftShader 约 10k 三角形/fps 上限，
  画满 24 笔（~70k 三角形）时 scene fps ≈ 4，清空即回到 18。draw call、geometry、object 数量
  已不随笔数线性增长（96 笔仍 8 个 draw call），墨量预算也让每笔增量从 2051 降到 608 三角形；
  剩下的开销是"画面里确实有很多体积笔迹"本身，真实 GPU 下不构成限制。
- 墨量预算会让"已经画满之后"的新笔迹沿笔迹长度方向变粗（radial 段数不变，圆度保持）：
  这是刻意取舍——已着墨的笔迹永不重建，避免撤销/擦除时出现整场景重建的卡顿。
- 仍未用真实手部做端到端验证；阈值集中在 `src/config.ts`。

## 8. 第四阶段建议

1. Hello 粒子聚合开场 + 粒子爆炸（复用 `CursorState` / `GestureState`）。
2. 新手教程：用真实手势一步步教（举手 → 移动 → 捏合 → 张掌呼出 Dock）。
3. 文字识别与 3D 文字挤出（笔迹 Mesh → 字形 → ExtrudeGeometry）。
4. TensorFlow.js hand-pose-detection provider 实装与双引擎对比面板。
5. 副手控制画布（缩放/平移/橡皮），保留主手粘性策略。
6. 录屏导出与作品库（localStorage 已具备保存/恢复基础）。
7. 光标预测（在收敛延迟与跟手之间做前馈补偿），以及真实手部阈值标定。
