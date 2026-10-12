# AirDraw

## 第十七阶段：坐标、笔迹与导出整改（验收进行中）

本轮修正 Canvas DPR 初始化、统一光标与落笔坐标、移除三维笔迹围绕世界原点缩放、统一二维 freehand 工具路径和纸张背景，补齐作品画面合成及 WebM，并拆分 PlayLab 主副手捏合会话。未新增依赖或第二套识别服务。

当前自动证据：`scripts/phase17-core.ts` 18/18；`node scripts/phase17-e2e.mjs` 21/21（合成手、隔离 Chrome/SwiftShader）。包含四档 DPR × 四档尺寸实际墨迹像素、三次三维笔画提交、二维 PNG 与解码后 WebM 墨迹像素、混合合成状态恢复。类型检查和生产构建通过，主包仍有体积警告。

**真人反馈：连续绘画已不再断笔，但 Canvas Draw 与 Spatial Draw 均仍有偏移和静止抖动。** 已增加共用 2 CSS px 稳定区和三维实际深度射线修正，尚未获得这些最新修改的真人验收；不能称坐标问题全部解决。完整的菜单/导航恢复、混合工程、保存重开、窄屏、橡皮擦与双手交叉回归仍需补齐。旧日志测试不作为本轮验收。

详细变更、参考许可证、测试边界及后续任务见 [第十七阶段日志](docs/phase17-log.md)。本节优先于下方历史进度。

举起一只手，用**食指**当指针、**拇指与食指捏合**当笔尖，对着摄像头在空气里写字画画。
每一笔都会成为**圆润、连续、有真实厚度和游戏级材质高光的 3D 笔迹**。
完成一次浏览器摄像头授权后，工作区支持手势操作。浏览器授权弹窗与本地文件选择器仍需要系统输入。
摄像头画面与手部数据在浏览器本地处理，不上传、不录制；用户可主动录制创作 Canvas 为 WebM。

当前进度：**第十五阶段（工作区排版与浮层专项）已交付顶栏三区、设备/项目/帮助菜单、摄像头预览左下化与 Dock 浮层锚定；右侧属性栏改为布局列仍未完成**。
最新说明：[第十五阶段日志](docs/phase15-log.md)（遮挡类缺陷的根因链与实测）、[第十四阶段](docs/phase14-log.md)（坐标与导航）、[第十三阶段日志](docs/phase13-log.md)（字阶/间距/转场/微响应/响应式实测）。本节优先于下方历史阈值、启动与测试说明。

- 第九至十一阶段已交付：Hello 粒子首页与五态状态机、功能大厅、统一工作区布局（顶栏/底部 5–7 件工具/按需侧板）、交互式教程、应用内说明书、作品库与导出、中英切换与设置闭环。
- 第十二阶段已交付：`ViewportController`（文档坐标与视口分离、锚点稳定双手缩放、点阵 LOD、可见区裁剪、显示全部/恢复100%/上次视图/缩略导航）、单手张掌平移与双手缩放、玩具常驻「返回画布/玩具大厅」与 `RETURN_TO_CANVAS` 统一命令。
- 第十三阶段已交付：统一字阶与 8pt 间距收敛、`ScreenTransition` 全屏交接（顶部一笔横扫 + 分层进入，实测 560–831ms 落定）、`ad-press` 微响应配方（hover 抬 1px / 按下 0.97 回弹，与手势磁吸缩放相容）、五档响应式扫描无横向滚动、日间对比度全部 ≥4.5:1、教程信号节流修复了 React maximum-update-depth 控制台报错。
- 第十四阶段已交付：二维坐标根因修复——导航输入改走「摄像头归一化 → 容器 CSS px」的视口无关映射，平移/缩放改为会话绝对基准（`offset = offsetStart + gain×(palm−palmStart)`、`s=clamp(s0×d/d0)`、`t=mid−base(anchor)×s`），单一视口写入口 + 识别结果按时间戳去重；点阵/历史笔迹/活动笔画在同一视口快照下重投影。实测静止手 14s 漂移 0、100px 手掌台阶 = 100px 视口、重复帧只处理一次。三维新增双手张掌缩放（起始相机冻结基准、射线对文档面求交、单一相机写作者、会话期间关闭回正弹簧与惯性），导航前后笔画数据逐字节不变。
- **第十四阶段开放缺陷**：三维导航结束后落笔被路由 `UI` 上下文挡住（射线瞄准落笔与单手三维平移随之推迟，见 [phase14-log.md §5](docs/phase14-log.md)）；单手三维平移与「张掌呼出工具坞」共用同一保持手势，需要新手势词汇才能两者兼得。
- 第十五阶段已交付：顶栏三区化（64px 单行、Grid `minmax(0,1fr) auto minmax(0,1fr)`、≤1180 图标化、≤980 收进菜单）与项目/设备/帮助三个菜单（选中即关、外点与 Esc 关闭）；studio 唯一状态行（就绪词，丢手时变为「请把手放进画面」轻量提示，不再是浮岛胶囊+圆点+张开手掌+主手四件套）；摄像头预览移到创作区左下并在全屏浮层期间不渲染；**右侧属性栏改为网格列**（列头=面板名+选中对象名+收起箭头、仅面板内部滚动、栏收起时把宽度还给画布、底部工具行以剩余区域居中：1440/900 三档实测中心与期望一致）；颜色/材质/粗细/更多浮层改为锚定各自触发按钮（边缘夹取）；模型栏按 变换/资产/组织/吸附 分组并删掉与顶栏重复的使用说明、设置入口；`GestureButton` 图标改为有序语义图标表（此前导入/移除/编组/示例/吸附等全部落到加号兜底）；模式段、模型栏与设置项命名统一走 i18n；点阵背景降噪（间距 0.022 文档单位、点径 1.1px、透明度上限 0.55）。
- 第十五阶段根因修复（探针取证，未放宽任何断言）：手势区域拾取改为**遮挡感知**——最小矩形不再自动获胜，被上层面板盖住的控件不能隔着面板吃掉捏合（这一条暴露并修掉了作品库首卡、设置拖拽车道与教程教练卡三处真实遮挡）；顶栏因 `backdrop-filter` 自成的层叠上下文缺层级，导致 DebugPanel 画在打开的菜单之上，已按 sheet 级补齐。
- **第十五阶段开放缺陷**：属性栏已是真正的布局列（列头 + 对象名 + 收起、仅面板内部滚动、底部工具行以剩余区域居中），但**画布尺寸、相机宽高比与手势映射仍为整窗**——把 stage 单元变成视口会让指针被夹在画板内，顶栏与属性栏手势不可达（实测：瞄准顶栏算出的平面 v=−0.0488，光标钉在 (992,0)）。修它需要「一个 plane→window 映射同时服务指针、墨迹与相机」的统一改造，列为下一步第一项；二维 Dock 分组与颜色/材质/粗细面板增强、内层微响应、日夜一致性亦未完成（见 [phase15-log.md](docs/phase15-log.md) 第五轮）。
- **开放缺陷（未隐藏、未放宽断言）**：状态切换（主题捏合、FIST 解除）之后立刻落笔偶尔丢一次捏合，SwiftShader 下主题混合延迟 1–3s 放大该窗口（第十五阶段判定轮 55 PASS/1 FAIL 的唯一红点即此）；PlayLab 右滑翻页仍为 `KNOWN GAP`。见 [phase13-log.md §6](docs/phase13-log.md)。
- 真机摄像头、真人 40–100cm 准确率、硬件 60fps 与真实麦克风验收仍待完成；本仓库所有绿灯来自 headless SwiftShader + 合成手。

- 明确选择 **Enter AirDraw** 后才启动摄像头，六个有效帧预热后开放输入；首次快速校准可跳过，Settings 可重新校准。
- 模式/页面切换复用摄像头、识别 Worker 和 Canvas；捏合融合判断、迟滞与180ms短暂缺失续写，主手变化或大跳跃结束笔画。
- 顶部麦克风单独开启；“你好，AirDraw，打开画板”“你好，AirDraw，撤销”。清空需确认。麦克风拒绝不影响手势；浏览器语音可能依赖厂商在线服务。
- 初次品牌显现约1.5秒，已见开场约0.75秒，可选择 Enter 跳过，支持 Reduced Motion。继续使用 Motion 与 WebGL；项目未安装 Remotion，因此未新增 Composition 或实时依赖。
- 软件 WebGL 自动选低视觉档。完整 landmark 时间插值、真人40–100cm准确率、硬件60fps与真实麦克风验收仍待完成。

新增 `npm run verify:phase8`；`scripts/phase8-e2e.mjs` 验证假摄像头、真实识别 Worker与模拟语音事件；`scripts/phase8-ink-e2e.mjs` 验证合成关键点完整输入；`scripts/phase8-soak.mjs` 做100笔画/两个模型长跑。实际结果见 `docs/verification/`，不能把合成回放称为真人验收。

以下为第七阶段历史同步：PlayLab（0.7.0）已落地五个手势玩具与共享输入层，验收尚未完成 ——
`verify:playlab` 43/43、`e2e:playlab` 30 通过 / 1 个标注为 `KNOWN GAP` 的右滑缺陷，
**30 分钟长跑与五种切换动画、玩具内教学与录制入口尚未做**。
上一阶段的最终状态与回归表见 [phase6-log.md](docs/phase6-log.md)。
最新交接：[第七阶段开发日志](docs/phase7-log.md)（含参考仓库与逐条许可证核对）、[第六阶段](docs/phase6-log.md)、[工程数据格式](docs/project-schema.md)。

## 第七阶段：PlayLab 手势互动实验室

- 第四个房间：底部模式切换器 `PlayLab` 进入，横向空间卡片陈列 Energy Orb / Particle Galaxy / Fluid Ink / Hand Ocean / Fireworks，
  张开手掌左右滑动换一页、POINT 悬停 + 真实 PINCH 进入；卡片预览是低成本 2D canvas，只有当前卡片在动。
- **仍然只有一个摄像头流、一个 Hand Landmarker Worker、一个 WebGL 上下文**：`Scene3D` 通过 `lab` 插槽挂上玩具，
  墨迹图层让位而不卸载；玩具通过 `engine.frame` 读同一帧关键点，绝不自己开摄像头。
- 新增 `HandFrame` / `TwoHandFrame`（掌心、掌法线、朝向、掌宽、速度、开放度、捏合状态…）、
  16 个高层手势事件、`PalmSwipeDetector` 六态状态机（位移以掌宽计，远近无关）、`GestureArbitration` 单一输入所有者
  （`safety > 抓取/绘画 > 捏合 > 双手 > 玩具 > 滑动 > 悬停`）与 `QualityManager`（只降视觉、不降识别）。
- 玩具契约 `Toy`（initialize/enter/update/onHandFrame/onGesture/pause/resume/exit/dispose）按需 `import()`，
  每个玩具只拥有一个 `Group`；流体 20 进 20 出后 `gl.info.memory` 回到基线 9/3。
- 参考来源与许可证逐仓库核对过：MIT 的（three.js、WebGL-Fluid-Simulation）保留出处声明，
  **无 LICENSE 的三个仓库只做视觉/交互研究，未复制源码** —— 详见 `docs/phase7-log.md`。
- 捏合闸门（真人反馈修正）：默认 `contact 0.30 / release 0.37 / projection 0.30 / z 0.16`（掌宽归一化），
  解剖估计**只放宽不收紧**（旧的 `min()` 让未校准用户根本达不到接触，见 phase7 日志），
  设置里的**「捏合辅助」现在真的生效**（最多再放宽 45%，只放宽距离与投影，不放宽确认帧与深度一致性）。

## 第六阶段：空间创作工程

- `src/project/` 在原 DrawEngine/StrokeStore 上桥接 SceneObject 与 100 步 CommandHistory；平面笔迹、空间笔迹、GLB 与组共存，图层支持显示、锁定、复制、重命名、长按删除与排序；长按确认可用捏合、鼠标和键盘三种方式完成，图层行可再点一次取消选择。
- 本地几何建议在停笔约 850ms 后分析，用户确认才修改，操作可撤销。RecognitionProvider 支持替换；默认未启用文字 OCR，Developer Mode 的 Mock Hello 明确只是接口演示。
- Make 3D 提供 Extrude、Tube、Outline、Relief、节流预览与参数滑杆，确认后生成空间对象，原稿保留并锁定。系统字体轮廓可生成文字网格；Relief 当前为简化起伏挤出，文字各方法尚未全面区分。
- Model Control 操控工程对象与组，支持副手张掌多选、双手缩放/旋转、交叉或身份交换冻结及网格/15°/中心 Snap。实体抓取在松开时提交一次历史。
- 独立 IndexedDB 工程支持 New/Save/Save As/Duplicate/Rename/Open/Delete、1800ms 防抖自动保存（关页面前会冲刷最后一次改动）、旧数据迁移与前一有效快照恢复。打开相册里的作品会先把当前工程落盘，再把作品开成**它自己的工程**；环绕视角写进工程但不占 Undo 步骤。原 Gallery 保留；新工程列表标记 2D/3D/Mixed。
- Canvas PNG/透明 PNG/SVG、空间高清/透明 PNG、AirDraw JSON、PBR 降级 GLB 与创作 Canvas WebM。GLB 与场景一样按祖先级联剔除隐藏对象；视频不包含摄像头或 DOM 界面；暂未提供摄像头叠加设置。
- 预览骨骼始终显示，只有视频镜像；文本与骨骼位置修正。校准不再依赖默认接触判定成功，保存真实个人阈值；默认配置不再误算已校准。输入诊断可导出最近 300 帧判定数值。

### 本阶段验证

```bash
npm run verify:core && npm run verify:contact && npm run verify:stage5 && npm run verify:stage6
APP_URL=http://localhost:5173/ node scripts/e2e.mjs                     # 第四阶段产品回归，仍在用
APP_URL=http://localhost:5173/ node scripts/stage5-e2e.mjs
APP_URL=http://localhost:5173/ node scripts/stage5-tutorial-e2e.mjs      # 首启/教程/可选校准
APP_URL=http://localhost:5173/ node scripts/stage5-worker-e2e.mjs        # 真 MediaPipe + 假摄像头
APP_URL=http://localhost:5173/ node scripts/stage6-e2e.mjs
APP_URL=http://localhost:5173/ node scripts/stage6-creation-e2e.mjs      # 识别→Make 3D→图层→导出
SOAK_MS=1800000 APP_URL=http://localhost:5173/ node scripts/stage6-soak.mjs
```

`APP_URL` 指定测试服务地址（默认 5174，本机 dev 端口是 5173）。测试 Skill 位于
`D:/CodexData/skills/airdraw-regression/SKILL.md`。**一次只跑一个浏览器套件**：五个无头 Chrome
同时启动会把检测帧率压到个位数，制造与产品无关的假失败。

30 分钟工作区长跑（本轮最终构建，11:29–11:59 UTC）：100 条笔迹对象 + 2 个模型 = **102 个工程对象**、
**179 次三模式轮转**、179 个采样点，同一 Canvas、零 WebGL 上下文丢失、零运行时异常；
每 30 次切换做一次"保存→重开→对象数一致"往返，全部通过。
采样稳定在 geometry 123 / texture 5，draw calls 按所处模式为 **Canvas 5 · Spatial 10 · Model Control 105**，
JS heap 在 76.5–110.9 MB 之间往复且**最后一个采样(80.2 MB)低于第一个(91.2 MB)** —— 没有对象、纹理或堆的单调增长。
它使用接触生成的轨迹夹具与 SwiftShader，不能据此宣称真实 GPU 60fps、零显存泄漏或真人接触准确率；
Model Control 的 105 次 draw calls 是该视图的扩展性上限（二维墨的 24 笔合并不覆盖这条路径），记入技术债。
后文第二至第四阶段内容为历史设计/测试记录，以本节与最新日志为当前状态。

**这份文档是开发者文档。** 面向最终使用者的说明书（首次启动、摄像头授权、手势表、
常见问题、隐私说明）在仓库根目录的 [`USER_GUIDE.md`](USER_GUIDE.md) 里，
应用内也有一份等价的可翻阅版本（Dock → Guide）。
开发细节、参考项目与性能数据见 [`docs/phase4-log.md`](docs/phase4-log.md)、
[`docs/phase3-log.md`](docs/phase3-log.md)、[`docs/phase2-log.md`](docs/phase2-log.md)。

---

## 第五阶段工作区

- **Spatial Draw**：保留原有 3D 笔迹、材质、查看、历史与作品库；新增木材、金属、石材纹理。
- **Canvas Draw**：固定绘画平面，perfect-freehand 轮廓生成；钢笔、马克笔、荧光笔、橡皮擦、颜色、粗细、历史、纸张背景、PNG/SVG 导出。
- **Model Control**：Drei GLTF 加载；Move / Rotate / Scale、双手缩放与绕视线旋转、单手缩放滑杆、重置、本地导入、长按删除。
- `AppMode` 管理可反向的 800ms 过渡；共享一个 Canvas、摄像头流和 Worker，输入由 `InputRouter` 独占路由。
- `PinchContactDetector` 使用掌宽归一化的投影/世界距离、Z 差、指节长度、接近速度、手部置信度和最近 5 帧多数通过（4/5）。NEAR 不落笔；失踪/换手/焦点变化立即取消输入。
- 首次进入完成三次捏合校准，再进行教程；Settings 可重做校准。Developer Mode 显示接触指标和状态。Tasks Vision 未提供逐关键点置信度，本实现使用手部置信度与关键点有限值检查，不虚构逐点分数。
- Poly Haven 下载资产按类别保存在 `public/materials/`，来源、CC0、文件哈希见 `catalog.json`。

DOM 统一使用 `motion/react` 与 Design/Motion Tokens；Three.js 过渡由统一权重及帧插值驱动。低性能设备降低粒子、Bloom 和场景质量，接触判定标准保持一致。

### 本阶段检查

运行服务后执行 `npm run verify:stage5`、`npm run e2e:stage5`、`npm run e2e:worker`、`npm run e2e:tutorial`。浏览器脚本默认访问 `http://localhost:5174/`；可用环境变量 `APP_URL` 指定地址。脚本使用本机 Chrome 和 Playwright，Windows Chrome 路径目前固定在脚本中。

合成接触核心 732/732（含"指腹相触必须落笔"的 180 条真实比例手模型断言），工作区回归 13/13，
真实 MediaPipe + 浏览器假摄像头 Worker 回归 5/5，首次启动/教程书写/可选校准流程 22/22。
报告和截图见 `docs/verification/`。假摄像头只验证服务生命周期与推理执行，不验证真实手接触准确率。

### 参考与许可证

参考 [MediaPipe 示例](https://github.com/google-ai-edge/mediapipe-samples-web)（Apache-2.0）、[perfect-freehand](https://github.com/steveruizok/perfect-freehand)、[R3F](https://github.com/pmndrs/react-three-fiber)、[Drei](https://github.com/pmndrs/drei)、[Motion](https://github.com/motiondivision/motion)（后四项 MIT）。许可证原文快照在 `docs/licenses/`。

[gesture-3d-studio](https://github.com/amerob/gesture-3d-studio) 的 README 有 MIT 标记，但检查时没有可核对的 LICENSE 文件，只参考交互概念，没有复制代码。Poly Haven 纹理使用 [CC0](https://polyhaven.com/license)，内置 GLB 是本项目生成的几何模型。

### 当前限制

单目摄像头不能证明皮肤物理接触；需要真实手校准与验收。模型场景的地面阴影为简化视觉底座，环境主题使用连续灯光/材质参数过渡，尚未实现双 HDR 环境图交叉混合。透视相机通过小 FOV/远距离模拟正交视觉，没有切换为真正正交相机。主包约 1.83MB，需继续拆包；未测量真实设备 60fps 或显存曲线，已有 30 分钟软件渲染资源采样。严格 CSP 部署需允许 Worker 使用的 Blob ESM WASM 适配器，详见开发日志。

## 启动命令

```bash
npm install
npm run dev        # http://localhost:5173 （同一局域网：http://<本机IP>:5173）
```

其他命令：

```bash
npm run build        # tsc 类型检查 + 生产构建（输出到 dist/）
npm run preview      # 预览生产构建
npm run typecheck    # 仅类型检查
npm run verify:core  # 核心算法 + 状态机自检（纯 Node，见下方「自检结果」的断言数）
npm run e2e          # 无头 Chrome 手势 UI 产品级回归（截图输出到 .e2e/）
SOAK_MS=1800000 npm run e2e   # 在同一轮回归之后追加 30 分钟长跑（书写→清空周期 + 笔迹堆积）
```

> **本地端访问已启用。** `vite.config.ts` 里 dev(5173) 与 preview(4173) 都是 `host: true` +
> `allowedHosts: true`，同一局域网内其它设备可直接打开 `http://<本机IP>:5173/`（已实测 200）。
> 这只适合开发/预览机，**不要把这两个端口暴露到公网**。

> **但摄像头只认安全上下文。** 浏览器规定 `getUserMedia` 仅在 `http://localhost` 或 https 下可用，
> 所以用 `http://<IP>:5173` 打开时界面能跑、摄像头会被浏览器拒绝（应用会显示"当前地址无法使用摄像头"
> 并给出四条出路）。要在另一台设备上真的用手：
>
> | 方式 | 做法 |
> | --- | --- |
> | 手机（Android + USB 调试） | `adb reverse tcp:5173 tcp:5173`，手机浏览器打开 `http://localhost:5173/` |
> | 另一台电脑 | `ssh -L 5173:localhost:5173 <host>` 后打开本机 `http://localhost:5173/` |
> | 临时调试 | 给那台设备的浏览器加启动参数 `--unsafely-treat-insecure-origin-as-secure=http://<本机IP>:5173` |
> | 只看交互与手势 | 任意地址后加 `?simulate=1`，用合成手演示，不需要摄像头 |

首次进入是**只有品牌与一句 "Draw in the air." 的开场页**：一片克制的粒子场，
一次 `POINT + PINCH`（无摄像头时用鼠标点一次）让粒子带深度地聚成 "Hello!"，
再一次确认让它们向外散开并淡出，人落在**该落的地方**——没做过教程的进教程，做过的进画布
（教程、说明书、作品库、设置都在画布下方的 Dock 里，一个手势可达）。
回访用户（`helloSeen`）在同一句标语下看到「设置已保存，随时可以继续」，也不再重播教程。
**请求摄像头权限用的是浏览器标准弹窗**，应用只做解释，不伪造权限界面。
手部识别模型（约 7.5 MB）、MediaPipe WASM 运行时与 3D 环境探针全部本地生成/内置，**无需联网**。

### 调试入口

| 入口 | 说明 |
| --- | --- |
| `?debug=1` | 直接进入 **Developer Mode**：双 FPS、推理与手势延迟、置信度、pinch 刻度条、draw calls、geometries、2D/3D 与镜像开关、骨骼预览、练习页置信度读数 |
| `?simulate=1` | 不打开摄像头，回放脚本化合成手部（捏合、丢失、快慢移动、双手、五种手势），用于无手自检 |
| `?mirror=0` | 以关闭镜像的状态启动 |
| 张掌 ~0.7 s | 呼出 / 收起工具 Dock（无需鼠标键盘） |
| `window.__airdraw` | 引擎句柄：`strokeCount`、`debugInternals`（penDown/suspended/uiHovered/locked/drawingAllowed/pinch…） |
| `window.__airdrawThree` | Three.js 场景句柄：`scene` / `gl` / `camera`，用于断言 draw calls、geometries、三角形 |
| `window.__airdrawInteraction` | 手势交互管理器句柄：`snapshot`（hoverId/pressId/state/holdProgress/cursor/overTarget） |

---

## 手势操作表

| 手势 | 作用 |
| --- | --- |
| `POINT` 食指指向 | 移动空间光标（圆形柔和指示器，靠近按钮磁吸） |
| `PINCH` 捏合 | 确认 = 点击：指向目标 → 稳定悬停 → 捏合 → 在目标上释放 |
| `PINCH + MOVE` | 拖动：笔刷滑杆、颜色、查看模式旋转、说明书翻页 |
| `OPEN_PALM` 张掌保持 0.7 s | 呼出 / 收起工具 Dock；在教程/说明书/作品库/设置里 = 关闭当前层回到画布 |
| `FIST` 握拳 | 暂停绘制并锁定输入（**不触发任何危险操作**） |
| `VICTORY` 剪刀手保持约 0.4 s | 进入 / 退出查看模式（可轻微旋转作品）；一闪而过的两指不算 |
| 长按捏合约 1 s | 清空确认环（Clear → Hold to Clear）——只有转完确认环才真的清空 |

> **消歧规则**：捏合命中 UI 区域 = 点击；捏合在画布上 = 落笔。二者互斥，
> 因此悬停经过按钮时不会误画，指向画布时不会误点。

> **同一个手势在不同 Context 里有不同含义**（见「应用状态机」）：说明书里的 PINCH 翻页
> 不会在背后落笔，作品库里的张掌不会触发画布工具。当前 Context 不接收绘画输入时，
> 引擎的 `drawingAllowed` 直接为 `false`，而不是靠 UI 遮挡。

Dock 项目（张掌呼出）：Color / Material / Size / Undo / Redo / Erase / Clear / View /
Center（把镜头对准整件作品）/ Save / Guide / Gallery / Settings。

---

## 核心技术栈

- **React 19 + TypeScript + Vite 8 + framer-motion**（CSS Modules + design tokens，组件化/模块化）
- **MediaPipe Tasks Vision（Hand Landmarker）**：VIDEO 模式、**双手**、21 关键点 + 米制 worldLandmarks +
  handedness 置信度；GPU delegate 优先、CPU 回退；WASM 与模型本地自托管；
  视频循环采用官方 sample 的同帧去重 + 单调时间戳钳制
- **Three.js + React Three Fiber + Drei + postprocessing**：CatmullRomCurve3 + TubeGeometry 体积笔迹（含端帽）、
  MeshPhysicalMaterial 五预设、本地环境探针、受控 Bloom、增量生长的 `LiveTube`
- **统一 HandTrackingResult 数据层 + HandTrackingProvider 接口**：MediaPipe 与合成源已实现，
  TensorFlow.js hand-pose-detection 可按同一接口接入做性能对比
- **GestureInteractionManager**：hover / press / drag / hold / release / cancel / cooldown / handLost
  的单一权威，所有可交互 UI 通过 `useInteractive` 注册区域，不各自实现手势逻辑
- **GestureEngine**（fingerpose 式 curl 角度 + 加权描述评分 + 时间迟滞）：
  POINT / PINCH / OPEN_PALM / FIST / VICTORY
- **稳定性链**：异常点剔除 + 速度钳制（VelocityLimiter）、手掌尺度速率钳制 EMA、重捕获 3 帧中位数缓冲、
  One Euro Filter（指尖）、EMA（捏合/深度）、距离重采样 + 转角保持
- **日夜主题系统**：单一 0.8 s 插值同时驱动 CSS 变量与 Three.js 灯光/环境/Bloom/背景，
  切换过程中追踪与绘制不中断；`prefers-reduced-motion` 自适应
- **性能自适应 governor**：按实时 FPS 在 high/medium/low 三档间带迟滞切换
  （检测频率、tube 分段、Bloom、环境探针、DPR、采样密度），不触碰识别阈值
- **有界场景开销**：已提交笔迹按材质/颜色每 24 笔合并成块（draw calls 不随笔数线性增长），
  落笔时按墨量预算给新笔迹更粗的 LOD，重采样抽稀强制保留转角节点
- **应用状态机（`app/appState.ts`）**：`launch → permission → tutorial → studio → help/gallery/settings`
  的单一 `useReducer`，`canDraw()` / `activeScope()` 由当前 Context 派生；
  Modal / Panel / Dock / Help / Gallery / Tutorial 由它统一管理，取代此前的十余个独立布尔
- **手势作用域隔离**：`GestureInteractionManager` 的区域带 `scope`，只有当前 Context 的作用域参与命中，
  说明书/作品库背后的画布不会收到落笔
- **持久化**：偏好（主题/默认色/材质/粗细/惯用手/教程完成/UI 动效/灵敏度）在 `localStorage`，
  作品（缩略图 + 笔迹 + 场景状态 + 时间 + schema 版本）在 **IndexedDB**（`airdraw/artworks`），
  不可用时回退内存并提示；启动只恢复设置，**不会自动把旧作品画回画布**
- **开场粒子**：单个 `THREE.Points` + 自定义 `ShaderMaterial`（离屏 canvas 采样 "Hello!" 的字形点位），
  汇聚/散开都是临界阻尼插值，全程可中断，不生成上千个 DOM 节点
- **PNG / JSON 导出**：离屏一次性 `renderToDataUrl`（不常驻 `preserveDrawingBuffer`），
  按设备能力用 2× 分辨率、可选透明或日/夜背景

---

## 目录结构

```
src/
├── App.tsx              # 会话装配：状态机驱动、手势→语义、上下文消歧、主题、保存/导出
├── app/                 # appState.ts（应用状态机：Context/事件/canDraw/activeScope）
│                        # preferences.ts（持久化偏好）、feedback.ts（单条全局反馈）、
│                        # capabilities.ts（WebGL/摄像头/安全上下文探测）
├── components/          # LaunchScreen（粒子开场）/ PermissionCard（授权解释页）/ TopStatus /
│                        # SpatialDock（Dock + 颜色/材质/粗细浮层 + 清空确认环）/ ThemeToggle /
│                        # CameraPreview / CameraStatusDot / TutorialCoach（交互式教程）/
│                        # GuideScreen（应用内说明书 + 手势练习）/ GalleryScreen（作品库）/
│                        # SettingsScreen（极简设置）/ HandGlyph（程序化手部图形）/
│                        # FeedbackNotice / TrackingProblem / DebugPanel / DrawingSurface(2D 调试) / Logo
├── tutorial/            # steps.ts（11 课，每课用真实引擎信号判定通过）、useTutorialSignal.ts
├── guide/               # content.ts（说明书章节内容与手势数据）
├── storage/             # artworks.ts（IndexedDB 作品库 + localStorage 迁移 + 内存回退）
├── interaction/         # GestureInteractionManager（hover/press/drag/hold/cancel/cooldown/handLost
│                        # 单一权威 + scope 分区 + 悬停迟滞）、useInteractive、SpatialCursor
├── theme/               # themes.ts（日/夜端点 + mixTheme）/ themeController.ts（0.8s 插值 + 持久化）
├── hooks/               # useHandTracking（**自己持有摄像头源与生命周期**）/ useDrawEngine /
│                        # useAirDrawSession / usePerfGovernor / useUrlFlags
├── engine/              # DrawEngine（多手→稳定性链→平滑→捏合/手势→笔画→UI 消歧）、StrokeStore（撤销/重做/擦除/存档）
├── services/
│   ├── errors.ts                # 摄像头/模型失败的中文友好提示映射
│   └── handTracking/            # MediaPipeHandProvider / SyntheticHandProvider / camera /
│                                # modelLoader / types（统一 HandTrackingResult）/ index（provider 注册）
├── rendering/
│   ├── StrokeRenderer.ts        # 渲染器接口（2D/3D 共用笔画数据）
│   ├── canvas2d/                # 第一阶段 2D 渲染器 + 平滑折线（现为“2D 调试”视图）
│   └── three/                   # Scene3D（R3F）/ LiveTube（增量生长的实时管体）/
│                                # ParticleHello（单个 Points + 自定义 shader 的开场粒子）/
│                                # materials（5 预设）/ plane（映射 + 转角保持重采样）/
│                                # inspectController（带阻尼的查看模式 + Center 缓动）/
│                                # framing（作品包围盒 → 镜头距离）/ capture（离屏导出 PNG，不常驻 preserveDrawingBuffer）
├── utils/
│   ├── gesture/         # landmarks / pinch / curl / GestureEngine
│   ├── smoothing/       # oneEuro / ema
│   ├── stability.ts     # VelocityLimiter / PalmScaleSmoother / 中位数锚点
│   ├── primaryHand.ts   # 粘性主手选择 + 惯用手（auto/Left/Right）
│   ├── coordinates.ts   # 镜像平面映射 + cover 屏幕映射
│   └── status.ts        # 状态/手势文案
├── types/               # hand.ts（HandTrackingResult）/ drawing.ts（平面坐标、材质、手势）
├── config.ts            # 所有阈值、停留/冷却时长与质量档位参数
└── styles/tokens.css    # design tokens（半径/间距/字号/字重/动效曲线/玻璃配方/语义色）+ 主题变量落地
public/                  # mediapipe/wasm、models/hand_landmarker.task、favicon.svg
scripts/
├── selfcheck.ts         # npm run verify:core（纯 Node：算法 + 状态机断言）
├── gestureDriver.mjs    # 注入页面的手势驱动器（settle/awaitHover/click/holdPinch/poseUntil/drawSweep…）
└── e2e.mjs              # npm run e2e（无头 Chrome 产品级回归 + SOAK_MS 长跑）
USER_GUIDE.md            # 面向最终使用者的说明书（与开发者文档分开的两份文档）
docs/phase2-log.md       # 第二阶段开发日志
docs/phase3-log.md       # 第三阶段开发日志（架构、消歧规则、性能数据）
docs/phase4-log.md       # 第四阶段开发日志（产品化：状态机、教程、说明书、作品库、回归）
```

---

## 已完成功能

### 第一阶段（保留）

- 入场页（Logo + 权限说明 + 开始体验）、全屏画布、圆形状态指针、镜像 cover 映射；
- 捏合落笔/松开抬笔（归一化距离 + 双阈值迟滞）、多笔画/撤销/清空；
- 丢失暂停与续画（不产生跨屏跳线）、玻璃拟态工具栏、摄像头骨骼预览、调试面板；
- 拒绝权限/无摄像头/被占用/非安全上下文/模型失败的中文友好提示与重试。

### 第二阶段（新增）

- **双手识别 + 粘性主手**：两只手同时入镜时由置信度最高且稳定的主手负责绘画，
  切换需边际 0.25 且连续 10 帧；副手仅追踪显示，笔迹不因换手跳跃。
- **更强稳定性**：异常点保持、速度钳制、手掌尺度速率钳制、重捕获中位数缓冲；
  快速挥动不飞线、摄像头噪声不抖线、手离开再进入不跨屏连线。
- **GestureEngine**：POINT/PINCH/OPEN_PALM/FIST/VICTORY，输出 gesture/confidence/duration/handedness；
  Developer Mode 与摄像头预览实时显示手势标签与置信度。
- **危险操作确认**（第三阶段改为 UI 内的长按捏合确认环，不再用握拳/张掌直接触发撤销或清空）。
- **真 3D 笔迹**：X/Y 映射到固定虚拟绘画平面，深度 z 仅做轻微笔刷调制；
  实时预览在第三阶段升级为增量生长的 `LiveTube`，抬笔后转高质量 CatmullRom + TubeGeometry 体积 Mesh（含端帽）；
  Candy / Glossy Plastic / Metal / Glass / Neon 五种 MeshPhysicalMaterial 预设（颜色/粗细/材质可切换）。
- **灯光与后期**：环境光 + 主光 + 轮廓光 + 本地环境探针 + 受控 Bloom；
  绘写时摄像机固定，「查看模式」下可轻微旋转视角。
- **2D/3D 视图切换**：2D 视图保留第一阶段画布作为调试视图，与 3D 共享同一份笔画历史。
- **预览增强**：双手骨骼、主手高亮、拇指-食指 pinch 连线、手势标签。
- **调试面板增强**：camera/render/scene fps、推理耗时、draw calls、geometries、quality tier、
  手势+置信度+保持时长、主手/手数/置信度、pinch 刻度条、depth z、outliers、traj points。
- **资源与性能**：undo/clear/换档正确 dispose geometry；单笔点数上限 400（超限压缩）；
  材质按 (preset,color) 共享缓存；FPS 自适应三档画质。

### 第三阶段（新增）

- **完全无接触**：授权摄像头后不需要鼠标或键盘即可完成绘画与全部 UI 操作。
- **GestureInteractionManager**：hover / press / drag / hold / release / cancel / cooldown / handLost
  的单一权威；停留 90 ms 才算悬停、点击后 350 ms 冷却、拖动阈值 10 px、命中区域比视觉大 10 px，
  所有可交互 UI 通过 `useInteractive` 注册区域，没有逐按钮的手势分支。
- **空间光标**：柔和圆形指示器 + 磁吸吸附 + 悬停/按下/拖动/丢失四态视觉反馈；
  悬停 1.00→1.04、按下 0.97、弹簧回弹，动画永不阻塞下一次输入。
- **UI 与画布消歧**：捏合落在 UI 区域时引擎抬笔并禁止落笔，指向画布时不会误点。
- **Spatial Tool Dock**：颜色 / 材质 / 笔刷 / 撤销 / 重做 / 橡皮 / 清空 / 查看 / 保存 / 设置，
  线性图标 + 极短标签，选中项用柔光环标示；颜色与材质以真实材质观感的球体呈现，
  笔刷为可捏合拖动的弧形滑杆并带中心实时预览；张掌 0.7 s 呼出，手离开 1.4 s 自动收起。
- **不可逆操作保护**：Clear 先在手势位置弹出小确认浮层（Cancel / Hold to Clear），
  长按捏合约 1 s 完成确认环后才清空， ink 以短促溶解动画消失而不是闪白。
- **FIST = 暂停并锁定输入**（绝不触发危险操作）；`VICTORY` 进出查看模式，
  单手捏合拖动旋转、双手距离缩放，均带惯性阻尼与幅度上限。
- **日夜主题**：0.8 s 连续插值同时驱动 CSS 变量与 Three.js（环境光、主光、轮廓光、环境强度、
  Bloom、背景、网格、材质反射）；捏合右上角按钮即可切换，切换期间可继续书写、无闪白/黑帧；
  选择持久化到 `localStorage`，`prefers-reduced-motion` 下改为瞬时切换。
- **连续生长的 3D 笔迹**：`LiveTube` 预分配环形缓冲 + `setDrawRange` 增量成环，
  逐帧只新增不重建；指尖 3D 预览球在捏合瞬间接上笔迹、抬笔留下圆端帽；
  重采样在慢速时细密、快速时稀疏，并强制保留转角（便于书写、汉字、圆与螺旋）；
  每笔带轻微色相漂移，无闪烁。
- **场景开销不随笔数线性增长**：已提交笔迹按「同材质同颜色每 24 笔」合并成块，
  96 笔连续书写仍只有约 8 个 draw calls；入场动画只挂在最新一笔上，历史笔迹不再各自占用每帧回调；
  落笔时按墨量预算给**新**笔迹盖 LOD（每笔新增三角形 2051 → 608），已着墨的笔迹永不重建。
- **Focus Mode**：书写时约 200 ms 淡出非必要 UI，停顿后自动返回；摄像头预览收起为状态圆点，
  骨骼/pinch 连线只在 Developer Mode 显示。
- **重做 / 橡皮 / 保存**：撤销栈之外新增重做栈、捏合式局部橡皮、作品快照本地保存与启动恢复。
- **手部丢失策略**：数百毫秒丢失即结束当前笔画、取消未释放的按钮按下、冷却后才允许下一次点击，
  顶部出现轻量提示，恢复即淡出。
- **惯用手设置**：auto / 左手 / 右手，副手仅追踪不争夺指针。
- **design tokens + 单一动画系统**：全部半径/间距/字号/字重/时长/曲线/玻璃配方集中在 `styles/tokens.css`，
  UI 动效统一使用 framer-motion；字体为系统无衬线栈（不打包任何专有字体）。
- **Developer Mode**：`?debug=1` 或 Dock 设置内开启，含双 FPS、推理耗时、手势延迟、置信度、
  pinch 刻度、draw calls、geometries、笔画点数、质量档位、outliers、双手距离与 2D/3D、镜像、骨骼开关。

### 第四阶段（新增：产品 Demo）

- **开场（Launch）**：品牌 + 一句 "Draw in the air." + 一个入口。粒子场用单个 Three.js `Points`
  绘制，一次 `POINT+PINCH` 让粒子带深度聚成 "Hello!"，再一次确认向外散开淡出，
  然后人落在该落的地方：没做过教程的进教程，做过的进画布。三个阶段（漂浮/聚合/爆散）都是
  "目标值 + 每帧阻尼"，因此任意时刻可被打断；回访用户的第二行文案改为「设置已保存，随时可以继续」。
  **摄像头权限使用浏览器标准弹窗**，应用只在授权之后用一页短说明解释用途，不伪造权限 UI。
- **交互式教程（11 课，约 1–2 分钟）**：举手入框 → 食指移动光标 → 捏合确认 → 捏合+移动画一笔 →
  抬手停笔 → 张掌开 Dock → 选颜色 → 调粗细 → 撤销 → 查看模式 → 日夜切换。
  每一课读取 GestureEngine / StrokeStore 的**真实信号**判定通过（不是点"下一步"），
  配程序化手部图形 + 极短文案 + 当前动作柔光高亮，不遮挡摄像头与 3D 空间，可跳过、可从设置/说明书重来；
  完成反馈是粒子轻聚成 "Ready" 再淡出，没有游戏式庆祝。
- **应用内说明书 + 手势练习**：11 个章节（快速开始 / 基础手势 / 写字和画画 / 工具 Dock / 颜色与材质 /
  3D 查看 / 日夜模式 / 保存作品 / 常见问题 / 隐私与摄像头 / 故障排查）+ 一页手势练习，捏合翻页与目录选择；
  首页手势速查表同时显示 6 个手势的图形、名称与一句话用途；章节里的 `GestureGrid` 由**真实识别结果**点亮，
  说明书本身就是识别演示；练习页只给"对了/再试一次"的简单反馈，置信度数字仅在 Developer Mode 出现。
  同一份内容以最终用户语言落在根目录 `USER_GUIDE.md`（18 节，含推荐站位与快速参考卡）。
- **作品库**：手势 Save 写入 IndexedDB（缩略图、笔迹、颜色、材质、主题、时间、schema 版本），
  大留白卡片可打开续画 / 复制 / 删除（删除需二次确认或长按），支持 PNG 导出（透明或日/夜背景、
  2× 分辨率）与 JSON 导出/导入；无云账号、无同步。
- **极简设置页**：摄像头状态、惯用手、指针灵敏度、手势保持、捏合辅助、主题、减少动态、
  重置教程、Developer Mode、关于；算法细节只在 Developer Mode 出现，不做成后台管理面板。
- **应用状态机取代布尔开关**：`launch / permission / tutorial / studio / help / gallery / settings`
  七个 Context + `canDraw()` / `activeScope()` 派生；打开任何覆盖层自动关闭 Dock/浮层/确认，
  手势含义按 Context 决定，输入按 Context 暂停与恢复。
- **全局反馈系统**：捏合有缩放与光泽、滑杆实时预览粗细、保存后约 1 s 玻璃感 "Saved"、
  撤销时那一笔向内收缩并淡出（`DyingStroke`，220 ms，一次最多 12 笔）、删除有确认反馈、主题切换改变灯光；
  同一时刻只有一条提示（不堆叠 toast）。
- **3D 体验**：每笔落定后 340 ms 的高光扫过（settle）；Center 用约 0.5 s 的指数缓动（时间常数 ~220 ms）
  把镜头对准整件作品（包围盒 + 42° fov + 1.18 边距），不会瞬移；
  书写链路继续保留预测插值、动态采样距离与转角保持。
- **主题与状态恢复**：记住主题（day/night/**auto** 跟随 `prefers-color-scheme`，手动选择优先）、
  默认色、材质、笔刷、惯用手、教程完成、动效偏好；恢复设置但**不在画布上自动生成旧墨迹**；
  日夜仍是一段连续插值，无黑屏/闪白/与 UI 脱节。
- **失败与降级页面**：拒绝权限后的重新授权指引、WebGL/模型不支持时的浏览器不兼容说明、
  模型加载失败的重试、无摄像头时的解释页（都不是空白）、弱 GPU 自动降 Bloom/粒子/环境/管体细节
  而不动识别阈值、持续低帧时一条"Performance mode enabled"。
- **人体工学与无障碍**：视觉与命中区域都放大（命中框比视觉大 10 px）但磁吸强度降低、
  悬停用 140–240 ms 的过渡给即时反馈且**不做停留即点击**（按下必须真的捏合，dwell 90 ms 只是"选定目标"），
  按钮边缘 16 px 悬停迟滞、**模式切换要"有意图"**（查看模式需保持剪刀手约 0.4 s，路过式的两指伸直不切换）、
  手短暂丢失即冻结 UI 输入并取消拖动、恢复后必须重新瞄准、
  主手光标与副手不争夺指针、`prefers-reduced-motion` 保留状态反馈只削幅度、Dock 固定在下部中央的省力区。

---

## 自检结果

- `npm run verify:core`：**80/80 通过**（平面映射与镜像、cover 缩放、平面↔世界、重采样与转角保持
  （含抽稀时保留转角节点）、捏合迟滞与多帧确认、One Euro、异常点/速度/手掌尺度守卫、中位数重捕获、
  curl 分类、手势评分/确认/时长/丢失复位、主手粘性、笔画存储/分段/压缩/重做、墨量预算 LOD 递减、
  landmark 几何辅助，14 项状态机断言：每个 Context 的 `canDraw()` / `activeScope()` 结果、
  覆盖层互斥、Dock/浮层/确认的级联关闭、11 课教程的通过判据；
  **新增 5 项二维工具断言**：钢笔/马克笔/荧光笔的宽度阶梯、闭合轮廓确实落在纸面内、
  透明度分层（笔 1 / 马克 .72 / 荧光 .32）、压感开关真的改变轮廓形状）。
- `npm run typecheck`、`npm run build`：无错误。产物 `index.js` 1 836.57 kB（gzip 533.93 kB）、
  `index.css` 53.17 kB（gzip 10.18 kB）、`tracking.worker.js` 157.96 kB；主包体积告警仍在，拆分排在 P2。
- `npm run e2e`（无头 Chrome + `?simulate=1` + 脚本化合成手）：**56/56 通过** ——
  OPEN_PALM 呼出 Dock、Color 浮层展开、**连续 20 次按钮选择全部命中**、
  捏合未松开扫过多个按钮零误选、手部丢失取消按压、双手同框选择、
  3D 笔迹提交、**捏合切换日夜且绘制不中断**、撤销 ×3 / 重做 ×2（每次都等笔数真的变化）、
  VICTORY 进出查看模式与带阻尼旋转、**两指一闪不算进查看模式（必须保持约 0.4 s）**、
  Clear 误触只弹确认环 / 长按确认环才清空、
  FIST 锁定与恢复（落笔必须先被证实）、
  **首次运行 11 课全部由真实手势逐一通过且终于画布**、
  说明书可开可翻页且抬笔、作品库出现带真实缩略图的卡片、
  **PNG 的透明/日间/夜间三种背景各导出不同图像且不低于画布分辨率、导出不吃掉当前画布**、
  **合法 JSON 导入成为新作品、非法文件被一句话拒绝**、
  **删除短捏只浮出确认、长按确认环只少那一张**、
  **打开相册作品 = 开成它自己的工程，库里那份原工程一笔不少**（保存→打开→越过 1800 ms 自动保存窗口→回读比对）、
  **设置：开关即时生效并写回偏好、列表可用捏合拖动滚动、可捏合关闭**、
  反复进出界面不增加摄像头源与 geometry、关闭界面后笔恢复、零控制台错误；截图存于 `.e2e/`。
- `SOAK_MS=1800000 npm run e2e`：在上面 56 项之外再跑 **8 项长跑断言**（30 分钟「书写→清空」周期 +
  一次 96 笔不清空的堆积），共 64 项，见下节长跑结论。
- 真实浏览器权限路径：拒绝权限/无摄像头/被占用时正确显示中文错误卡片（第一阶段验证，仍有效）。
- **真实摄像头 + 真实手部**（独立 Chrome profile 自动放行权限后实测）：`camera` 权限 `granted`、
  采集 1280×720 且 `readyState=4 / playing`、camera 20–29 fps、handedness 与双手切换正确
  （`1 · Right` → `2 · Left` → `1 · Right`）、置信度 0.96–1.00、
  `OPEN_PALM`（评分 10.0）与 `PINCH → Drawing` 均被真实手势触发，丢失时正确进入
  `Show your hand` / `pointer state: lost` 并在恢复后继续，零控制台错误。

### 性能数据

| 环境 | 结果 |
| --- | --- |
| 真实 GPU + 真实摄像头（桌面 Chrome，实测） | 1280×720 采集、camera 20–29 fps、**GPU delegate**、推理 17.3 ms、render 61–74 fps、quality high、零控制台错误 |
| 真实 GPU（第一阶段同机实测） | detect 29–30 fps、主线程 144 fps、GPU delegate 推理 <1 ms |
| 无头 SwiftShader（e2e，最坏情况） | governor 自动降到 low 档：camera 22–23 fps、detect 14–16 fps；空场景 scene 35–42 fps，画满 24 笔 scene 16–20 fps，堆到 96 笔 scene 9 fps（软件光栅约 10k 三角形/fps 的吞吐上限，真实 GPU 不受此限） |
| GPU 资源（30 分钟长跑实测） | 24 笔/周期：draw calls 4–5、geometries 13、scene children 8–9；96 笔堆积：draw calls 8、geometries 16（合并成块）；clear 后回到 calls 2 / geo 11；23 个周期逐个重复，空场景帧率 39 → 35 → 39，无下降 |
| 交互延迟 | 悬停 dwell 90 ms、点击冷却 350 ms、手势延迟指标在 Developer Mode 实时可见 |

### 30 分钟长跑结论

`SOAK_MS=1800000 npm run e2e` = 56 项功能断言 + 8 项长跑断言，全程零控制台错误。
长跑分两段（本机 headless SwiftShader，是最坏情况而不是典型情况）。

**阶段 A：23 个「连续书写 24 笔 → 清空」周期**（共约 550 笔，跨越 1807 秒）

| 指标 | 每个周期「画满」时 | 每个周期「清空」后 |
| --- | --- | --- |
| draw calls | 4–5（预算 8） | 2 |
| geometries | 13 | 11 |
| scene children | 8–9 | 6 |
| triangles | 56k–78k | 352 |
| scene fps | 16–20 | 35–42 |

23 个周期里这些数字**逐个重复**：draw calls 最差 5、geometries 始终 13、scene children 始终 ≤ 9，
空场景帧率 **start 39 → worst 35 → last 39**（30 分钟里没有下降，最后回到起点）。
也就是说没有 mesh/材质/对象泄漏，也没有"跑得越久越卡"；
重复触发、误选、动画阻塞、主题闪烁由同一轮的 56 项功能断言覆盖。

**阶段 B：96 笔不清空的堆积**（压力最坏情况）

| 累计笔数 | draw calls | geometries | triangles | 每新增一笔的边际增量 |
| --- | --- | --- | --- | --- |
| 24 | 5 | 13 | 63,784 | — |
| 48 | 5 | 14 | 110,440 | 1944 |
| 72 | 7 | 15 | 131,212 | 865 |
| 96 | 8 | 16 | 144,280 | 545 |

落笔时的墨量预算确实在起作用：**同样写 24 笔，第 96 笔的边际成本只有第 24 笔的 28%**（1944 → 545 三角形），
96 笔的 draw calls 是 8 而不是 96；清空后回到基线（calls 2 / geo 11）。
剩下的帧率下降（20 → 9）来自软件光栅的三角形/片元吞吐上限（本机约 10k 三角形/fps），
真实 GPU 上同机实测 61–74 fps，不是应用侧的资源增长。

---

## 第四阶段历史问题（当前问题见第六阶段日志）

- **真实手部仍需一次人工产品走查**：摄像头/手部识别、双手与 handedness 切换、`OPEN_PALM`、
  `PINCH → 落笔`、丢失与恢复都已用真实摄像头实测；但教程、说明书、作品库、设置这四个新界面
  只在**合成手**下做过完整回归，还没有在真实光照、不同肤色与遮挡下由人完整走一遍。
  阈值集中在 `src/config.ts`，标定属于第五阶段。
- 光标从静止大幅移动（~350 px）约需 0.5 s 收敛（速度钳制 + One Euro 的代价），
  换来的是不飞线、不跳点；连续点选时表现为"手到位后再捏合"。
  Dock 现在不会在你"正在走向它"的过程中收起，但到达之后仍需在 1.4 s 内完成捏合。
- 从 Dock 直接下笔会被视为离开 Dock，需再次张掌呼出。
- 导入 JSON 的最后一步（在操作系统文件框里挑文件）无法用手势完成；导出、相册内全部操作都可以。
- 说明书与教程文案为硬编码中文，没有 i18n 层；手势翻页的 70 px 阈值未按屏幕高度缩放。
- 无 GPU 环境 governor 常驻 low 档：画面朴素（无 Bloom/环境反射）但功能完整；
  Glass 预设（transmission）在低配 GPU 上开销明显。
- 手部快速翻转时手势置信度短暂摆动（3 帧确认把误触控制在 ~100 ms）。
- **惯用手设成左/右而那只手不在画面里时，光标会静止不动**：主手选择正确地不接管另一只手，
  但界面没有把"你指定的那只手没入镜"说出来（顶部仍是通用的"Show your hand"）。
  `USER_GUIDE.md` 的常见问题里先写了恢复步骤；应用内的定向提示排在第五阶段。
- 查看模式旋转视角时，DOM 光标不随视角反投影（绘写时摄像机固定，不影响落笔）。
- **"墨离摄像头过近/过远"只做了结构性防护，没有做用户提示**：单目深度抖动太大，不能直接驱动 z，
  所以笔迹被压在 `planeToWorld(point, zScale = 0.35)` 的薄层里，物理上不可能飞到镜头前或远处；
  但当手离摄像头过近/过远导致识别变差时，界面目前只有"举手/Show your hand"这一类提示，
  还没有"请把手移近一点/远一点"的方向性建议。
- 开场粒子与正式画布是两个 WebGL 上下文（切换时前一个已 dispose）。
- 作品只保存在本机（IndexedDB），换浏览器/无痕窗口不会带走；仍没有录屏导出。

---

## 第四阶段留下的第五阶段建议（历史）

1. 真实人手的产品级标定：不同肤色、光照、遮挡下的阈值与命中率（含教程完成率统计）。
2. 把开场粒子与工作室收进同一个场景，消除双 WebGL 上下文，并让"Hello"成为可复用的转场语言。
3. 文字自动识别 + 3D 文字挤出（笔迹 Mesh → 字形 → `ExtrudeGeometry`）。
4. TensorFlow.js `hand-pose-detection` provider 实装与双引擎对比面板。
5. 副手作为第二根手指：真正的双手缩放 / 平移 / 橡皮组合，保留主手粘性策略。
6. 作品库增强：重命名、标签、排序、批量导出、导入后直接继续编辑（不必先入库）。
7. 录屏导出（MediaRecorder + `captureStream`）与 GIF 短片。
8. 光标前馈预测（在跟手与稳定之间补偿收敛延迟）。
9. 可访问性：键盘/指针兜底路径的焦点顺序、色觉友好的配色核对、说明书的多语言与读屏文本。
10. i18n：把教程与说明书文案抽成语言包（当前硬编码中文）。

详见 [`docs/phase4-log.md`](docs/phase4-log.md) 第 11、12 节。
