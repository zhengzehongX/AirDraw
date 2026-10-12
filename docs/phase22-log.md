# AirDraw 第二十二阶段开发日志

日期：2026-10-12。延续现有 DrawEngine、StrokeStore、Project Workspace 与单一 R3F 场景；没有更换摄像头或手势识别链路，也没有新增依赖。

## 修复内容

- **二维笔迹即时显示：** `Canvas2DStrokeRenderer.rebuild` 现在复制提交快照，不再持有 `StrokeStore.committed` 的可变数组引用。提交后的实时笔迹会进入历史画布绘制，不必先平移或缩放才能看到。
- **模式残留：** `CanvasPlane` 只在 Canvas Draw 的模式权重非零时显示；纸张纹理和底板使用同一权重淡入淡出。非 Canvas 模式不再因工程仍有二维笔迹而保留画板平面。已有 3D 工程对象仍按 `ProjectStage` 的 Model Control 权重显示。
- **局部橡皮擦：** 捏合擦除会按橡皮轨迹裁剪笔画线段，保留未触及部分和原始文档坐标。Canvas Draw 在当前缩放视图的屏幕坐标中命中；空间绘画使用与笔迹相同的归一化平面。命中范围含笔迹可见宽度，并通过包围盒先排除远处线段。
- **撤销与项目数据：** 一次持续擦除形成一个 StrokeStore 历史动作；Project Workspace 在捏合结束或输入交接时只捕获一次改动。若擦除更换了 Stroke 对象引用，Workspace 依稳定 stroke id 保留原对象的变换、图层锁定/可见状态、父组和材质。整条笔迹被擦除时移除该对象，Undo 可恢复。
- **输入安全交接：** 切换模式、关闭绘画输入、UI 抢焦点、撤销/重做、清空、加载作品或释放引擎时会收尾擦除会话。短暂丢手会中断擦除路径但保留当前会话；恢复时从新位置继续，绝不跨丢失区间连接擦除轨迹。

## 验证

- TypeScript 项目构建检查通过。
- Vite 生产构建通过，输出写入 `node_modules/.tmp/phase22-dist`，没有覆盖现有 `dist`。
- 隔离 Vite + SwiftShader 合成手势运行 `phase16-coordinates-e2e.mjs`：49/49 通过，覆盖 1920×1080、1366×768、1024×768、2560×1080、Canvas 平移与 0.5/2.4 倍缩放、左右手、镜像/非镜像；二维实际笔迹坐标最坏误差 0px，所有光标测点不超过 4px，未发现 pageerror 或 console error。报告写在 `node_modules/.tmp/phase22-e2e`，未覆盖历史验证文件。
- 核心自检中新增的局部裁剪、单步 Undo/Redo、笔迹提交即绘制断言通过。整套 `verify:core` 仍有 1 项既有语音命令覆盖断言失败：`打开玩具 / open playlab`；本阶段未修改语音命令模块，其余本次相关断言通过。
- 开发服务器在多个页面卸载时记录 `THREE.Clock` 弃用警告；生产构建仍提示主 JS chunk 约 1.95 MB（gzip 约 574 KB）。两项均非本次改动引起。
- 没有使用真实摄像头或真人手势进行本阶段验收。实际手势速度、模型模式视觉残留和不同窗口下橡皮命中仍需在浏览器中确认。

## 相关文件

- `src/rendering/canvas2d/Canvas2DStrokeRenderer.ts`
- `src/rendering/three/CanvasPlane.tsx`
- `src/engine/StrokeStore.ts`
- `src/engine/DrawEngine.ts`
- `src/project/workspace.ts`
- `scripts/selfcheck.ts`

## 后续检查

1. 在浏览器中连续切换 Canvas Draw、Spatial Draw、Model Control，确认各模式完成过渡后没有上一模式的底板或工程对象残留。
2. 在白纸、深色纸、不同缩放级别下绘制后立即检查笔迹；沿已有线条横向与纵向擦除，确认只移除橡皮覆盖部分，且一次长擦除只需一次 Undo 即可完整恢复。
3. 对带位置/缩放/编组的笔迹执行局部擦除、保存、重新打开、Undo/Redo，确认对象关系和材质仍保持。
4. 使用真实摄像头测试短暂遮挡后的擦除续接与捏合释放；模拟测试不能代替此项实机验收。
