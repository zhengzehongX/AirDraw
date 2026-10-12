# 第十八阶段：缩放稳定性、玩具生命周期、日间工作区与回归

日期：2026-10-11。基于第十七阶段及用户后续源码修改，沿用现有 CameraService、Worker、DrawEngine、InputRouter、AppCommandBus 与单一 R3F Canvas。原文件保存在 `.bak-p18/`，没有新依赖、代码提交或作品删除。

## 真实状态

| 整改 | 本轮完成内容 | 验收边界 |
| --- | --- | --- |
| ⑦输入/导航 | 滤波与速度限制回到摄像头平面；采样用稳定 CSS 屏幕距离；身份/异常位置切换结束导航；绘画中停止相机回弹 | 合成缩放静止通过；真人两种模式静止偏移尚未解决，不能宣布通过 |
| ⑧PlayLab | 识别帧驱动滑动；静止等待不消耗滑动时限；初始化队列与代次；退出禁止新操作；镜像遵循共享设置；场景引用变化重新 attach；光球 dispose 清空资源引用 | 五玩具挂载/退出与 UI 隔离通过；真人双手交叉/物理滑动与所有玩法仍待实机 |
| ⑨UI/设置 | 日间环境、移除主题入口/语音别名；Hello 等明确确认；设置/Guide/教程英文；校准和输入提示译文；大按钮与菜单滚动；教练卡按可用区域居中 | 设置闭环及窄窗聚焦通过；并非所有系统错误/第三方异常文本均完成翻译或视觉验收 |
| ⑩生命周期/保存 | Worker 启动复用并立即取消；失败 DB 连接可重试；选择/保存状态不重建笔迹；二维视图保存/恢复；30分钟隔离工程运行 | 无持续增长迹象；硬件60fps、真实语音、设备热插拔、所有损坏恢复分支与全部导出组合仍未全覆盖 |

## 修改原因与模块

- `DrawEngine`：旧 canvas 模式先 screenToDoc 再进入 One-Euro/VelocityLimiter，使滤波的速度、异常跳跃与最小距离随 zoom 改变。现在先过滤摄像头 plane，再得到稳定屏幕位置，最后反算文档坐标。`StrokeStore.append` 支持显式测量距离；两种模式采样基准均为 CSS px，默认阈值约1.35px，性能档仍可调整已有采样预算。静止区仍为原来的2 CSS px，没有新增滤波堆叠或放宽捏合阈值。
- `Scene3D.CameraRig`：落笔期间暂停 view 返回弹簧，避免世界笔迹已生成后相机继续移动；模式切换与输入取消仍由共享路由负责。不改原始轨迹。
- `PalmSwipeDetector`：旧计时包含140ms准备后的静止等待，长时间张掌会耗尽650ms时限，使真正滑动落入取消冷却。现在保留基准，从超出已有 dead zone 后计时，距离、速度、反转、闭手、丢手与冷却安全条件保留。新增左右方向长静止后滑动的回归。
- `LabRuntime`：缓存的 Toy 是单例模块；过期 initialize 若直接 dispose 可能释放新挂载资源。队列串行，过期代次在 initialize 前/后检查；过期自有初始化清理完成后才开始新任务。UI 捕获与独立双手 session 沿用第十七阶段。
- `LabStage`：原 attached ref 可在 runtime 引用变化后仍为true，新 runtime 没有 scene context。改成基于 runtime/scene/camera/gl 的 effect。测试中真实复现 `runtime is not attached`，修复后五个玩具均有实际场景节点且无异常。
- `energyOrb`：dispose 后把已销毁 geometry/material 引用置空，让下次 enter 真正重建。光球、粒子和烟花采用 NormalBlending；粒子色调降低亮度，避免白色环境中加法混合消失。保留所有手势玩法。
- `WorkerHandProvider`：并发 start 返回同一任务；dispose 取消初始化定时器、拒绝待启动任务并清空处理器，旧 ready 不再复活已关闭实例。Bitmap 单飞与Worker推理不变。
- `useProjectBridge`：仅对象数组引用变化才替换笔迹，选择与保存状态不会重建全部渲染缓存；导航标记待保存但不进入对象历史。`sessionSnapshot`/迁移增加可选 `canvasView`，打开新工程重置，旧工程身份视图默认值；纸张/相机/对象保留。
- `storage`：失败的 IndexedDB open Promise 不永久缓存；versionchange 关闭旧连接；保留工程/快照事务与已有迁移校验。
- `themeController`/设置 schema/VoiceCommandRouter：产品环境固定 day；旧 night 数据可读取，普通用户无日夜入口，旧内部 SET_THEME 只呈现 day。纸张深色仍可选择。
- `LaunchScreen`：Hello 没有自动 dispersing 定时器；正常动效两次明确确认，Reduced Motion/Skip 保留。共享浏览器驱动同步为实际入口流程，未用测试专用产品自动跳转。
- UI：设置滑杆状态反馈定时器可取消；键盘滚动备用；菜单56px行高、窗口内最大高度；Make 3D 教练卡受可用区域宽度约束；Guide与教程按真实 locale 切换，不改变状态 id。
- 输入诊断增加每帧 mapping：原始指尖、原始屏幕、稳定光标、落笔坐标、最后采样屏幕、视图、DPR、绘画区域与镜像。该诊断增强在长跑后加入，不影响核心渲染链路；最终构建/回归另行检查。

## 本轮新证据

所有浏览器使用隔离 Context 和测试工程，未读写用户浏览器作品。自动化与真人结果明确分开。

| 检查 | 结果/范围 |
| --- | --- |
| phase18-core | 29/29：CSS采样跨0.2—8×、锚点、迁移、退出状态、长静止左右滑、fake Worker 并发启动/立即取消 |
| phase18-e2e | 17/17：Hello保持、day-only、0.5/1/2/4×静止光标和墨迹点一致且不增点、工程视图重开、四种窗口无横向溢出/单Canvas |
| phase17-e2e 重跑 | 21/21：四DPR×四尺寸真实二维像素、三次三维提交、PNG和解码WebM、替代WebGL混合像素与恢复；不是全部真实Mixed工程导出 |
| PlayLab浏览器 | 31/31：左右滑、负例、30滑动不跳多页、五玩具有几何与退出清理、20次流体往返、回画布/输入隔离；30次检查不证明每次物理手势成功 |
| 设置浏览器 | 38/38：鼠标/键盘/捏合拖动、应用服务、重开保持、默认恢复、语言和输入排他；有一项消费端直接读取prefs标n/a，不冒充动态测量 |
| 语音浏览器 | 21/21：替身识别器的唤醒、命令总线、重复final、危险确认、拒绝权限、语言重启、反馈音量；不是实际麦克风 |
| Worker浏览器 | 5/5：真实MediaPipe CPU→GPU、同Worker、20模式切换一流一Worker一Canvas、实际推理；使用浏览器假摄像头，不是真人识别 |
| 已有纯逻辑重跑 | selfcheck通过；contact18/18；stage5 987/987；stage6 143/143；playlab55/55；phase8 784/784；phase17 18/18 |
| phase18-soak | 完整1800006ms，176次切换，100个笔画fixture+2模型+五玩具，176个采样；一Canvas且identity一致、contextLoss=0、errors=[]；每30次保存/重开对象数一致 |

长跑开始UTC08:12:06，即北京时间16:12:06。堆内存采样85.6—134.2MB，起点94.1MB、终点103.3MB；不能把正常GC波动当成泄漏或宣称绝无泄漏。geometry随模式/玩具在13—115间变化；同类切片未见逐轮增加。SwiftShader不代表硬件60fps，长跑没有真实MediaPipe推理/麦克风，也没有记录完整camera frame drop/speech restart指标。

历史测试曾因Hello不再自动跳转、主题命令移除而失败；对应测试改为明确用户确认和“入口确实不存在”的负向断言。未降低像素、资源、输入断言。第一轮PlayLab受开发时HMR的旧scene引用影响出现挂载异常；保留其原因并在稳定页面重新运行，最终31/31。不把中间失败隐去或称历史全部通过。

原始结果：`verification/phase18-core.json`、`phase18-e2e.json`、`phase18-soak.json`、`playlab-e2e.json`、`phase10-settings.json`、`phase10-voice.json`、`stage5-worker-e2e.json`与phase17本轮重跑文件。

### 续做回归（2026-10-11）

- 第二次完整 UI 套件仅 FIST 后立即重画失败，其余 Gallery 删除/独立打开、Developer 开关及11课教程通过；原始日志 `verification/phase18-full-e2e.log` 保留失败。失败日志的 `penDiag` 是握拳前采样，不能用它证明释放后仍 penDown。
- 独立 `node scripts/phase18-recovery-e2e.mjs` 最终4/4：明确松开、重新定位并等待路由后，FIST 提交第一笔、下一次真实输入链捏合提交第二笔；共享 AppCommandBus 撤销/重做计数2→1→2；可见 Developer 行手势切换生效，无页面错误。合成输入不能替代真人恢复验收。
- 完整套件恢复步骤补充 release、settle、路由可绘制与实际 penDown 等待，保留原有新增提交断言；教程子页统一采用 APP_URL，不再硬编码5173。最终整套重跑结果另列。
- `node scripts/phase18-capture-profile.mjs`：1280×800 SwiftShader，20次同步合成，中位0.4ms、P95 1.1ms、最大1.3ms；20个临时Canvas。范围包括render/readback/二维重绘，不包括PNG编码、录制持久化或硬件GPU完成计时。初次探针导入不带Vite缓存时间戳的模块，未取得运行实例注册的capture服务；按运行页面resource URL导入后正常，未修改业务路径。
- 未因该小样本直接引入共享输出Canvas：异步编码/录制同时消费时复用可造成帧覆盖，若后续硬件测量需要优化，应先设计明确的buffer所有权与回收机制。
- PlayLab initialize 部分失败的清理分支仍需故障注入验证；现有正常生命周期测试不能证明加载异常资源也全部释放。
- `node scripts/phase18-storage-e2e.mjs` 7/7：隔离 IndexedDB 最新版本、上一有效快照、主动损坏后的拒绝/恢复/重存、canvasView恢复、旧字段默认值与独立删除。只测试业务事务，不冒充恢复弹窗UX验收；未触及真实作品。
- 最终完整 UI 重跑 `APP_URL=http://127.0.0.1:5174/ node scripts/e2e.mjs`：50项通过、3项失败，随后教程子页 `goto` 超过6000ms而终止。失败为第二次短绘画没有新提交、手势按钮撤销/重做计数1→1→1、长序列FIST后重画提交数未增加。记录 `verification/phase18-full-e2e-final.log`，**整套未通过**。独立恢复4/4和共享历史通过，只缩小排查范围，不能证明长序列问题已解决；需保存失败时逐帧mapping、history命令与InputRouter变更，继续定位时序/状态残留。上一轮教程11课通过保留为单独证据，本轮超时不标通过。
- 本轮最终 `node node_modules/typescript/bin/tsc -b`、`node node_modules/vite/bin/vite.js build` 均通过，主包2021.75KB/gzip596.08KB；仍有体积警告，未提高警告门槛。

## 真人结果与剩余优先级

用户实机反馈：连续绘画不再断笔，但两种模式静止后仍偏移，静止微抖时画笔会动。该结果不能被“合成静止0误差”替代。尚缺本版JSON及同帧光标/墨迹截图；目前不能确定是映射、主手识别、校准/灵敏度、静止噪声幅度或渲染几何问题。

1. P0：取得诊断mapping与截图，分开比较实际圆形光标、墨迹末端、原始指尖投影；40/60/80/100cm左右手静止/慢速/30秒书写。不通过再加滤波或放松contact掩盖。
   P1：完整UI长序列3个失败尚未闭环；为失败的第二笔、Undo按钮和FIST恢复加逐帧输入及命令记录，保持原提交数断言，确认后修复根因。导航超时与业务失败分别记录。
2. P1：双手交叉/丢手/身份交换、导航结束后再落笔、每个玩具全部玩法与真实语音30命令。
3. P1：全部2D/3D/Mixed工程PNG/透明PNG/SVG/GLB/缩略图/WebM与异常取消、损坏快照恢复；现有聚焦通过不代表矩阵全部覆盖。
4. P2：补齐窄窗面板遮挡自动断言、所有系统与第三方错误译文；长笔迹freehand仍为O(n)，主包约2MB有体积警告。
5. P2：硬件GPU录制同步readback/临时Canvas分配、60fps/真实摄像头帧掉落与speech重启监控，按测量优化，不牺牲接触识别。

## GitHub与技能

实际调用GitHub connector重新读取六项目当前许可证：MediaPipe Web示例Apache-2.0；R3F、Drei、Three.js、perfect-freehand、Motion为MIT。沿用现有依赖的场景、freehand与Motion；本阶段未复制外部仓库实现，没有来源不明代码。

- https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/LICENSE
- https://github.com/pmndrs/react-three-fiber/blob/master/LICENSE
- https://github.com/pmndrs/drei/blob/master/LICENSE
- https://github.com/mrdoob/three.js/blob/dev/LICENSE
- https://github.com/steveruizok/perfect-freehand/blob/main/LICENSE
- https://github.com/motiondivision/motion/blob/main/LICENSE.md

使用既有find-skills与airdraw-regression流程区分证据，无技能/软件包安装。项目没有Remotion运行依赖，本轮无新视频交付，未将Remotion接入识别/交互链。

## 文件清理

只清除本轮生成的8个 `node_modules/.tmp/*.mjs` 编译产物，共1,872,796字节，均可由保留的scripts重建。每个绝对路径检查处于该缓存目录，使用原生PowerShell精确删除，无递归清理。保留源码、public资源、package锁、用户数据、截图/历史测试证据、`.bak-p17/.bak-p18`及已有个人探针。
