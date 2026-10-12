---
name: airdraw-shader-toy-verification
description: AirDraw (D:\AirDraw) PlayLab 玩具与 GLSL 的验证流程 —— 玩具必须借用 Scene3D 的共享 Canvas/runtime（绝不新建 renderer、摄像头或 Worker），挂载走 try/catch 并把错误发布到 window.__airdrawLab.state.error，GLSL 错误只有浏览器能抓到（typecheck 与 build 全抓不到），两类已知签名是 shader 里混进 `Math.abs` 这类 JS 写法（Vertex shader is not compiled）与顶点/片元共享 uniform 精度不一致（Precisions of uniform differ → useProgram: program not valid），资源契约用 20 进 20 出后比对 gl.info.memory 基线来断言。改动 src/playlab/** 或任何 shader 字符串之后使用；当玩具静默不挂载、场景 group 只有一个节点、或要证明显存不涨时使用。跑法/端口/计数/PATH 交给 airdraw-regression-verification，接触阈值标定交给 gesture-threshold-noise-probe，本 Skill 只管玩具与 shader 这一层。
---

# AirDraw 玩具与 Shader 验证

## Overview

PlayLab 的五个玩具共用一个 WebGL 上下文、一个 runtime、一帧手部数据。这套契约下有四类故障**不会**在 typecheck、build 或 Node 套件里露头，只在浏览器里暴露，其中两类曾经静默上线：玩具挂载被 Promise 吞掉、`LabStage` 卸载把 App 持有的 runtime 永久 dispose。四个真实缺陷与修法记录在 `docs/phase7-log.md:45`。

本 Skill 只负责「怎么挂、怎么看出没挂上、怎么验 GLSL、怎么算账」。环境（PATH 里没有 node/npm、各套件 `APP_URL` 默认端口不一致、断言计数必须以 `docs/verification/*.json` 为准、长跑期间冻结模块图）见 `airdraw-regression-verification`，不要在这里重复推导。

## 1. 五条硬约束（改玩具前先对一遍）

1. **只有一个 Canvas**。玩具通过 `Scene3D` 的 `lab` 插槽挂进既有场景（`src/App.tsx:567`、`src/rendering/three/Scene3D.tsx:493`），永远不要为新玩具再起一个 `<Canvas>` / `WebGLRenderer` / `PerspectiveCamera` —— 多一个上下文就多一整套 GPU 资源和一条渲染循环（`src/playlab/LabStage.tsx:8-15`）。
2. **runtime 由 App 持有，子组件不许 dispose**。`src/App.tsx:146` 用 `useMemo` 造唯一 `LabRuntime`；`LabStage.tsx` 的 effect 刻意没有清理函数。原因不是洁癖：`runtime.ts:264-270` 的 `dispose()` 会把 `disposed` 永久置真，之后 `runtime.ts:126-129` 直接 `toy.dispose(); return`，于是**任何玩具都再也挂不上，且没有任何报错**。
3. **不碰摄像头与推理**。runtime 与玩具读的是同一帧 `engine.frame`（`runtime.ts:202-232`）；`runtime.ts:16-21` 明确写了：如果某个玩具看起来需要自己开 Hand Landmarker，错的是契约不是玩具。
4. **一个玩具只有一个 `Group`**。生命周期严格为 `initialize → enter → (update|onHandFrame|onGesture)* → pause ⇄ resume → exit → …重进… → dispose`，且**每个钩子都必须能被调两次**；`dispose` 是唯一可以释放显存的地方，并且 `initialize` 没跑过时它不得抛错（`src/playlab/types.ts:16-20`）。
5. **手势走仲裁**。玩具只在 `frame.interactive` 为真时 `arbitration.begin('toy')`（`runtime.ts:188-197`），优先级 `safety > 抓取/绘画 > 捏合 > 双手 > 玩具 > 滑动 > 悬停`。

## 2. 挂载三联检（判断「到底挂上没有」）

在 dev 页面（`?simulate=1` 不需要摄像头）依次读三个量。三个都过才算挂上，任何一个失配都直接指向唯一原因：

```js
const lab = window.__airdrawLab;                     // 仅 DEV 注入：src/App.tsx:148
const nodes = (() => { let n = 0; lab.group.traverse(() => n += 1); return n; })();
const gl = window.__airdrawThree.gl;                 // src/rendering/three/Scene3D.tsx:509
return { error: lab.state.error, phase: lab.state.phase, loaded: lab.state.loaded,
         nodes, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures,
         canvases: document.querySelectorAll('canvas[data-airdraw-canvas]').length };
```

触发挂载用 `window.__airdrawLab.request('ocean')`，退出用 `.back()`。

| 读数 | 含义 |
| --- | --- |
| `error` 非 null | 挂载抛了异常，被 `runtime.ts:138-142` 接住并发布。文本就是根因，不要靠猜。 |
| `phase==='ACTIVE'` 但 `nodes === 1` | **静默失败**：`toyRoot.clear()/add()` 没走到（`runtime.ts:133-134`）。第一顺位查约束 2（runtime 被提前 dispose）与 `initialize` 里的 await 是否挂起。 |
| `nodes > 2` | 真几何体进了场景（套件用的就是这条阈值：断言 `the toy puts real geometry on screen`）。 |
| `canvases !== 1` | 有人新建了 Canvas 或没释放旧的。 |

**新增/重写 `mount` 路径时 try/catch 不可省**：`initialize` 是 async，裸抛会被 Promise 吞掉，页面上只表现为「什么都不显示」。

## 3. GLSL 只能在浏览器里验

`verify:playlab` 是纯 Node（`package.json:20`，rolldown 打包 `scripts/playlab-core.ts`），不碰 GPU；`typecheck` 只看 TS，`vite build` 不编译 shader 字符串。**shader 文本里的任何错误，Node 侧四层绿灯全都放行。** 唯一捕获点是浏览器套件 `scripts/playlab-e2e.mjs` 里 `page.on('pageerror')` + `page.on('console')` 的错误收集，收尾由 `no runtime exceptions` 这条断言放行。

three 在链接失败时以 `console.error` 打印 `WebGLProgram: Shader Error … Program Info Log …` 并附顶点/片元完整源码与出错行（`node_modules/three/build/three.module.js:7053-7061`）。**先读 `Program Info Log`，它直接给出根因**，不要从 `useProgram: program not valid` 反向猜。

两条已知签名：

- **`glLinkProgram: Vertex shader is not compiled` / 顶点编译失败** —— GLSL 里混进了 JS 写法。曾经的实际内容是 `Math.abs`。替身表：`Math.abs→abs`、`Math.PI→3.14159`（现存写法见 `src/playlab/toys/energyOrb.ts:121`）、`Math.floor/fract→floor`、`**`→`pow`、`let/const`→GLSL ES 1.00 里用 `int`/`float` 显式声明、`for (let …)`→`for (int i = 0; …)`（见 `src/playlab/shaders.ts:64`）、`x ** 2`/`1/2`→浮点字面量必须带小数点。
- **`Precisions of uniform differ` → `useProgram: program not valid`** —— 同一 uniform 在顶点和片元的精度限定符不一致。规则：**精度只在片元顶部写一次 `precision highp float;`，共享 uniform 一律不带限定符**（顶点默认 highp）。现存正确范式：`energyOrb.ts:110`（顶点 `uniform float uTime, uCharge, uWave;`）配 `energyOrb.ts:133-134`（片元 `precision highp float;` + 无限定符 uniform）；`handOcean.ts:72` 配 `:129-130` 同理。曾经出错的就是 `uCharge` 单边加了 `mediump`。注意 `shaders.ts` 里的共享片段会被拼进两个阶段，精度冲突常由此引入。

改完 shader 后**必须**实跑一次浏览器套件：

```bash
APP_URL=http://localhost:5173/ node scripts/playlab-e2e.mjs
```

## 4. 资源账目回归

契约是「进 20 次出 20 次，账目回到基线」。现有断言（`scripts/playlab-e2e.mjs:129-141`）：`geometries` 与基线 Δ≤3、`textures` Δ≤2、canvas 数恒为 1；逐玩具的退出释放断言在 `:114-128`。基线数值（流体 9/3，见 `README.md:24`）**以当轮 `docs/verification/playlab-e2e.json` 为准，不要把条数或基线抄进长期文档** —— 套件还在新增。

两个非显性陷阱：

1. **玩具是模块单例并被缓存复用**：`catalog.ts:82-93` 把 `import()` 结果存进 `loaded`，而 `runtime.ts:152-160` 每次退出都会 `toy.dispose()`。所以 20 次循环同时验的是「dispose 之后能不能重建」—— 只在构造函数里建资源的玩具第一次进正常、第二次进白屏。资源建立要放在 `initialize`/`enter` 或用 `built` 标志重建（`fluidInk.ts:395-409` 的 `dispose` 末尾就把 `built=false`）。
2. **render target 不会自己回收**。流体/海洋的 FBO 必须出现在同一次 `dispose` 里，否则 `textures` 单调增长；`geometries` 增长通常是无环形缓冲复用（对比 `fireworks.ts:164-188` 的 slot 覆写写法）。

泄漏只由 20 次循环判定；FPS 不由本 Skill 判定 —— headless 跑的是 SwiftShader 软件光栅，帧时间量的是光栅吞吐而不是应用缺陷。

## 5. 交付判定与红线

- 最小闭环：`npm.cmd run verify:playlab` → `npm.cmd run typecheck && npm.cmd run build` → `APP_URL=<vite 实际端口> npm.cmd run e2e:playlab`，全绿后以 `docs/verification/playlab-e2e.json` 计数。
- 结论口径限定：绿灯来自 **headless SwiftShader + 合成手**，只能说「无对象/纹理泄漏、挂载与释放契约成立、零运行时异常」，不得据此宣称真机 60fps 或真人手感。
- **`右滑返回不提交` 是标了 `KNOWN GAP` 的失败项，禁止为了让套件变绿而删断言或放宽阈值**（`docs/phase7-log.md:49`）。
- 项目不是 git 仓库，改 `src/playlab/**` 前先复制 `.bak`；有 30 分钟长跑在跑时不得触碰模块图内任何文件（含 `catalog.ts` 里的纯文案）。
- 本 Skill 的行号只是加速器不是证据：`scripts/playlab-e2e.mjs` 正被并行开发频繁改写，锚点对不上时按**断言文本或符号名** grep（如 `20 fluid cycles leave the ledger flat`、`no runtime exceptions`）。
