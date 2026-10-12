# 第十阶段交接：先修无法使用的功能

日期：2026-10-06/07。基于既有架构渐进修改：DrawEngine、StrokeStore、工程系统、三模式、PlayLab、教程、Gallery、Help、主题、保存与导出、语音链路全部沿用，未推倒重写，未新增第二个 Canvas、第二个识别 Worker 或第二套设置存储。项目不是 Git 仓库，因此每条结论都附了可复跑的证据文件。

## 顺序与结论

用户要求的顺序是本阶段的硬约束：**先修复无法使用的功能 → 再完善交互 → 最后扩展玩具**。本轮完成前三块（玩具可操作、设置真生效、输入排他、语音稳定），新玩具与点阵画布尚未开始。

## A. 小玩具进入后无法操作

现象：玩具能进、能看到画面，但捏合没有反应；同一个手势在菜单上是有效的。

三条根因，前两条是真的「无法操作」：

1. **玩具 ACTIVE 时菜单仍是活动手势区**。探针 `node_modules/airdraw-probe/probe3.json` 在 ACTIVE 的光球里读到 23 个活动区域，其中 `dock-color … dock-settings` 12 个（scope 就是 `playlab`，所以与玩具同域）、`surface-smooth/wood/metal/stone` 4 个（`SurfaceDock.tsx:5` 注册时**没有 scope**，按 `GestureInteractionManager.ts` 的规则等价于全局），加顶部三个开关。`GestureArbitration` 的 rank 里 `pinch=2 < toy=4`，所以玩具声明的 `'toy'` 根本不阻止 UI 起按 —— 一次捏合被菜单消费，玩具只是不知道自己丢了。
   修法：`GestureInteractionManager.ts:158/297` 增加屏幕归属（`setScreenOwner('ui'|'toy')`），玩具播放期间**只有 `scope:'toy'` 的区域**能收输入；`App.tsx:196` 由 PlayLab 相位驱动该归属，退出/卸载时复位。绘制类 Dock 一律不进 PlayLab（`App.tsx:637` `drawingChrome`），`lab-leave`/`surface-*` 补上真实 scope。
2. **首次进入自动开始三拍校准**。`App.tsx:589` 在 `calibrating` 时对除 CANCEL/SET_THEME 外的每条命令抛错，而旧代码在追踪就绪后直接 `setCalibrating(true)` —— 张掌呼不出 Dock、捏合点不动任何控件。探针 `dockcheck4.mjs` 的实况：`gesture=OPEN_PALM`、`gesture.durationMs=2085`（阈值 700）而 `dockOpen=false`，页面上只有一句「请先完成校准，或说取消」。
   修法：删除自动开始，保留 `CalibrationOffer` 邀请 + 设置里的「重新校准」。教程/画布在未校准时用默认档继续可写（`stage5-tutorial-e2e.mjs` 新增断言 `first run opens the tutorial without auto-starting calibration`）。
3. **开场粒子层不会自己收场**：`begin` 之后 `launchStage` 停在 `dispersing`，而推进它的定时器在被卸载的 `LaunchScreen` 里。归属移到 App（`App.tsx:208`），散场计时结束后才 `home-ready`。

验证（`node_modules/airdraw-probe/toy-operable.json`，全部在 `?simulate=1` + 合成手）：ACTIVE 时光球内活动区域 = 1（`lab-back`），中心/左 Dock/右弹层/右上角四个采样点全部 `false`；捏合抓取 `grabbed:'primary'`、`charge` 0→0.726 且片元 uniform 同值、松手 `speed 4.97` 抛掷；五个玩具 `status:'ready'`、`error:null`、几何 4/3/3/3/2；注入失败态后 `status:'failed'` 带真实原因、`重试` 按钮可见并恢复到可互动；手势点返回 `clickResult:'ok'` → `phase:'HUB'`、归属回到 `'ui'`；`pageErrors`/`consoleErrors` 均空。

一处旧结论被证据推翻：探针早期报的「光球抓取半径小于掌长」不是缺陷，而是夹具把手心当捏合点用。真正条件是**捏合点要落在光球附近**（`energyOrb.ts` 的 `RADIUS * size * 1.7`），距离 0.011 屏宽即命中。`canvases: 6` 也不是泄漏：主 Canvas 1 张 + 玩具卡片 5 张 2D 预览。

## B. 系统设置无法调节参数

根因：`SettingSlider` 渲染的是纯 `div`，唯一写值通道是手势 `onDrag`；**没有 `<input>`、没有 `role`/`tabindex`/`aria-*`、没有 pointer/click 处理器**。探针实测「拖拽+点击轨道后 1 → 1」与 `{tag:"DIV",role:null,tabindex:null,native:0}`。`SettingButton` 有 `onClick`，所以按钮类项目一直可用 —— 这就是「有的能调、有的调不动」的来源。

同时存在的一批结构性缺陷（逐条已由 `settings-audit*.json` 定位）：范围写死在滑块里、clamp 写死在 `sanitize` 白名单里、默认值写死在 `DEFAULT_PREFERENCES` 里，三处各说各话；`inRange` 只认 `typeof number`，`"1.5"` 被静默重置为 1；`resetPreferences` 定义了但**全项目 0 调用点**（没有恢复默认的入口）；`airdraw-theme` 与 `preferences.theme` 双写（`themeController.ts` 构造只读前者，App 再用后者覆盖）；打开作品会把作品主题写回用户全局偏好；`playlab/quality.ts` 的 governor 是死代码（`locked` 从未被赋值、`fromTier`/`sample` 0 调用点，粒子数只在 `initialize` 按冻结的 `ctx.quality` 分配一次）；`uiLanguage` 不在 `Preferences` 里所以被 sanitize 丢弃。

修法：

- **`src/app/settingsSchema.ts`（新增）**：每个可调项的 min/max/step/default/格式化只写一次，`coerceSetting` 供 `sanitize` 与界面共用，`SETTING_DEFAULTS` 同时是首屏默认值与「恢复默认」的内容。数字串按数字读，越界钳制，未知枚举回落默认。
- **`SettingsScreen.tsx`**：滑块改为「可视轨道 + 覆盖其上的原生 `input[type=range]`（透明）」。鼠标、触屏、方向键、读屏都由浏览器负责，手势 `onDrag` 仍然量同一个盒子；`aria-valuetext` 带单位与默认值（例：`0.90（默认 1.00）`），`:focus-within` 有可见焦点环，松手在控件本身闪一次确认（不叠 Toast）。新增 平滑程度、玩具互动强度、玩具细节与粒子数量、语音音量、界面语言、恢复全部默认六行；范围/默认值全部取自 schema。
- **接线**：`pointerSmoothing → oneEuro.setMinCutoff`（`DrawEngine.ts:321`，只动静止下限，不动增益）；`toyIntensity → LabGestures + PalmSwipeDetector` 的同一 gain（`labGestures.ts:60`、`PalmSwipeDetector.ts:102`，中间档恰为 1.0，出厂手感不变；置信帧数/开合度这类**可靠性闸门不受该设置影响**）；`toyDetail → quality.locked` + `runtime.setDetail()` 重建在场玩具（`runtime.ts:228`），`contextFor` 每次读实时 quality 而不是 attach 时的快照；`LabStage.tsx` 每秒喂 `quality.sample(fps)`，App 喂 `quality.fromTier(tier)`，governor 由死代码变成真的在降档；`voiceVolume → VoiceAssistantService.configure`（不重启识别）。
- **存储单源**：`themeController` 构造改读 preferences，不再写 `airdraw-theme`；打开作品只影响工作区，不再改写用户主题偏好；「恢复全部默认」一次复位 preferences + 识别调参键 + 个人校准键，并把默认值重新应用到引擎、手部选择器、玩具与语音。

验证（`node_modules/airdraw-probe/settings-verify.json`，39 条断言）：每个滑块都跑「①鼠标 ①键盘 ①捏合拖拽 ②数值更新 ③服务已应用」，六项数值全部 PASS，其中 ③ 是按服务真实字段比对（`indexFilter.x.gain`、`minCutoff` 按 `2.6·(0.7/2.6)^s` 换算、`pinchDetector.assist`、`gestures.gain`、`voiceAssistant.volume`）；④效果用同一条阶跃过同一个滤波器对比（`0.5358` vs `0.8684`）；主题/界面语言/玩具细节走完整点击链路；`⑤刷新后存储仍在` 与 `⑤刷新后服务自动应用` 在重进界面后复检；恢复默认后 20 个键回位、`airdraw-theme` 为 null；运行时异常 0。

## C. 手势与菜单互相干扰

除 A-1 的归属闸门外，本轮还固定了：翻页只在 `HUB` 相位合法（`runtime.ts` 的 `railOpen` 闸门，Active 时挥手不换页）；`lab-leave`/`surface-*` 不再是无 scope 的全局区域；`GestureButton` 的 `data-active`/`aria-pressed` 补齐，鼠标点玩具内「返回」不再因为区域被抑制而失效（`PlayLab.module.css` 的 `.chromeFoot` 保留 `pointer-events:auto`）。

浏览器侧回归：`stage6-e2e` 14/14、`stage5-e2e` 13/13（单独复跑）、`creation-e2e` 20/20、`tutorial-e2e` 22/22、`playlab-e2e` 30/31（唯一红项是标注 `KNOWN GAP` 的右滑返回，未删断言、未放宽阈值）。Node 侧 `verify:core` 109、`verify:contact` 18/18、`verify:stage5` 987/987、`verify:stage6` 143/143、`verify:playlab` 43/43、`verify:phase8` 750 全绿。

## D. 语音助手响应不稳定

根因与修法：

- 唤醒兜底把旧短语硬编在 `VoiceCommandRouter`（`['你好airdraw','airdraw听我说','airdraw']`），换短语后旧词依旧唤醒。现在**只有仍使用出厂问候语时**才接受它的几种误听写法，自定义短语必须被真的说出来。
- 一条 final 被识别器重复投递会执行两次。新增按会话的去重（同文本 1.5 秒窗口），过了窗口再说是有效重复。
- 自己说的话会被自己听见：播报后 1.4 秒静音窗内忽略任何来词。
- 命令面补齐并给每条一个稳定内部 id：`打开设置`、`选择颜色`/`打开颜色面板`、`切换语言`、`打开平面画板/三维/模型`、`打开玩具`、五个玩具名、`返回`、`下一页/上一页`、`粗一点/细一点`、9 个颜色词（`选择红色` 生效，`背景颜色` 明确不生效）、中英各一组同义词；`清空画布` 保持**只能整句说出**并要求二次确认。
- 播报文案改为按识别语言取，音量可调；`configure` 仅在识别语言变化时重启会话，改短语/反馈/音量不重启。
- 设置里新增「你可以说什么」清单，随界面语言切换。

验证（`voice-verify.json`，21 条，用替身识别 Provider 驱动）：唤醒+分句/同句下命令各一次执行、重复 final 只执行一次、隔 1.7 秒再说仍然执行、清空先进入 CONFIRMING 且取消不删任何东西、`打开设置/选择颜色/打开玩具/返回/切换语言` 逐条改变界面状态、非语言变更 0 次重启而语言变更恰好 1 次、`SpeechSynthesisUtterance.volume` 实测等于设置值、换短语后旧词 0 次而新词 1 次、清单双语正确、拒绝麦克风后给出「麦克风授权被拒绝，手势仍可使用」。Node 侧另加 16 条纯函数断言（命令可达性、前缀「请/帮我」、颜色与背景、危险命令不做模糊匹配、唤醒短语退役、schema 钳制与量化、玩具强度中档恒等于 1）。

**待验证（不得当作实机通过）**：真实麦克风下的识别率、噪声与口音、连续命令、浏览器语音服务的联网处理边界；真人摄像头的手感矩阵与 60fps。本轮所有绿灯来自 `?simulate=1` + 合成手 + headless SwiftShader。

## E. 本轮暴露的测试基建事实

浏览器套件对机器负载敏感：同一构建在背靠背连跑时会出现 4 条假红（`project model contact grabs`、`suggestion confirmation…`、`Make 3D…`、`pinch+move rotates…`），单独复跑（前一次 sleep 5、彼此 sleep 3）全部通过。判定回归之前必须先单独复跑。另有两个夹具坑：`lastActivatedId` 是粘性的，红字里出现的 `mode-*` 往往只是上一次激活残留；`page.addInitScript` 每次导航都会重跑，做「刷新后持久化」检查时必须写成「仅当键不存在才播种」。

## 下一步（未开始）

- P10-E 全站中英文（界面外壳已在转换，长文指南与教程正文是独立一轮）。
- P10-F 点阵画布、形状/文本/便签与颜色作用域分离。
- P10-G 新手控玩具（几何实验室、分子星球、弹力球池/积木、萤火虫群）走统一 HandInputAdapter。
- 30 分钟真机/合成混合长跑与最终验收表。

## 本轮新增的可复跑测试

三条原本只存在于 `node_modules/airdraw-probe/` 的探针已升为正式套件并登记进 `package.json`，结果写入 `docs/verification/`：

| 命令 | 报告 | 覆盖 |
| --- | --- | --- |
| `npm run e2e:toys` | `phase10-toys.json` | 大厅无菜单抢点、玩具内活动区域只剩 `lab-back`、玩具区无隐形命中层、捏合抓取与充电、松手抛掷、五态可达与真实原因、五个玩具逐个挂载响应、失败态+重试恢复、手势返回、退出后资源与归属复位、零异常 |
| `npm run e2e:settings` | `phase10-settings.json` | 六个数值项 × ①鼠标/①键盘/①捏合/②数值/③服务字段，平滑与捏合的④可测效果差，主题与界面语言与玩具细节的完整点击链路，刷新后存储与服务复检，恢复全部默认，主题不再双写，输入排他复检 |
| `npm run e2e:voice` | `phase10-voice.json` | 用替身识别 Provider 驱动：唤醒+分句/同句命令、重复 final 去重、隔窗再说有效、清空二次确认与取消、新命令真的改界面、切换语言只换文案、非语言不重启会话/语言变更恰好重启一次、音量落到 `SpeechSynthesisUtterance`、换短语后旧词失效、双语清单、拒绝麦克风的说明与退路 |

另有 `src/rendering/canvas2d/viewport.ts`（新增，纯数学，尚未接线）：屏幕↔纸张双向往返、以指针为锚的缩放、平移以纸张单位计、缩放档位上下限、点阵疏密随缩放步进（放大减半/缩小加倍）、不可见网格零开销、病态间距直接放弃绘制。以上 25 条断言已在 `verify:core` 里跑通（该套件现 131 条）。接线的平移缩放与网格绘制将只在浏览器套件确认二维落笔与导出都不退化之后才进。

# 附录：第十一阶段开工前的输入可靠性修补（2026-10-07）

第十一阶段要求「优先修复阻断操作的问题」。开工前先用它的 stress 套件量到并修掉三件事。

## 1. 丢手判定对帧间隔过于敏感（真会断笔）

实测（`node_modules/airdraw-probe/holddrop.mjs`，`?simulate=1` 合成手，只制造一次投喂中断）：检测标称 20–30fps（帧距 33–50ms），而 `TRACKING_LOST_GRACE_MS` 原为 **180ms**，于是

- 仅 200ms 的间隔就提示「请让主手进入画面」；
- 落笔中途一次 500ms 停顿把笔抬起（`penDown true → false`），一条线被拆成两段。

识别单帧在途、慢一帧就能造成这个间隔，所以它不是夹具现象。改为 **320ms**（约 7 帧 @20fps，够覆盖两次慢推理，同时真实离开仍在 1/3 秒内判定），并把 `DrawEngine.ts:589/845/846` 三处散落的 `180` 字面量统一走该常量。复测：100/200/300ms 不再断笔、不再误报丢手；450/600/800/1200ms 仍如实判定丢手，且缺失期间不生成新点（不预测轨迹，回来作为新段继续，撤销仍一次去掉整个手势）。

## 2. stress 套件自己吞掉了失败信号

`scripts/e2e.mjs` 有 15 处未捕获的 `waitForSelector/waitForFunction`：任一前置条件没满足就抛异常，后面约 40 条检查根本不跑（当天两次分别在第 17、第 13 条终止——报出来的红少得离谱，但完全没意义）。已改为非抛出等待 + `page.setDefaultTimeout(6000)`（卡住的定位只失败它自己那条）。共享驱动 `gestureDriver.click()` 另外改成起手前等过 **350ms 防双击闸门**：那是产品有意的保护，夹具不该去抢（抢不到就报 `no-activate`，正是先前若干条红的形状）。改完同一条套件从「17 条后崩」变成完整报出 56 条。

## 3. 默认界面语言把已翻译部分翻成英文（雪崩）

子代理把 19 个界面组件 `t()` 化后，`e2e` 由 56/56 掉到 46/56、10 条红。逐条 diff 备份（`node_modules/airdraw-probe/i18n-backup/`）后确认唯一变化的**标识类**字符串是中文 `aria-label`：套件用 `[aria-label="章节"]` 定位说明书章节导航，而 headless Chrome 的 `navigator.language` 是 `en-US`，`uiLanguage:'system'` 于是把已翻译组件解析成英文 → 章节找不到 → 说明书关不掉 → 设置面板打不开 → 磁吸/滚动/主手 4–5 条连带红。两处修法都是规则性的：

- `settingsSchema.ts` 里 `uiLanguage.default` 由 `system` 改为 **`zh`**：全站翻译完成前不让一半界面提前翻，用户仍可显式选「跟随系统」。
- 元素定位一律改用 `data-testid`（新增 `guide-chapter-nav`）；套件与产品都不得用翻译后的文字判断功能。

自己的失误也记一条：新加的「平滑程度」默认档把 One-Euro 静止下限映射成 ≈1.35Hz，出厂值是 1.5Hz —— 默认值悄悄改了笔的手感。已改为 `1.5 · 2^(0.5−s)` 并加断言「中点 == `POINTER_FILTER.minCutoff`」。

修补后当轮复跑：`verify:core` 126、`contact` 18/18、`stage5` 987/987、`stage6` 143/143、`playlab` 55/55、`phase8` 750、`build`/`typecheck` 全绿；`e2e:settings` 在驱动改动开/关两种状态下均为 38/38（证明它不是驱动改动的函数）；`e2e` 语言与选择器修正后的完整复跑结果记在下一份日志。

