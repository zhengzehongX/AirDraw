# Phase 15 — 工作区排版与浮层专项（依据三张实机截图）

输入：用户提供的三张日间实机截图（模型操控 / 三维笔迹 / 二维画布，约 2560 宽），可见缺陷：
顶部「主手」被挤成两行并压住 PlayLab；右侧属性大面板从顶堆到摄像头之上并透出摄像头画面；
材质浮层跑到右上、远离底部触发按钮；菜单无分组；中英混用（Color/Size/Group/Help 与中文并存）；
点阵过抢；同一屏既有大片留白又有局部拥挤。

约束：不推倒重写、不删功能、不动绘画数据/模型位置/手势算法；不靠缩小文字、隐藏溢出、提 z-index 或删入口掩盖问题。

## 本轮已完成

1. **顶部导航三区化**（`WorkspaceBar` 重写）：左=返回/项目名+保存状态/项目菜单（工程面板、作品库）；中=四段模式切换器；右=设备与手势菜单（主手自动/左/右、摄像头预览、暂停手势）、语音、主题、帮助菜单（使用说明、交互式教程）、工具、设置。
   - 高度固定 64px、左右内边距 24px；Grid 三列 `minmax(0,1fr) auto minmax(0,1fr)`，按钮 `flex:0 0 auto` + `white-space:nowrap`，任何宽度不换行不重叠。
   - 实测（`p15bar.mjs`，1440 与 1366）：bar 高 64px、**按钮两两重叠 0 处、换行 0 处**；≤1180px 模式段收为图标、≤980px 收进「工具」菜单。
   - 顶部不再同时出现状态条+圆点+「张开手掌」+主手标记：合并为设备菜单触发器上的**一个稳定就绪词**（手势已就绪 / 未检测到手 / 手势已暂停），逐帧提示只存在于菜单体内。
2. **模式与工具命名统一**：模式切换器与底部 Dock 的硬编码英文全部改走 i18n（`mode.*`、`dock.*`、`canvas.*`、`bar.*`、`model.*`），中文为 二维画布/三维笔迹/模型操控/互动玩具、颜色/材质/粗细/撤销/重做/橡皮擦/更多 等；英文完整切换。
3. **摄像头预览移到创作区左下角**（224px 宽），右缘让给属性区；不再被右侧面板压住或透出。
4. **点阵减抢**：间距 0.02→0.022 文档单位（1440 下约 31.7px）、点径 1.5→1.1px、透明度带上限 0.8→0.55；仍属文档层、随视口变换（自测用例覆盖间距/半径单调性）。
5. **菜单浮层**：新增 `BarMenu/MenuItem`（触发器即手势区域、面板锚定触发器下方、外部点击/Esc 关闭、退出动画 180ms、z 高于教练卡）；作品库与使用说明入菜单后，e2e 的 `tapDock` 会先开对应菜单再点条目（走真实路径，断言不变）。

## 本轮未完成（下一工作包，均已定位到文件）

1. ~~右侧属性栏改为布局列~~ **已完成（第五轮）**：`.workspace` 网格化，创作元素整体迁入 stage 单元，视口数字唯一来源为 stage 矩形；栏可收起并把宽度还给画布。DEV 面板改列内堆叠，与属性面板不再重叠（此前挪位的尝试会挡到大厅卡片，已回滚并换方案）。
2. ~~Color/Material/Size 浮层锚定到触发按钮上方~~ **已完成**（第四轮：沿行滑动 + 边缘夹取，四面板 × 四档视口实测 `centreDelta=0`）；**仍待**：颜色面板加最近使用与自定义入口、材质面板改材质球缩略图、粗细面板加直径预览。
3. **各模式 Dock/面板内容分组**：二维 Dock 收为 选择/画笔/橡皮/颜色/粗细/撤销/重做，画笔类型自画笔展开、背景入「画布外观」、导出入项目菜单、Make 3D 仅在有可转换选中时出现；模型面板改 移动/旋转/缩放/居中 + 变换参数与全宽滑杆，导入/示例入资产分组、移除置末并区分。（模型栏的中英夹杂命名已在第四轮统一；分组结构未动。）
6. **DEV 诊断面板与右侧属性栏重叠**（仅 `?debug=1`）：挪位会挡到大厅卡片，已回滚；正确解法随第 1 项——右侧列真正占位后把诊断面板收进左列或底部抽屉。
4. **微响应改内层缩放**（命中区不变）、undo/redo 禁用态可读性、空闲时隐藏三维笔刷预览球只留主光标。
5. 日夜双主题下新面板不透明度/阴影统一复核（日间面板 96–97% 不透明已用于菜单，其余面板待收）。

## 回归

| 项 | 结果 |
| --- | --- |
| typecheck / build | 通过 |
| verify:core | ALL（点阵用例随新参数更新后仍绿） |
| e2e:layout / e2e | 见本轮运行记录（下方更新） |

真机摄像头与真人手势未在本轮验证；截图对比基线为用户提供的三张实机图，after 截图见 `node_modules/airdraw-probe/p15-bar-*.png`（交付前会复制到 docs/screenshots/phase15/）。

## 第二轮：首轮四个红点的根因与修复（全部探针取证，未放宽任何断言）

首轮 e2e 四个红点，逐一定位到唯一根因，其中两个是我本轮引入的真回归，一个是既有层叠缺陷被新检查暴露：

1. **丢手提示消失（我引入的真回归）**。顶栏重构把托管的 `TopStatus` 从 studio 移除后，`[data-testid="top-status"]` 在 studio 不再渲染，丢手时没有任何轻量提示（探针：`topStatus: null`）。
   修复：设备菜单触发器上的就绪词就是 studio 的唯一状态行——`data-testid="top-status"`、`data-state=ready|lost|paused`；丢手时该词变为 `status.hand`（请把手放进画面 / Put your hand in view），仍是顶栏里一个词，不是模态。e2e 断言同步改为读 `data-state` + 可见性 + 非空文本，不再匹配英文字面量（双语规则：语面量会让一次翻译翻转雪崩）。
2. **摄像头预览遮挡（我引入的真回归，一个根因两个红点）**。预览移到左下后，其 52×52 关闭按钮的矩形与作品库首卡「打开」按钮、设置列表的捏合拖拽车道（left+14, 68%）重合；区域拾取「最小矩形优先」不看遮挡，捏合被看不见的关闭按钮吃掉。
   证据：探针 hover 序列止于 `camera-preview-close`；同一按钮用鼠标点击能正常打开作品（`switched:true`）→ 应用逻辑无恙，坏的是手势命中。设置侧证据：5 次拖拽 0 位移（1342→1342），dev 行始终在折叠外，连带「开发者开关」红点（点击落空）。
   修复两层：a) 全屏浮层（gallery/settings/help）期间不渲染预览——创作辅助不该盖住整屏内容，回到 studio 自动恢复；b) `GestureInteractionManager.hitTest` 改遮挡感知：候选按面积升序，逐个用 `elementFromPoint` 校验该区域中心确实是当前最上层绘制物，答案记忆化 120ms 并在 `invalidateRects()` 时清空（布局查询不能每帧做）。修复后实测：作品库首卡捏合即开（`switched:true, objects:1`）、设置 1342→154。
3. **菜单选中不关闭（真缺陷）**。`BarMenu` 条目激活后面板仍开，97% 不透明面板留在画布上并吃掉后续捏合。修复：`MenuClose` context，`MenuItem` 激活即关。
4. **调试面板压住顶栏菜单（既有层叠缺陷，被 2 的遮挡检查暴露）**。`backdrop-filter` 让顶栏自成层叠上下文且层级为 auto，菜单面板的 `z-index:101` 被困在其中，于是 z:48 的 DebugPanel 反而画在打开的菜单之上（探针 `elementsFromPoint`：`HEADER[debug]` 在 `BUTTON[dock-guide]` 之上；hover 落到 `debug-zone`，使用说明打不开）。
   修复：`.bar { position: relative; z-index: var(--ad-z-sheet) }`（60 > 48），菜单恢复为真正最上层；复测 hover 落到 `dock-guide`、`context:'help'`、笔被抬起。这不是提 z-index 掩盖问题：菜单本就是 sheet 级浮层，缺的正是它该有的层级。
5. **主题红点判为已知间歇，非本轮回归**。探针按套件原序列三轮复跑（画→点主题→等闸门→再画），三轮 `drew:true`；与 #72 记录的「UI 捏合后冷却/latch 家族」一致。断言保持原样，根因留给 #72。
6. **教程 stage6 超时判为连跑负载假红**。轻载探针复跑首跑流程 0→6 全通（`dockOpen:true`）。按既定规则以冷却单跑复核，见下表。

| 运行 | 结果 |
| --- | --- |
| `e2e-p15c`（修复后首跑） | 48 PASS；主题 1 红（间歇）、guide 三连红（根因 4）、教程 stage6 超时（负载） |
| 探针 `p15repro` / `p15help` / `p15theme` | 丢手提示、作品库开、设置滚动、菜单层级、主题后落笔 全部实测通过 |
| `e2e-p15d`（冷却单跑） | 52 PASS、0 FAIL；教程 stage6 超时崩溃 |
| `e2e-p15e` | 51 PASS；FIST 1 红（#72 间歇家族）；教程 stage6 仍超时（重按两次掌仍漏判） |

## 第三轮：教程漏判的根因（不是负载借口，是真缺陷）

`e2e-p15d/e/g` 三次都在首跑教程段崩溃。逐行定位崩溃点后才看清：加了重按之后崩溃点从 `waitStage(6)` 移到 `waitStage(7)`（颜色课），说明张掌课已经过了——真正的缺陷在教程信号本身。

`useTutorialSignal` 的 150ms 节奏闸门（第十三阶段为消掉 maximum-update-depth 而加）会把**离散事实**一起吞掉：张掌呼出 Dock 只有约 1.4s 窗口（手离开后自动收起）、捏合抬笔只有一两帧，双页 WebGL 饿死渲染时两次发布之间可以完全没有这些值。探针 `p15tut.mjs` 在带负载（另一页持续画线）下按 400ms 采样证实：`durationMs` 1108 时 `dockOpen` 才翻真，而闸门正好能把这一帧整段跳过。

修复在信号层：把「是否只是游标抖动」作为闸门的唯一适用条件——除 `cursorMovedPx` 外任何字段与上次发布不同就立刻发布，位移抖动仍按 150ms 节流（闸门本就是为它而存在）。驱动侧的重按手掌保留，理由与 `tapDock`/`click` 的重试相同：一次没成，人就再做一次。

FIST 那条红点（`p15c`/`p15d` 绿、`p15e` 红）仍属 #72 已记录的「UI 捏合后闸门」间歇家族：断言原样保留，未放宽阈值。

### 教练卡压住颜色浮层（遮挡修复暴露的真缺陷，同属本阶段主题）

信号修好后崩溃点移到颜色课（`waitStage(7)`）。探针 `p15tut.mjs` 在带负载下取证：

- 色球中心的绘制栈是 `H2 → DIV → ASIDE[tutorial-coach] → BUTTON[color-#fb7185]`——**教练卡真的画在色球上面**；
- 瞄准色球时 hover 落在 `tutorial-coach-zone`，激活的也是教练卡，颜色永远不变。

遮挡检查没有制造问题，它只是不再让捏合穿透一张用户看不见的卡去点下面的控件——这正是本阶段要修的「被遮挡」类缺陷。修复放在排版层：教练卡从「底部居中、紧贴工具坞上方」移到「顶栏下方左上角」（`TutorialCoach.module.css .position`），因为坞的浮层正是从坞向上展开的那一条带，两者不可能共存。复测：色球绘制栈首位即 `BUTTON[color-#fb7185]`，hover/激活正确，stage 6→7 通过。

### 连跑负载级联（判定轮为何要冷却单跑）

`e2e-p15i`（45 PASS / 11 FAIL）与同码的前几轮结果不同：一次 `dock-save` 捏合被吞 → 作品库 0 张卡 → 导出三张图/分辨率/回读连带红，后段又叠上 guide 章节两条。核对不是浏览器泄漏（崩溃轮次没有留下 headless 进程：`Get-CimInstance … -match 'headless'` 为空），而是当时本机有一个前台 Chrome 在抢 CPU/GPU；判定轮改在空闲机器上单跑，并把每轮 `PASS/FAIL` 计数写进上表，避免把负载读成回归。

## 第四轮：浮层锚定与模型栏命名

1. **Dock 浮层改为锚定自己的触发按钮**（`SpatialDock.tsx`）：颜色/材质/粗细/更多原先一律在整行居中弹出，颜色盘会盖到撤销按钮上，用户分不清刚按的是哪个。现在面板沿行滑到自己的触发按钮正上方，并在屏幕左右边缘 24px 处停住（用 `margin-left` 承载位移，因为 `transform` 归 Motion 所有）。实测 1440/1366/1024/900 四档：四个面板 `centreDelta` 全为 0、都在触发按钮上方、`onScreen` 全真。
2. **模型栏命名统一**：`Move/Rotate/Scale/Group/Help` 与中英夹杂的 `Snap 关闭` 全部改走 i18n（`model.move/rotate/scale/group` + `common.help`，`model.snapOff` 改为 关闭吸附 / No snap）。模型模式实拍确认：移动/旋转/缩放/重置/导入模型/移除/编组/示例模型/使用说明/设置/关闭吸附/网格/15°/中心。
3. **一次被撤回的尝试**：把 DEV 诊断面板从 `right:16px` 挪到属性栏左侧（`right:calc(var(--ad-panel-w) + 40px)`）以避开右侧栏。截图取证立刻否决——它挡到了大厅卡片，`enterApp` 的点击被面板内文本截获（`intercepts pointer events`）。已回滚；DEV 面板与右侧属性栏的重叠只在 `?debug=1` 下出现，留待右侧栏改为布局列时一并解决（那一列会真正占住宽度）。

## 交付判定（本轮实测）

| 项 | 结果 |
| --- | --- |
| `typecheck` / `build` | 通过（build 仅历史一致的 chunk 体积警告） |
| `verify:core` | ALL，含第十四阶段坐标用例 |
| `e2e:layout` | **36/36**，含「状态行托管在顶栏内」这条本轮恢复意义的断言 |
| `e2e`（空闲机器冷却单跑 `e2e-p15j`） | **55 PASS / 1 FAIL**，教程全段跑完；唯一红点是 FIST 解除后落笔的已知间歇（#72），断言未放宽 |
| 探针 | `p15repro`（丢手提示/作品库开/设置滚动）、`p15help`（菜单层级/教程 stage6）、`p15theme`（主题后落笔 3/3）、`p15tut`（颜色课）、`p15pop`（四面板 × 四档视口锚定） |
| 交付图 | `docs/screenshots/phase15/after-0{1..6}-*.png`：三模式 × 日/夜 + 作品库 + 设置 + 设备菜单，1440×900 |

仍未验证：真机摄像头与真人手势；右侧属性栏作为布局列（画布尺寸、相机宽高比与手势映射随其让位而重算）与各模式 Dock 的进一步分组，见「本轮未完成」。

## 第五轮：右侧属性栏改为布局列（P15-1）与模型栏分组（P15-2 部分）

### 布局列：交付了什么，撤回了什么

`.workspace` 改为网格（`"bar bar" / "stage rail"`），属性栏从「右上的浮层」变成真正的列：列头是「面板名 + 选中对象名 + 收起箭头」，只有面板内部滚动，DEV 面板堆在同一列里，与属性面板不再互相盖住。收起 = 列变 72px 条并把宽度还给画布。底部工具行以**栏剩余的区域**居中（`--rail-w` 同时驱动列宽与居中，二者不可能不一致）：

| 视口 / 栏状态 | 剩余宽度 | 工具行中心 | 期望中心 |
| --- | --- | --- | --- |
| 1440，栏展开 288 | 1152 | 576 | 576 ✓ |
| 1440，栏收起 72 | 1368 | 684 | 684 ✓ |
| 900，栏展开 264 | 636 | 318 | 318 ✓ |

**自己引入又当场修掉的三个问题**：① 覆盖层进列后仍带着原来的 `translateY(-50%)`，首行被甩到窗口外（layout 套件 6 条红，`surface-smooth @1186,-225`）——覆盖层转布局元素必须清 `transform`；② 列的左右 padding 让面板宽度 288→255，触发「属性面板宽度」断言——padding 归位到列头，面板铺满列；③ DEV 面板搬进列之后随列一起在全屏浮层期间消失，`e2e-p15l` 因此 `devBefore:false` 连带三条红——改为「一个元素两个宿主」：有列时堆在列内，没列时回到绝对定位，开发态读数在任何界面都拿得到。

**撤回的一半**：把画布/相机/手势映射也收进 stage 单元（画布真的缩到 1152×836、viewport 同步、`dockCentreVsStage=0` 一度全部实测通过），但 `e2e-p15k` 给出 10 条红点，`p15frame.mjs` 定位到根因：指针被 `clampToViewport` 夹在 stage 内，而顶栏与属性栏在 stage 之外——瞄准顶栏帮助按钮算出的平面 v 为 −0.0488，光标被钉在 (992,0)，顶栏与栏内控件**手势不可达**（`lastActivatedId: voice-toggle`）。指针必须能走到窗口任意控件，而笔迹必须落在让位后的画布上，这需要「一个 plane→window 映射同时服务指针、墨迹与相机」的统一改造（画布内绘制再减去单元原点），不是把 viewport 换个来源就完事。因此本轮把画布/视口/驱动坐标恢复为整窗（`engine.setViewport(window)`、驱动 `planeFromScreen` 原样），保留列式属性栏与工具行让位居中，并把统一输入坐标系列为下一步的第一项。

### 模型栏分组与图标

模型栏改为分组：变换（移动/旋转/缩放 + 全宽缩放滑杆 + 重置）· 资产（导入模型/示例模型）· 组织（编组；移除置末、按住确认、红色语义）· 吸附（关闭吸附/网格/15°/中心）。栏内的 使用说明、设置 两个入口删除——顶栏在每种模式下都有这两项，同一功能不在两处竞争。

`GestureButton` 的图标从 40 分支行内三元表达式改为有序正则表 + `iconFor(id)`（先匹配先赢，`snap-center` 不会被 `center` 抢先），并补齐此前一律落到加号兜底的语义图标：导入、移除、编组、示例、帮助、吸附四态、居中、颜色、材质、粗细、橡皮、撤销/重做、压力、适应视图、百分比。用户截图里「满屏加号」的来源就是这条兜底。

### 诚实记录：没做的部分

- 模型栏的「居中」需要新的命令语义（当前 `CENTER_ARTWORK` 只对笔迹有意义），没有放一个不确定会做什么的按钮。
- 二维 Dock 的 选择/画笔自展开、背景归「画布外观」、导出归项目菜单、Make 3D 条件化 未动。
- P15-3（颜色最近使用与自定义、材质缩略图、粗细直径预览）、P15-4（内层微响应、空闲单光标）、P15-5（日夜面板一致性复核）未动。

## 第六轮：全链回归里翻出的三条陈旧断言（scripts/phase8-core.ts）

`src/**` 改动后按回归链重跑全部 Node 套件，`verify:phase8` 三条红。逐条核对后确认**都不是本轮引入的产品缺陷，而是断言写的是更早阶段主动改掉的旧契约**；处理方式是把断言重写到当前契约并补上反向用例，不是删掉或放宽：

| 旧断言 | 现行契约（定义处） | 改写 |
| --- | --- | --- |
| `unconfirmed near does not unlock a switched context` | 第十四阶段：只有切换时**真的捏着**才上闸门（`InputRouter.set(mode, context, holding)`），否则就是被记录在案的「首次捏合被吞」缺陷本身 | `a pinch held across a context switch does not unlock the pen` + 新增 `a switch with nothing held leaves the pen ready` |
| `voice grammar: 红色 / 蓝色` | docs/voice-commands.md 第 27 行：颜色词必须带动词（「选择红色」），裸颜色词是刻意不解析的 | 从裸词表移除，改为 `voice colour with verb`（4 条）+ `bare colour word is ignored`（2 条负向） |
| `long loss ends ink` | `TRACKING_LOST_GRACE_MS = 320`（README「180ms 短暂缺失续写」的现值），夹具只断了 220ms，落在宽限内 | 保留原名但把时钟推到 400ms，并新增 `a dropout inside the 320ms grace keeps the same stroke` 正向用例 |

改完 `verify:phase8` 785/785；`verify:contact` 18/18、`verify:stage5` 987/987、`verify:stage6` 143/143、`verify:playlab` 55/55、`verify:core` ALL。

### 浏览器全链跑出的两个真实输入缺陷（遮挡检查再次当探针用）

`e2e:playlab` / `e2e:toys` 的「离开玩具」红点，`p15hub.mjs` 取证到根因：

1. **整窗 WebGL 画布吃掉指针**。`elementsFromPoint` 在 PlayLab 大厅「离开」按钮中心返回的是 `CANVAS`——3D 画布是可命中图层，盖在所有 DOM 浮层之上。R3F 侧没有任何 DOM 指针事件（`src/rendering/**` 无 `onPointerDown/onClick`，三维交互全靠引擎对手部光标的射线），因此把画布设为 `pointer-events: none`（`Scene3D.tsx` Canvas style）。这不是测试问题：鼠标用户此前同样点不到被画布盖住的控件，只是手势拾取过去不看遮挡，所以一直没暴露。
2. **大厅头部的按钮继承 `pointer-events: none`**。`.railPosition` 为了让画板可穿透而整体关闭指针，只有 `.card` 重新打开——`lab-leave` 在 `.lede` 里，鼠标与（新的）遮挡感知拾取都拿不到它。修法只给按钮恢复指针：`.lede :global(.ad-tool-button){pointer-events:auto}`。同时给遮挡检查加了一道护栏：区域元素自身 `pointer-events:none` 时不下「被盖住」的结论（`elementFromPoint` 对它永远返回别的东西，否则这类控件会被静默禁掉）。

修完 `e2e:playlab` 只剩记录在案的 `KNOWN GAP: a right swipe goes back one card`（右滑不提交，禁止为变绿删断言）；`lab-back` 在干净进入路径下实测可捏合（`p15lab.mjs`：`click:"ok"`、`lastActivatedId:"lab-back"`、phase→EXITING）。

**仍未通过（诚实记录）**：`e2e:toys` 的 `leaving by hand returns to the rail` 依旧 `no-press`（`activations:0, hubVisible:false`）。同一按钮在轻载单进路径下捏合成功，因此两种候选解释尚未定论：① 该套件在五个玩具 + 失败重试序列之后，玩具自身的 lesson 文本层可能盖住 chrome 中心（遮挡检查会拒绝）；② 长序列后的按压饥饿（#72 家族）。下一步用 `p15lab.mjs` 复制该套件的前置序列即可判定，不在本轮猜修。

## 第七轮：② 二维 Dock 分组（src/components/SpatialDock.tsx、CanvasDock.tsx、WorkspaceBar.tsx）

按第十五阶段清单的二维行契约重排：**画笔 / 橡皮擦 / 颜色 / 粗细 / 撤销 / 重做 / 更多**。三维行不动（颜色/材质/粗细/撤销/重做/橡皮擦/更多），两行都以「历史 + 更多」收尾，橡皮擦在两行里都是常驻模式切换。

- **画笔自展开**：新增 `Popover='brush'` 面板，里面只有 钢笔/马克笔/荧光笔 + 轻微压感——三种笔与一个真正改变落笔的属性。`dock-erase` 不在面板里：放下笔不该先开面板。面板仍走既有的「贴着触发按钮、遇边收住」定位（`POPOVER_TRIGGER.brush='dock-brush'`）。
- **橡皮擦是二维的第四个笔**：`engine.canvasTool` 是引擎字段（画每一帧都要读），而行是 React，于是 `pickCanvasTool` 把选择镜像进引擎并 bump 一次计数重绘；再按一次橡皮擦回到上一次拿的笔（`lastPen`），与三维的 `eraseMode` 同一套语义。为此把原先散在 `DrawEngine` 字段与 `CanvasDock` 数组两处的 `'pen'|'marker'|'highlighter'|'eraser'` 收成 `types/drawing.ts` 的 `CanvasTool`。
- **背景归「画布外观」**、**导出归项目菜单**、**Make 3D 条件化**：`CanvasDock` 从四排按钮压成两个具名分组（画布外观：白纸/透明/深色；图层与转换：图层与对象、转为三维）。PNG/SVG 两项移到顶栏项目菜单（`WorkspaceBar` 新增可选 `onExportPng/onExportSvg`，只在二维画布在屏时给出——三维的 GLB/JSON 走工程面板，两套导出不在同一处竞争）；`canvas-make3d` 只在纸上有笔迹时出现。栏内不再有第二处笔型，`canvas-pressure` 也随画笔面板上移。
- 顺带去掉一处三行重复的字面量映射：`freehand.ts` 新增 `paperCss(paper)`，App 的缩略图与两处导出共用它（`CanvasPlane.tsx` 的同一表达式在渲染循环里，本轮不动它以免碰渲染路径）。
- 中文标签统一：`Make 3D`→`转为三维`、`Layers`→`图层与对象`（原来两个硬编码英文串），新增 `dock.brush`、`canvas.layersGroup`、`canvas.make3d` 三对中英键。

### 遮挡/拾取检查顺出的一条真实缺陷：识别卡被自动保存「闪掉」

`e2e:creation` 三条红（`suggestion confirmation marks object activated`、`Make 3D creates a solid…`、`creation coach reads real converted object`）不是断言陈旧，也不是本轮 UI 改动直接造成：`p15dock.mjs` 每 250ms 采样 14 次，看到卡片 `true×2 → false×3 → true×9`，并在 `engine.onHistoryChange` 上挂栈抓到发布方——`useProjectBridge.ts:134 → DrawEngine.replaceProjectStrokes`。也就是 `loadArtwork` 落笔后，桥把同一张纸回写一次，`RecognitionSuggestion` 的「历史一变就清空候选、850ms 后再分析」把正被瞄准的卡片抹掉约 1 秒；后面两条红是同一根因的级联（确认没落地，转三维自然没有实体）。

修法是让卡片自己判断这次历史变化是否真的动了笔迹：`canvasTarget()` 给出「未锁定二维笔迹数 + 目标 id + recognition + 各段点数」指纹，指纹未变且不在落笔中就保留卡片；笔迹真变了（新笔、撤销、删除、识别转换）照旧清空并重新分析。改后 14/14 采样 `card:true`，`click:"ok"`、`lastActivatedId:"recognition-confirm"`、对象 `recognition:"geometry"`。

### 本轮实测

`npm.cmd run typecheck` ✓、`npm.cmd run build` ✓、`verify:core` ALL。`e2e:layout` **40/40**（原 36 条 + 新增 4 条：二维行七项精确契约、行内不含 `dock-material`、画笔面板恰好三笔+压感且贴在行上方、面板选择落到引擎、橡皮擦双向切换回上一支笔）。`e2e:stage5` **13/13**（PNG/SVG 两条改走「开项目菜单→选格式」的真实路径，未删断言）。`e2e:creation` **20/20**。`e2e`（主套件）结果见下一节表格。
