# 玩具与参考项目：来源与许可证

核对日期：2026-10-07。规则：**参考用于确定做法，不复制源码**；无许可证的仓库默认保留所有权利，只读思路、不搬代码。已安装依赖以本机 `node_modules/<包>/package.json` 的字段为准，外部仓库以 GitHub API 返回的 `license.spdx_id` 为准（2026-10-07 查询）。

## 当前五个玩具的来源

`光球 / 粒子星云 / 流体墨水 / 手掌海洋 / 烟花`（`src/playlab/toys/`，注册表见 `src/playlab/catalog.ts`）是本项目的原创实现：着色器、缓冲复用、FBO 生命周期与手到世界的映射都写在本仓库里，没有取自外部示例工程。它们只使用下表这些已安装依赖的公开 API。

## 已安装依赖

| 包 | 版本 | 许可证 | 在本项目中的角色 |
| --- | --- | --- | --- |
| three | 0.186.1 | MIT | 场景、几何、着色器材质 |
| @react-three/fiber | 9.8.1 | MIT | 唯一的 `<Canvas>` 与帧循环 |
| @react-three/drei | 10.7.9 | MIT | 辅助控件 |
| postprocessing | 6.39.5 | **Zlib** | Bloom 等后期（注意：不是 MIT） |
| three-stdlib | 2.36.1 | MIT | 工具函数 |
| @mediapipe/tasks-vision | 1.0.1 | Apache-2.0 | 手部关键点识别 |
| motion | 14.0.0 | MIT | DOM 动效 |
| perfect-freehand | 1.2.3 | MIT | 二维笔触轮廓 |
| react / react-dom | 19.3.0 | MIT | 界面 |
| vite / rolldown | 8.3.2 / 1.2.12 | MIT | 构建 |
| playwright-core | 1.63.0 | Apache-2.0 | 仅测试链路 |

许可证文本存放在 `docs/licenses/`。模型文件与 WASM 由 `@mediapipe/tasks-vision` 条款约束；手部模型权重来源与再分发条件仍需单独确认（见「遗留限制」）。

## 参考项目（第十阶段点名）

| 参考 | 许可证（2026-10-07 核对） | 只借鉴什么 | 是否引入代码 |
| --- | --- | --- | --- |
| [collidingScopes/threejs-handtracking-101](https://github.com/collidingScopes/threejs-handtracking-101) | **无 LICENSE 文件** → 默认保留所有权利 | 手到 3D 的交互组织方式、几何实验室的玩法分层 | 否，禁止复制 |
| [collidingScopes/3d-model-playground](https://github.com/collidingScopes/3d-model-playground) | **无 LICENSE 文件** → 默认保留所有权利 | 手掌作为操控器的手感与吸附反馈 | 否，禁止复制 |
| [armin-panahi/Molecular-Planet](https://github.com/armin-panahi/Molecular-Planet) | MIT | 「星球 + 轨道分子」的视觉构成、双层 LOD 思路 | 否；MIT 允许改写，本轮仍选择自写 |
| [pmndrs/react-three-rapier](https://github.com/pmndrs/react-three-rapier) | MIT（见 [LICENSE](https://github.com/pmndrs/react-three-rapier/blob/main/LICENSE)） | 以手掌为可控碰撞体、冲量与速度上限的接口形状 | **尚未安装**；引入前需连带核对物理引擎本体 |
| [dimforge/rapier.js](https://github.com/dimforge/rapier.js) | Apache-2.0 | 弹力球池与积木叠塔的求解器 | 尚未安装 |
| [mrdoob/three.js](https://github.com/mrdoob/three.js/)（webgpu_gaits / misc_gpu_path 等群集示例） | MIT | GPGPU 位置纹理驱动萤火虫群的数据布局 | 否，参照思路自写 |
| [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw) | MIT | 点阵画布的平移缩放、选择与图形工具的行为模型 | 否；不复制其品牌、图标与素材 |
| [i18next / react-i18next](https://github.com/i18next/react-i18next) | MIT；peer 支持 React ≥16.8 与 TS 5/6/7 | 命名空间与内插语法 | 否，改用 `src/i18n/` 的极小本地实现（约 40% 文案在非 React 模块，i18next 的钩子模型覆盖不到） |
| [react-speech-recognition](https://github.com/WoollyWoollyWoolly/react-speech-recognition) | MIT | 会话/听写/终态的分层与去重思路 | 否，沿用自有 `SpeechProvider` |

Remotion：**不接入**（第八/九阶段结论，2026-10-06 复核）—— 它把渲染推进构建与 Source Map 管线，与本项目「Vite 构建时零引擎实例」的约定冲突；预览改为无依赖的逐帧驱动脚本。

## 新增玩具的前置条件

1. 先确认老五个玩具在浏览器套件里保持可进入、可互动、可退出、可重进（`playlab-e2e` 与 `toy-operable` 探针为凭）。
2. 任何新玩法只经统一 HandInputAdapter 读现有识别结果，不自己开摄像头、不自己新建 Hand Landmarker、不新建 `<Canvas>`。
3. 若引入 `react-three-rapier` / `rapier.js`：核对 WASM 体积与加载来源、离线可用性、Apache-2.0 的 NOTICE 归属，并把包加入本表与 `docs/licenses/`。
4. 无许可证仓库（上表前两行）不得成为任何一行代码的来源；如需其效果，自己实现并在注释里写明是独立实现。
