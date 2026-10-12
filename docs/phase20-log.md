# 第二十阶段：互动 Hello 与手势模型工作室

日期：2026-10-11。在第十九阶段基础上渐进修改，未恢复 PlayLab，未新增依赖或第二套摄像头、识别、菜单控制。

## 真实实现

- `ParticleHello`：聚合字形仍以固定目标缓冲表示，Shader 加入小幅持续运动与局部排斥。全窗 pointer listener 跨启动 DOM 浮层接收鼠标；已启用手势复用 DrawEngine 指针。最近鼠标动作优先，否则使用新鲜手帧；世界坐标转换到粒子局部空间，包含缩放和垂直偏移。减少动态效果关闭流动与排斥，卸载清理监听和几何。
- `LaunchScreen` / App：增加显式启用手势按钮，CameraService 单例启动；请求、预热、就绪及错误状态使用服务状态，不自动请求麦克风。错误可重试，Hello 仍等待明确进入操作。
- `ProjectStage`：单手 Move 使用相机平面与抓取偏移并转换到父级局部坐标；Rotate 掌向变化转换到当前相机方向；Scale 使用抓取基准与屏幕高度归一化上下移动，保留非均匀缩放比例。第二只手捏合即结束对象会话，并要求释放后重新抓取。
- `WorldNavigation` / CameraRig：双手相机导航独立会话，固定中点、距离、相机方向基准；Orbit / Pan / Zoom 明确子工具。迟滞输入沿用现有共享检测器，新增导航死区、阻尼、速度和视距限制。身份／输入 epoch、短距交叉、异常角度、丢手、过期手帧、隐藏页面会结束并要求重新抓取。
- 所有实时模型通过已有 ProjectStage 加载、选择和编辑。Scene3D 不再挂载旧 ModelStage 的独立示例操控路径，仅显示非作品底座；旧源码保留归档。删除最后一个工程模型不再切回旧示例分支。
- 模型相机以投影偏移按属性栏占用空间居中，窄窗口按剩余创作区宽高比调整距离，属性栏使用清晰日间底色；拾取继续使用同一投影。单手抓取期间暂停相机追赶；提供聚焦选中／显示全部／重置。新增模型按序错开，保留原有对象。
- ModelDock：对象／世界／模型库结构；共享 GestureButton，64px 主要控制、24px 标题、系统字体和既有色彩。固定标题与范围入口，仅内部内容滚动；模型库插画覆盖通用小图标规则。缩放滑杆实时预览、结束只提交一次，取消恢复，不每帧建立历史。
- 模型库：新增本地 Avocado 与 ToyCar。导入复用原 GLB 验证、归一化、内嵌资源和历史。新工程切换或加载取消后不提交过期结果。取消不能中止正在进行的 GLTF parse/export，但会阻止提交并最终释放资源。
- `Project.modelView` 可选字段独立保存模型相机，不改变 schemaVersion 2；迁移验证有限值和边界，旧工程缺失则默认视角。会话结束或视角命令才更新，不每帧保存，不进入 Undo。
- 更新中英界面、应用内 Help、README 与 USER_GUIDE。

## 来源与许可

- [Blender 视口导航手册](https://docs.blender.org/manual/id/4.5/editors/3dview/navigate/navigation.html)：参考 Orbit / Pan / Zoom 与 Frame Selected / All 的组织语义。
- GitHub 核对 [Blender COPYING](https://github.com/blender/blender/blob/main/COPYING)：GPL；没有复制 Blender 源码。
- GitHub 核对 [Avocado](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/Avocado/README.md) 和 [ToyCar](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/ToyCar/README.md)：均 CC0。ToyCar 默认场景移除展示布与示例相机，仅保留车体和玻璃；出处、作者、修改和 SHA256 见 `public/models/library/ATTRIBUTION.md`。
- Duck 使用 SCEA 许可、DamagedHelmet 含历史非商业归属、Fox 带不同署名条目、CesiumMan 含商标说明；这些候选未加入。
- UI/UX Pro Max 搜索匹配空间创作／沉浸体验；采用范围清晰、对比、目标尺寸、渐进显示和减少动态效果建议，保留项目原有日间色彩与系统字体。find-skills 先查询技能目录，现有能力足够，没有安装额外技能。
- 读取 Remotion 路由技能；本阶段输出是实时交互应用而非视频，没有创建 Composition 或把 Remotion 加入摄像头链路。

## 本轮证据与边界

- TypeScript 项目检查通过；Vite 生产构建通过。主包 1,931.28 kB / gzip 568.50 kB，仍有体积警告。
- 隔离 Chrome / SwiftShader、独立存储、`127.0.0.1:5174/?simulate=1`：视觉浏览启动与 Hello、模型三个面板，点击模型库加载牛油果与玩具车、显示全部；1440×900 和 768×800 截图归档 `docs/verification/phase20-*.png`。该流程没有捕获 pageerror。
- 本轮未新增或运行正式测试套件；以上为模拟输入下的视觉与资源加载检查，不是手势功能通过证明。
- 未执行真实摄像头、麦克风、双手交叉、30分钟运行或完整工程/导出回归；也未实测权限拒绝恢复。旧静止偏移与旧长序列失败仍开放，不能用此次构建/截图覆盖。

## 后续验收

1. 真人分别单手移动、掌向旋转、上下缩放；抓取不跳变，松开后不继续漂移，每次操作对应一次 Undo。
2. 双手捏合进行三个世界工具；对象 transform 前后不变，交叉／身份变化／丢手冻结，必须释放后恢复，UI 操作不能串入世界。
3. 工程保存重开校验 modelView 与旧 schema 2 兼容；独立模型导入、删除、撤销、GLB 与 JSON 导出，使用隔离工程。
4. 验证 Hello 鼠标与真人指针效果、权限拒绝重试、减少动态效果、面板折叠与不同 DPR 的最终拾取。
5. 当前仅对象变换，不提供 Blender 顶点/面编辑、雕刻、骨骼或动画编辑；模型动画不在本轮交付内。大模型 parse/export 的异步执行仍可能占主线程，后续需测量与分段处理。
