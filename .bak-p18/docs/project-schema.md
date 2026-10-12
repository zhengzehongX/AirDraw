# AirDraw 工程数据与输入约束

更新：2026-10-05，第六阶段，运行版本 0.6.0。

## 工程文件

`Project` 定义见 `src/project/types.ts`。IndexedDB 使用独立数据库 `airdraw-projects`，数据库版本 1；工程数据的 `schemaVersion` 为 2。旧作品库是另一个数据库 `airdraw`（store `artworks`，见 `src/storage/artworks.ts:16`），二者不是同一数据格式。

| 字段 | 内容 |
| --- | --- |
| id / name | 工程 UUID、最长 60 字符名称 |
| schemaVersion | 当前为 2；未来版本拒绝静默降级 |
| createdAt / updatedAt | 毫秒时间戳 |
| objects | 有序 SceneObject 数组 |
| assets | 按资源 UUID 保存的自包含 GLB data URI；对象只保留 assetId |
| theme / paper | day/night；white/dark/transparent，主题不覆盖纸张选择 |
| camera | yaw、pitch、distance |
| thumbnail | 可空的图片 data URI |

JSON 导出保存工程数据和模型资源，不包含摄像头画面、校准或 Undo 栈。校准与主手偏好属于设备设置，不是作品内容。将 GLTF 与依赖文件一同导入后，资源标准化为内嵌 GLB；会话 blob URL 不进入工程。

## SceneObject

所有对象具有 `id, type, name, visible, locked, transform, material, createdAt, updatedAt, modeSource`。

| 字段 | 约定 |
| --- | --- |
| type | stroke2d、stroke3d、model、solid、group；light/camera/background 是预留类型，尚无对象编辑 UI |
| transform | position[3]、四元数 rotation[4]、scale[3]；世界空间使用 Three.js 坐标 |
| material | preset 与 color；导入模型保留其原始 PBR 材质，预设重新赋材质尚未全面实现 |
| parentId | 可空；Group 使用父子层级，不复制网格 |
| stroke | 原始 segments 点列、width、color、material、LOD；平面工具与虚拟压感作为笔迹属性 |
| assetId | model 引用工程 assets |
| recognition / text | 已确认的 geometry/text 建议；文字建议提供者默认关闭 |
| conversion | sourceId、method、depth、bevel、smooth；Scale 写入 transform |

笔迹原始 x/y 为归一化摄像头平面坐标，映射到 16×9 工作区；空间 z 使用现有 0.35 缩放。层级矩阵按父到子相乘。父组锁定或隐藏会影响后代的选择与变换。UI 采用统一缩放；非均匀缩放父节点造成的 shear 尚不能精确表示在 TRS 中。

## 历史与持久化

CommandHistory 保存最多 100 步，轨迹与资源通过引用共享。一次连续抓取或滑杆操作在松开时写入一个命令；绘画、擦除、转换、材质、图层顺序和编组可 Undo/Redo。切换工程前取消当前输入，打开工程后清空历史和预览。历史当前只在会话内可恢复，没有跨关闭持久化。

自动保存防抖 1800ms，在编辑时捕获工程快照，等待 IndexedDB 事务提交才显示成功；自动保存不产生历史命令。`snapshots` 保存前一次有效工程；主记录失败时可尝试该快照。首存没有更早状态，快照为首次有效保存。导入校验对象 ID、循环父引用、有限坐标、轨迹总量、转换参数及模型资源；损坏或未来版本返回错误。

## 接触与焦点

所有模式共用 Worker、摄像头流、主手选择器和 PinchContactDetector。OPEN/NEAR/CONTACT/HOLD/RELEASE 五态保留，HOLD 表示**最近 5 帧里至少 4 帧通过**接触判定（容忍单帧抖动，见 `PinchContactDetector.ts` 的 `recent` 投票）。默认 profile 为 contact 0.30 / release 0.37 / projection 0.30 / z 0.16（掌宽归一化）。设置里的「捏合辅助」在这个基础上最多再放宽 45%（投影一起放宽，深度只放宽一半），因为它只回答"两指可以离多远"，不回答"要不要连续多帧确认"，这个距离区间是按"真人指腹刚好相触时单目关键点能测到什么"定的，而不是按测试夹具。InputRouter 一次只允许 WORKSPACE/UI/BLOCKED 一个上下文。跨上下文持续捏合必须先松开；丢手、身份变化、面板、查看模式和模式切换会收笔或释放。

个人校准以三次自然张开—真实接触保持—松开的稳定中位样本建立 profile。开合同时检查二维与三维距离，避免把三维深度噪声当成松开；校准不依赖默认 HOLD 已通过。个人范围允许测得的单目世界深度误差，未校准仍使用保守默认值与指节半径估计。无 calibratedAt 的默认配置不算完成校准。

`airdraw-pinch-calibration` 保存 contact、release、projection、z、掌宽、米制距离估计、校准使用的手、主手设置、灵敏度和时间。米制距离是模型估计，不是物理测量。MediaPipe handedness score 不是逐点置信度；只对逐点坐标做有效性检查，不虚构分数。

摄像头“导出输入诊断”包含最近 300 帧的数值、判定状态与输入门，不包含视频或关键点图像。真实接触准确性仍需要真人动作矩阵验证。
