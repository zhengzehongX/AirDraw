# AirDraw 第五阶段开发与交接

日期：2026-10-05。基线盘点见 `project-handoff-2026-10-05.md`，该报告记录开发前状态，不作为本阶段完成清单。当前目录没有 Git 元数据，未创建提交或 PR。

## 当前状态

保留 React/TypeScript、DrawEngine、GestureEngine、GestureInteractionManager、R3F 场景、主题与存储架构，渐进增加模式、接触检测、Worker 和上下文 Dock。摄像头授权、空间绘画、原有材质、历史、教程、Gallery、Help、Developer Mode 均继续使用。

| 分类 | 本阶段结果 |
| --- | --- |
| 已完成 | 单 Canvas 开场/工作区；共享 Worker Hand Landmarker 与流；GPU/CPU 与三项置信度设置；双手数据；独立接触状态机和本地三次校准；InputRouter 单焦点与释放锁；平面笔迹工具/背景/PNG/SVG；模型加载、本地导入、移动/掌面旋转/双手缩放/单手滑杆/重置/长按删除；连续可反向模式过渡；Design/Motion Tokens；玻璃工具、圆形光标、按钮微响应；分类纹理及来源清单。 |
| 部分完成 | 界面统一与模型选中边界/淡色轴提示已经实现，但视觉过渡仍需真人体验调优；主题使用灯光与颜色插值，双 HDR 环境混合未实现；相机为近似正交；低性能视觉降级沿用 governor，真实设备质量与 FPS 未量测。 |
| 未完成 | 用户规定的完整真实手 40/70/100cm、手型、光线、背景、遮挡与交叉矩阵；长时 GPU 泄漏测量；模型作品持久化；录屏、云同步、文字识别（此前规划延续）。 |
| 存在问题/限制 | 单目接触不能作为物理接触证明；MediaPipe 不返回逐点置信度；系统授权/文件选择无法完全由网页手势完成；主包偏大；GLTF 压缩扩展支持受当前加载器限制；部署 CSP 需支持 Worker 的 Blob ESM 适配；仅有模拟数据不能保证真实手零误触。 |

## 模块与续接入口

- `src/utils/gesture/PinchContactDetector.ts`：OPEN → NEAR → CONTACT → HOLD → RELEASE；二维/三维距离均归一化，四帧确认与释放 hysteresis。HAND_LOST/身份变化/置信度不足立即结束。
- `src/services/handTracking/WorkerHandProvider.ts`、`tracking.worker.ts`：主线程传可转移 ImageBitmap；单次在途推理防积压；Worker 初始化 Promise 防重复实例，参数更新使用 setOptions。切模式不关闭流。
- `src/engine/DrawEngine.ts`：共享主手/副手、平滑坐标、接触检测、两种笔迹历史。先发布光标让 UI 路由拦截，再处理落笔；350ms 结果超时取消输入。
- `src/app/AppMode.ts`、`src/interaction/InputRouter.ts`：模式权重从当前值反向插值；UI、过渡、换手取消输入，保持捏合进入另一上下文必须先松开。
- `src/rendering/canvas2d/freehand.ts`、`CanvasPlane.tsx`：perfect-freehand 生成轮廓，慢速轻微变粗可关闭，绘画平面 z=0。1600×900 PNG/SVG 导出。
- `src/model/`、`src/rendering/three/ModelStage.tsx`：GLTF 资源验证/释放、变换控制；抓取记录世界矩阵、命中点与平面偏移，避免瞬间跳变。缩放限制 0.2–4，旋转死区与速率限制，松开停止。
- `src/components/ModeSwitcher.tsx`、`CanvasDock.tsx`、`ModelDock.tsx`、`SurfaceDock.tsx`、`PinchCalibration.tsx`：上下文界面。
- `src/design/motion.ts`、`src/styles/tokens.css`、`workspace.css`：集中动效/外观参数。Motion DOM 与场景逐帧插值保持可中断。
- `public/materials/catalog.json`：木材 wood_table_001、金属 metal_plate、石材 brushed_concrete；每项 1K diffuse/normal/roughness，共九张图，含上游 MD5 和下载后 SHA256。原始元数据见 `docs/materials/`。内置 `public/models/airdraw-orb.glb` 是本地生成模型。

## 识别与校准细节

初始接触阈值 0.16、释放 0.26，最终本地 profile 取三次自然张开/闭合/松开的稳定最小距离中位数；同时统计投影和 Z 差。默认值只是启动调试值。`worldLandmarks[5]–[17]` 掌宽用于三维归一化，指尖末节长度估算半径并限制接触范围；置信度指手部 score，逐点仅做有效性检查。

GPU/CPU 推理实测均运行在 Worker。当前 vendored WASM 引导脚本是 classic UMD，Vite 模块 Worker 的适配器为其补齐 `custom_dbg` 绑定、导出 ModuleFactory 并通过 Blob ESM 执行；所有代码来自已存在的 vendored 包，未引入未知来源。部署时需验证 `worker-src`、`script-src`、WASM 策略与 Blob 许可；后续优先升级为官方原生 ESM 引导，不能为解决 CSP 将同步推理偷偷搬回主线程。

## 本次用户反馈与修复

用户反馈：“教程界面的 UI 出现了偏移不在 web 中心，无法进行书写”。复现于干净浏览器首访：校准框左上角落在屏幕中心，教程提示仍在左下角，且教程后台前进到确认课，校准作用域又阻止教程确认。

根因是 Motion 的 scale transform 覆盖 CSS translate 居中，以及校准/教程并行展示。修复后：静态 Grid 父层负责校准居中，内部 Motion 只做缩放；校准期间隐藏教程并暂停步骤推进；教程提示在页面水平中央下方，练习圆环位于中央，书写区域不受提示遮挡；教程完成前不开放模式切换；提示卡注册为 UI 区域以防写入其后方。自动测试实际完成三次校准、确认和两笔书写。用户真实摄像头复验待反馈。

同时修复旧记录的画笔偏好初始化/写回、作品画笔恢复、日夜偏好写回、reduced-motion、Gallery 短按绕过删除确认、JSON 输入边界、清空后 redo、笔迹缓存身份与压缩活笔几何。IndexedDB 保存现在等待事务提交，旧存档只在持久化成功后删除，避免提前清除。

## 参考、采用范围与许可证

| 来源 | 许可证核对 | 使用范围 |
| --- | --- | --- |
| google-ai-edge/mediapipe-samples-web | main/LICENSE，Apache-2.0 | Worker 生命周期、帧转移、配置思路；使用 tasks-vision 依赖 |
| steveruizok/perfect-freehand | main/LICENSE，MIT | 安装依赖并调用 getStroke，没有手抄内部算法 |
| pmndrs/react-three-fiber | master/LICENSE，MIT | useFrame 与渲染生命周期，沿用现有依赖 |
| pmndrs/drei | master/LICENSE，MIT | useGLTF、射线平面与拖动偏移架构思路 |
| motiondivision/motion | main/LICENSE.md，MIT | motion/react、MotionValue、弹簧与 reduced motion |
| amerob/gesture-3d-studio | README 标记 MIT，但 LICENSE 不存在、元数据 license 为空 | 仅参考交互概念，没有复制源码 |
| Poly Haven | polyhaven.com/license，CC0 | 九张下载纹理；分类清单、来源与哈希已保存 |

已核对许可证文本快照在 `docs/licenses/`。上述参考不构成本项目新增许可证声明，依赖自身许可与版权继续保留。

## 启动与验证

标准 `npm install`、`npm run dev`、`npm run build`。当前机器 npm 未在 PATH，使用 Node 直接运行 Vite；预览服务为 **http://localhost:5174/**（5173 已被占用）。npm package-lock 已同步新增 motion、perfect-freehand 与版本 0.5.0。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| TypeScript + 生产构建 | 通过，主包 1.74MB / gzip 504KB、Worker 158KB；体积告警仍在 | tsc -b，vite build |
| 原有核心自检 | ALL CHECKS PASSED | scripts/selfcheck.ts |
| 第五阶段合成核心 | 552/552 | scripts/stage5-core.ts |
| 工作区浏览器回归 | 13/13：30次 NEAR 无笔迹、空间/平面绘画、PNG/SVG、抓取释放、20次切换、历史、快速反向 | verification/stage5-e2e.json |
| 真 MediaPipe + 假摄像头 | 5/5：CPU → GPU setOptions、20次模式切换保持一个流/Worker/Canvas、推理执行 | verification/stage5-worker-e2e.json |
| 首访校准/教程回归 | 12/12：1440×900、1366×768、390×844 居中；三次校准、教程确认、两笔书写 | verification/stage5-tutorial-e2e.json |

执行 `npm run verify:stage5`、`npm run e2e:stage5`、`npm run e2e:worker`、`npm run e2e:tutorial`。浏览器脚本默认 5174，可通过 APP_URL 指定 URL。当前测试使用 Chrome 固定 Windows 路径，后续应改可配置。截图在 `docs/verification/`。

浏览器 SwiftShader 测试不是硬件性能验收。未声称已达到桌面 60fps，未进行 30 分钟 GPU 内存追踪。假摄像头没有真人手，合成 worldLandmarks 只验证算法和路由。

## 人手验收待办与下一优先级

1. **P0** 用户复验居中/教程落笔。之后分别在 40、70、100cm 测左右手、不同掌宽、正面/侧面、室内/复杂背景，每组 30次靠近不接触、30次真实捏合；记录误触、漏触与延迟，调个人校准，不能只缩小固定阈值。
2. **P0** 快写、慢圆、中文转折、短暂遮挡、重新入画、双手交叉与主手切换；确认无跨屏连线、未释放不能跨上下文抓取。
3. **P1** 真双手缩放/旋转与抓取不跳变专项；20次真实摄像头模式切换与长期 FPS、显存、监听数量曲线。
4. **P1** 细化连续空间过渡、环境反射/阴影与场景透明度，补双 HDR 主题混合；增强模型加载错误 UI 与不支持扩展提示。
5. **P2** 主包分割、测试 Chrome 路径配置、真正正交相机/导出视口一致性、存储降级持久化提醒与更严格总点数导入上限。

后续 Agent 应从这些模块继续，保留单流/单 Canvas/独占输入约束与原有可用功能。先读取本文、基线报告与对应源文件再变更；不要将待验收项目标记为完成。
