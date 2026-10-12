# Quick Start / 快速入门

## 1. Start AirDraw / 启动 AirDraw
Run npm install, then npm run dev; open Vite's localhost URL in a Chromium-based browser. / 执行 npm install、npm run dev，然后用 Chromium 打开 Vite 提供的 localhost 地址。

![Hello particle intro](release/screenshots/hello-particles.png)

## 2. Enter the creation hub / 进入创作大厅
Choose Start Experience / 开始体验 to see the particle Hello, then explicitly choose Enter Creation / 进入创作. The intro does not auto-navigate. / 点击“开始体验”查看粒子 Hello，再明确选择“进入创作”。页面不会自动跳转。

![Creation hub](release/screenshots/creation-hub.png)

## 3. Enable hand tracking / 启用手势识别
Choose a mode and grant camera access when prompted. Wait for hand tracking to become ready. Point with your index finger; pinch with thumb and index finger to confirm or draw. / 选择模式并按提示授权摄像头，等待手势就绪。食指用于指向，拇指与食指捏合用于确认或绘画。

## 4. Draw on the canvas / 平面绘画
In Canvas Draw, pinch and move to draw; release to finish. Choose a pen, marker, highlighter or eraser. Adjust color and size, undo/redo, and choose a white, dark or transparent canvas. Export the artwork as PNG or SVG. / 在平面绘画中捏合移动并松开结束笔画。选择钢笔、马克笔、荧光笔或橡皮擦，调整颜色和粗细，撤销重做，切换白色/深色/透明背景，并导出 PNG 或 SVG。

![Canvas Draw](release/screenshots/canvas-draw.png)

## 5. Draw in 3D / 三维绘画
In Spatial Draw, pinch-move to create a 3D stroke. Use the floor grid and origin axes as spatial references; choose a surface material from the tools panel. / 在三维绘画中捏合移动绘制空间笔迹。地面网格和原点轴用于定位，工具面板可选择笔迹材质。

![Spatial Draw](release/screenshots/spatial-draw.png)

## 6. Manipulate 3D objects / 操控三维对象
In Model Control, point at an object and pinch-hold to manipulate it. Choose Move, Rotate or Scale; briefly hold the V pose to cycle the active transform. Pinching with both hands navigates the world view (zoom, pan and orbit) without changing the object's transform. GLB imports as a single file. For glTF, select the model and its related BIN/textures together. / 在模型操控中指向对象并捏合保持。在面板选择移动、旋转或缩放；短暂保持 V 手势可循环变换工具。双手捏合用于缩放、平移和环绕世界视角，不会改变对象本身。GLB 可单文件导入；glTF 需连同相关 BIN 与贴图一起选择。

![Model Control](release/screenshots/model-control.png)

## 7. Save and export / 保存与导出
Use the project menu to save, duplicate, rename or reopen projects. Autosave runs after editing pauses. Export important work as an AirDraw JSON package for backup. / 使用工程菜单保存、复制、重命名或打开项目；编辑暂停后自动保存。建议重要作品另存为 AirDraw JSON 备份。

## Troubleshooting / 常见问题
- No hand detected / 未识别到手：improve front lighting, place your hand inside the camera frame and check site permission. / 改善正面照明，让手进入镜头并检查网站权限。
- Pinch does not draw / 捏合不能绘画：check camera status, move away from UI controls and confirm a drawing mode is active. / 检查摄像头状态，避开工具控件并确认处于绘画模式。
- Cursor drifts while still / 静止后光标偏移：this remains an open real-device issue. Export an input diagnostic and include a screenshot with cursor and stroke. / 此问题仍待实机定位，请导出输入诊断并附上同时显示光标和笔迹的截图。
- Permission denied / 权限被拒绝：change the site permission in browser settings, reload and retry. / 在浏览器设置中修改网站权限，刷新后重试。

Screenshots in this folder use isolated browser runs with simulated input and no live camera. / 本目录截图来自隔离浏览器和模拟输入，不含实时摄像头画面。
