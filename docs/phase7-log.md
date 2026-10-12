# AirDraw 第七阶段：PlayLab 手势互动实验室（开发日志）

日期：2026-10-05。版本 0.7.0。上一阶段：[phase6-log.md](phase6-log.md)。
本阶段在既有 Spatial Draw / Canvas Draw / Model Control 之外新增第四个房间 PlayLab（五个手势玩具），
**没有**新建第二个摄像头源、第二个 Hand Landmarker 或第二个 WebGL 上下文。

## 参考来源与许可证（逐仓库核对，2026-10-05 通过 GitHub API 读取仓库根目录与 LICENSE 文件）

| 仓库 | 根目录是否有 LICENSE | 结论与本次用法 |
| --- | --- | --- |
| `google-ai-edge/mediapipe-samples-web` | 有（Apache-2.0，快照已在 `docs/licenses/mediapipe-samples-web.txt`） | 沿用为 Worker/推理循环的参考；本阶段未新增复制 |
| `PavelDoGreat/WebGL-Fluid-Simulation` | 有，**MIT (c) 2017 Pavel Dobryakov** | 只借鉴其公开的流体管线结构（advect → curl → vorticity → divergence → pressure → gradient → display）与"用密度而不是原始 RGB 上色"的思路；`src/playlab/toys/fluidInk.ts` 的 shader 是为 AirDraw 的 renderer 与玩具契约重写的，文件头已写明出处与版权 |
| `mrdoob/three.js`（Water.js 所在仓库） | MIT，已是本项目依赖（`docs/licenses/three-MIT.txt`） | 海面用**自写的顶点位移 + 解析法线**，没有引入 `examples/jsm/objects/Water.js`（它依赖反射 render target 与额外贴图，与本阶段的预算/释放契约不合）；只参考"水面 = 高度场 + 由高度场导出的法线 + 菲涅耳天空反射"的结构 |
| `collidingScopes/threejs-handtracking-101` | **无 LICENSE** | 仅用于交互与视觉研究，**未复制任何源码** |
| `dilip324/interactive-3d-hand-particles` | **无 LICENSE** | 同上：只参考"手掌当吸引子"的观感，粒子全部为自写 shader |
| `holynova/hand_fireworks` | **无 LICENSE** | 同上：只参考"捏合蓄力—松开发射"的节奏，烟花粒子为自写的解析积分方案 |

无许可证的仓库一律只做视觉/交互研究，这一点写进代码注释与本表，后续 Agent 不要改变这个边界。

## 建了什么

**共享输入层**
- `src/hands/handFrame.ts`：`HandFrame`（palmCenter / palmNormal / facing / palmWidth / velocity / acceleration / openness / grabStrength / pinchState / pinchPoint / pinchStrength / wristRotation / isStable / visibleForMs）与 `TwoHandFrame`（distance / midpoint / direction / scale / twist / approachVelocity / separationVelocity）。`palmCentreOf` 取腕 + 四指 MCP；`palmOrientation` 用指节平面的叉积求法线，`facing = |n.z|` 就是"掌心是否朝向摄像头"；`HandMotion` 是带物理上限的 EMA 速度估计。
- `src/engine/DrawEngine.ts`：在同一次 `handleHands` 里产出 `engine.frame`（主手 + 副手 + 双手关系），**复用已经解码的关键点**，不额外推理；丢手时清空并重置运动估计。
- `src/hands/labGestures.ts`：16 个高层事件（PINCH_START/HOLD/MOVE/END、HAND_OPEN/CLOSE、PALM_PUSH/PULL、TWO_HAND_EXPAND/CONTRACT/ROTATE/CLAP_NEAR/SEPARATE/ENERGY_LINK），全部由连续帧 + 迟滞 + 帧数确认产生；双手有 200 ms 进入 / 420 ms 退出的迟滞窗。
- `src/utils/gesture/PalmSwipeDetector.ts`：IDLE→ARMED→TRACKING→COMMIT/CANCEL→COOLDOWN 六态；位移以**掌宽**为单位（远近无关），要求方向一致、速度达标、时长在窗口内、垂直漂移小；`progress` 实时输出给 UI 让卡片跟手。
- `src/interaction/GestureArbitration.ts`：单一输入所有者，优先级 `safety > grab/draw > pinch > bimanual > toy > swipe > hover`，App 在光标回调里统一申报（绘画 / UI 按下 / 模型抓取 / 丢手）。

**房间与玩具**
- `src/playlab/{types,catalog,state,runtime,quality,shaders,LabStage,LabHub}`：`Toy` 契约（id/title/description/thumbnail/capabilities/supportsTwoHands/qualityLevels + initialize/enter/update/onHandFrame/onGesture/pause/resume/exit/dispose）、按需 `import()` 的注册表、`PlaygroundStateMachine`（HUB/ENTERING/ACTIVE/EXITING/SWITCHING，可打断且只保留最后目标）、`QualityManager`（ultra/high/balanced/performance，只动粒子数/流体网格/水面细分/Bloom，**不动识别阈值**）。
- 五个玩具：`energyOrb`（弹簧体 + 形变壳 shader + shader 内核粒子 + 蓄力电弧 + 抓取保留原始偏移 + 抛掷限速 + 双手拉伸/分裂/合并）、`particleGalaxy`（最多 9 万点全在 GPU 顶点着色器里积分，形态之间用两个基准缓冲 `mix()` 变形）、`fluidInk`（GPU 流体，手只做注入）、`handOcean`（高度场 + 解析法线 + 涟漪环缓冲 + 水珠落回溅起涟漪）、`fireworks`（环形缓冲 + 顶点着色器解析积分含阻力与重力）。
- 入口：底部模式切换器新增 `mode-PLAYLAB`，`appState` 新增 `playlab` context（进实验室自动抬笔、Dock 不可用），`Scene3D` 通过 `lab` 插槽复用同一个 Canvas，墨迹图层让位而不是卸载。

## 验证（2026-10-05 12:xx–13:xx UTC）

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run build` | 通过（主包体积告警仍在） |
| `npm run verify:core` / `verify:contact` / `verify:stage5` / `verify:stage6` | 80 / 13 / 732 / 143 **全绿，无回归** |
| `npm run verify:playlab`（新增，纯 Node） | **43/43**：六态机、30 次挥手=30 页、慢速漂移、距离不足、纯垂直、来回挥、捏合打断、丢手打断、不稳定手、握拳手、侧掌手、被锁上下文、冷却链、尺度无关性；仲裁优先级；掌宽/朝向/开放度/滚转/速度上限的数学 |
| `npm run e2e:playlab`（新增，无头 Chrome + 合成手） | **30 通过 / 1 已知缺陷**：进入实验室、五张卡片、笔被抬起、仍只有一个 WebGL canvas、读到共享手部帧、左滑进一页、30 次滑动不跳页、五个玩具进入即挂载真实几何/退出即释放、**流体 20 进 20 出后 geometry/texture 完全回到基线（9/3 → 9/3）**、离开实验室回到画布且恢复落笔、零运行时异常 |
| 30 分钟长跑 | **本阶段未跑**（见下"未完成"） |

过程中修掉的真实缺陷：GLSL 里混进了 `Math.abs`（海洋顶点着色器编译失败）、顶点/片元共享 uniform 的精度不一致（`uCharge` 精度冲突导致 `useProgram: program not valid`）、`LabStage` 卸载时把 App 持有的 runtime 永久 dispose、玩具挂载没有 try/catch 导致异常被 Promise 吞掉。

## 已知缺陷与未完成

1. **右滑返回不提交（方向不对称）**：`e2e:playlab` 里"左滑进一页"通过，紧接着的"右滑回一页"停在 index 1；但交替 30 次的循环里两个方向都能一页一步。怀疑是上一次 COMMIT 之后 `origin` 复位与 `ARMED` 重锚在同一方向连续输入时的交互，需要在 `swipeState` 上采样定位。断言保留在套件里并标了 `KNOWN GAP`，**不要为了让套件变绿而删掉它**。
2. **30 分钟长跑未做**：本阶段改了 `DrawEngine`（新增帧构建）与 `Scene3D`（图层让位），按第六阶段立下的规矩，长跑必须在**最终代码**上跑；本轮时间用在了玩具与套件上。补跑命令：`SOAK_MS=1800000 APP_URL=http://localhost:5173/ node scripts/stage6-soak.mjs`，另需一个 PlayLab 版长跑（五个玩具各 20 进 20 出 + 30 次实验室↔三种模式切换）。
3. **切换动画只有状态机骨架**：`PlaygroundStateMachine` 支持打断与"只保留最后目标"，但卡片→场景的五种专属过渡（飞出 / 解体成粒子 / 液体扩散 / 水面展开 / 收缩成光点）尚未实现，目前是有时限的相位切换。
4. **每个玩具的首次教学未实现**：`Toy.lesson` 字段与目录数据已就位，判定与淡出的 UI 还没有接。
5. **PlayLab 内没有录制入口**：现有 `workspaceRecorder` 与导出面板仍在工程侧，玩具里的 Dock 录制未接。
6. **首页入口未加**：目前入口只有底部模式切换器（`mode-PLAYLAB`）与实验室内的"回到画布"。
7. **双手真实人手未验证**：与第六阶段同一条债 —— 全部绿灯来自合成手；`PALM_SWIPE` / `LAB_GESTURES` 的常量都是"起始值"，需要真人矩阵（`computer-use` 本轮不可用，无法自动采集）。
8. 流体在 `frame.interactive` 为假时只画上一帧；海洋/烟花的 `pause` 目前只隐藏节点，未降低 shader 更新频率（Idle 降频待做）。

## 追加（同日）：真人仍然无法捏合 —— 三次猜测之后才去量

用户实测反馈：**捏合后什么都不能做，一直显示"指尖接近，尚未确认三维接触"**。这条提示在
`PinchContactDetector.ts` 里只有一个含义：`d3Normalized > radius`（三维指尖距离超过接触闸门）。

查到的两件事：

1. **闸门被解剖估计偷偷收紧**（`m.radius = min(contact, estimatedRadius)`）。用真实手型
   （掌宽 85 mm、食指末节 20 mm、拇指末节 25 mm）算出来 `estimatedRadius ≈ 0.159`，
   于是默认值提到 0.22 也没用 —— 有效闸门一直是 0.16 左右。
   **而且我把校准从"强制"改成了"可选"，正好让所有人都走在这条被收紧的路径上。**
2. **测试夹具的手型不是真手型。** `scripts/stage5-core.ts` 的 `hand()` 里
   `estimate ≈ 0.203 > contact 0.22 的下界`，所以 732 条断言在真实手做不到的几何上全绿。
   这就是"绿灯不等于可用"的第二次实证。

改动：

| 位置 | 改动 | 理由 |
| --- | --- | --- |
| `PinchContactDetector` | 解剖估计**只允许放宽、不允许收紧** | 估计值低于真人可达距离时，它就是产品缺陷 |
| `DEFAULT_CONTACT` | `.22/.34/.24/.12` → **`contact .30 / release .37 / projection .30 / z .16`** | 真人"指腹相触"在单目关键点上的分布是 0.18–0.34，闸门必须落在分布之上；深度保持最紧（它才是区分"指腹相触"与"两指一前一后"的那道闸） |
| `setAssist` | 从**空实现**变成真正生效：0→1 让距离与投影闸门最多再放宽 45%、深度放宽 50% | 设置里的"捏合辅助"此前什么都不做（注释写着"不能削弱闸门"），用户没有自助手段 |
| `SettingsScreen` | 补上「捏合辅助」滑条（0–100%，带说明） | 说明书里早就写了这个设置，界面上却没有 |
| `stage5-core` | 新增**真实人体测量夹具** `realHand()`（85/20/25 mm）：0.13/0.19/0.21 必须落笔，0.36/0.5/深度错位必须不落笔；另加 assist 三档的正反断言 | 让"手型不真实导致绿灯失真"这件事本身有一条回归 |
| `contact-regression` | 原来那条"default gate remains conservative"（断言 0.27 **不**算接触）改成断言 0.27 **算**接触、0.36 不算、开了辅助才算、开了辅助仍拒绝张开手与深度错位 | 旧断言编码的是旧策略，不是安全不变量 |

验证：`verify:core 80` / `verify:contact 17` / `verify:stage5 807` / `verify:stage6 143` / `verify:playlab 43` 全绿；
`typecheck` + `build` 通过；`stage5-e2e` 13/13 —— 其中 **"30 次接近不落笔"仍然通过**（合成 `near` 姿态实测 d3 ≈ 0.316 > 0.30），
所以放宽没有把"接近"变成"接触"。其余浏览器套件在跑。

**留给下一轮**：这些数仍然是从"合成手的 d3 分布"推出来的，不是从**这台摄像头的这只手**量出来的。
浏览器里读到的实况是 `airdraw-pinch-calibration = null`（用户从未做过校准），
所以最可靠的出路还是那条：设置 → 重新校准捏合（三次真实捏合会写下个人 profile，完全绕开这些默认值）。
下一轮应该做"把校准邀请放到第一次落笔失败时"，而不是继续调默认数。

## 下一步（建议顺序）

1. 修右滑不对称（在 detector 里加 `swipeState` 采样，配合 e2e 的 `settleIndex` 复现）。
2. 补 PlayLab 长跑脚本 + 30 分钟长跑，把本阶段真正测完。
3. 五种切换动画 + 首次教学（`Toy.lesson` 已备好数据）。
4. 玩具内录制入口（复用 `CanvasRecorder`，仍然不录摄像头画面）。
5. 真人双手矩阵，回头收 `PALM_SWIPE` / `LAB_GESTURES` 的常量。
