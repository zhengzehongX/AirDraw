# Phase 13 — 视觉系统与动效升级（显示层渐进重构）

范围约束：只动显示层与动效层，不推倒重写、不删除已正常工作的功能。所有手势、绘画、玩具、语音、保存链路保持原契约；本轮新增的每一个动效都可以被 `prefers-reduced-motion` 与设置里的「减弱动效」关掉。

## 1. 设计系统收敛

- 字阶：`--ad-text-*` 一级一角色（eyebrow 12 / caption 13 / sm 15 / md 16 / lg 17 / title 20 / title-lg 24 / display 34 / hero 48 / hero-lg 68），字重 400/500/600/700，display 级收紧 `-0.032em`、标题 `-0.016em`、正文 `+0.004em`。组件里不再自造字号：PlayLab 卡片标题/正文、大厅标题/副标题全部改走 token。
- 大厅标题原来写成 `clamp(28px, 4.2vw, 24px)`——下限比上限大，等于永远 28px。现为 `clamp(30px, 3.6vw, hero)` + 700 + 紧字距 + `text-wrap: balance`；副标题升到 15px 正文级并平衡换行（390 宽不再剩一个字孤行）。
- 间距：8pt 体系（`--ad-space-*`、`--ad-hit-*`）继续是唯一来源；本轮只把越界的硬编码值（PlayLab 卡片 padding 14px、标题 margin 12/4 等）收回 token。
- sheet 层级：设置/作品库的抬头从 eyebrow 升为 `ad-title`（20px/600），章节标题保持 eyebrow，行标签 15–16px——一个 sheet 内三级清楚；使用说明书保留 eyebrow 抬头，因为正文里的大章标题才是那一页的主标题。

## 2. 动效词表与转场

- `src/design/motion.ts` 三档：micro 180ms / panel 340ms / page 640ms（exit 450ms，约为 enter 的 0.7×），reveal 560ms，stagger 50ms。CSS 侧同名 token 对齐。
- 新增 `ScreenTransition`：gallery / settings / help 三个全屏面共用一次交接——进入时整体抬起 18px + 顶部一道 accent 笔画横扫（`ad-screen-stroke`，640ms，只跑 transform/opacity），离开时更快抬起并在**离开的第一帧**把 `pointer-events` 交还（实测退出 90ms 后大厅按钮已可点），全程无空帧。
- 分层进入：大厅按 品牌→标题→副标题→四扇门→底行 的顺序 stagger 入场。实测（SwiftShader）标题/副标题/卡片 560ms 落定、底行 831ms，落在简报要求的 400–900ms 内；入场只用 opacity+transform——最初给文字加了 blur→sharp，实测在三维场景忙的时候整层重绘拖慢入场，已移除。
- `lineReveal(order)` 的参数是**序号不是秒**：第一版把序号当秒传，副标题延迟 2s、底行延迟 8s 才出现，探针时间线抓出来后把乘法收进了 helper 内部，调用方不可能再犯。

## 3. 微响应：每个可点的东西都有回答

- 新增共享配方 `button.ad-press`：hover 抬 1px、按下 `scale: 0.97` 快速回弹，transition 只列 transform/颜色/阴影/描边/透明度。关键点：`translate` 与 `scale` 用**独立 transform 属性**，与 Motion 写在 `transform` 里的手势磁吸缩放相乘而不是互相覆盖。
- 顺带修掉一类死代码：`GestureButton`/`DockItem`/大厅卡片原先的 `whileTap={{scale}}` 全部无效——`style.scale` 是手势磁吸的 MotionValue，Motion 不会再动画一个被 style 占用的值。按下反馈改由 CSS 独立属性提供，实测 hub 卡片 0.985、`ad-press` 按钮 0.97、GestureButton 0.97。
- 覆盖点：顶栏/底坞/侧板/弹层全部按钮（GestureButton）、设置/说明/作品库/授权/教程/跟踪故障/相机预览/缩略导航/作品名/主题/相机状态点、大厅文字按钮与卡片、PlayLab 卡片。
- 减弱动效时 `:root[data-reduced-motion='on']` 只保留颜色回答，去掉位移与缩放。

## 4. 布局自检修掉的真问题

- **大厅重复控件 + 遮挡**：浮动模式切换器和浮动状态条在大厅上与自己的品牌区重复，且在 ≤860 宽压在标题/副标题上；768×1024 下切换器还盖住了底行按钮（Playwright 直接报 intercept）。两者按代码里既有的注释意图（「大厅是一扇门，不是一个工作区」）收进 `workspaceChrome` 闸门，大厅只留自己的四扇门与右上三枚状态控件。
- **平板竖屏的大厅**：621–860 宽曾是单列，四张卡各占满宽、预览带只有 260px，大片死白，底行被推到折线外（实测 y=1015 / 视口 1024）。恢复两列后 768×1024 一屏看完。
- **设置页**：1440 宽下 620px 的单列让 sheet 两侧全是死玻璃、滚动 2400px。加宽到 880px。两列方案实测后**回退**：分列后滑杆行正好落在手抓列表的取点上，竖直拖动被滑杆区域认领，列表反而滚不动——手的滚动是更老的保证，优先保留（见 §6）。
- 响应式扫描（1440/1366/1024/768/390 × 大厅/设置/作品库/说明）：五个宽度均无横向滚动；设置/说明的内部滚动在加宽与转场包裹后仍然工作（滚轮与手拖均实测移动）。390 宽下品牌行只保留字标（页名隐去），与右上浮动状态控件留 57px 净空。

## 5. 对比度（按 themes.ts 端点计算的 WCAG 比值）

| 角色 | day | night |
| --- | --- | --- |
| text / bg | 13.0 | 13.9 |
| textDim / bg | 5.94 | 9.17 |
| textFaint / bg（12–13px 说明文字） | 4.93 | 5.40 |
| accent / bg（11.5px 提示文字） | 4.62 | 8.72 |

全部高于小字 4.5:1 下限。

## 6. 回退与开放缺陷

- 回退：设置两列布局（原因见 §4）。记录在案，等输入仲裁支持「滑杆只认领水平拖拽」后再试。
- 开放缺陷（不改断言、不隐藏报错）：e2e「theme switches by pinch while drawing continues」。探针三轮复现的形态是 SET_THEME 的可见结果延迟 1–3s（SwiftShader 下混合与场景争帧），落笔若正好落在这个窗口里会丢一次捏合；套件里表现为同一断言的另一个合取支失败。归入 P12-3 的输入/性能冲突账。
- 同族开放缺陷：状态切换（FIST 锁定解除、UI 激活释放）之后立刻落笔，捏合偶尔被路由吞掉——e2e 的 FIST 检查在连跑里红、单独跑绿，形态与 theme 那条一致（`resume=1`、penDown 真但无新笔迹）。两者都指向「切换之后的第一次落笔」这一个根，等 P12-3 的显式状态机把 release/重捕获时序收干净时一起修。
- 既有 KNOWN GAP：PlayLab 右滑翻页（docs/phase7-log.md），断言保留。

## 7. 回归

见 `docs/verification/phase13-visual.json`（视觉/动效实测）与下表（浏览器套件，逐条计数以 docs/verification/*.json 为准）。

| 套件 | 结果 |
| --- | --- |
| typecheck / build | 通过 |
| e2e:layout | 36/36（两轮） |
| e2e | 54/56：红为 §6 的 theme 开放缺陷，与 FIST 解除后落笔的边际时序（同族问题，单独跑曾绿）；console 检查在本轮循环修复后转绿 |
| e2e:settings | 38/38（「输入排他」断言与 toys 套件同一 TOY_CHROME 契约后） |
| e2e:toys | 13/13 |
| e2e:voice | 21/21 |
| e2e:playlab | 仅 KNOWN GAP（右滑翻页，phase7 记录在案） |
| e2e:stage5 | 通过（本轮早前一轮） |

真机摄像头与真机语音仍未在本轮验证，结论口径不变：以上绿灯来自 headless SwiftShader + 合成手。
