import type { GestureName } from '../types/drawing';

/**
 * The content of the built-in user guide.
 *
 * Written for a person holding nothing but their hand: every line describes
 * something they can do right now, in the words the interface uses elsewhere.
 * Numbers (dwell, cooldown, hold times) come from the same place the app reads
 * them, so the manual cannot drift from the behaviour.
 */

export type GestureKey = 'POINT' | 'PINCH' | 'PINCH_MOVE' | 'OPEN_PALM' | 'VICTORY' | 'FIST';

export type GestureCard = {
  key: GestureKey;
  /** The pose the tracker reports while the user performs it. */
  gesture: GestureName;
  name: string;
  purpose: string;
};

export const GESTURE_CARDS: GestureCard[] = [
  { key: 'POINT', gesture: 'POINT', name: '食指指向', purpose: '移动空间光标' },
  { key: 'PINCH', gesture: 'PINCH', name: '捏合', purpose: '确认 / 落笔' },
  { key: 'PINCH_MOVE', gesture: 'PINCH', name: '捏合并移动', purpose: '绘画 / 拖动' },
  { key: 'OPEN_PALM', gesture: 'OPEN_PALM', name: '张开手掌', purpose: '打开工具栏' },
  { key: 'VICTORY', gesture: 'VICTORY', name: '剪刀手', purpose: '查看模式' },
  { key: 'FIST', gesture: 'FIST', name: '握拳', purpose: '暂停输入' },
];

export type GuideBlock =
  | { kind: 'p'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'steps'; items: string[] }
  | { kind: 'live'; text: string }
  | { kind: 'table'; head: [string, string]; rows: Array<[string, string]> };

export type GuideSection = {
  id: string;
  title: string;
  summary: string;
  blocks: GuideBlock[];
};

export const GUIDE_SECTIONS: GuideSection[] = [
  {id:'workspace',title:'工程与图层',summary:'让平面笔迹、空间笔迹和模型共存。',blocks:[{kind:'steps',items:['张掌保持，选择顶部项目工具中的 Layers 或工程。','图层中捏合选择、显示或锁定对象；再点一次同一行取消选择，副手张掌可在空间中多选。','选多个对象后 Group；长按捏合删除（鼠标或键盘按住同样有效），锁定对象不会被误操作，清空画布也带不走它。','工程支持 New、Save、Save As、Duplicate、Rename、Open、Delete；停下编辑后自动保存，关掉页面前会尽力补写最后一次。']},{kind:'p',text:'工程保存在本地 IndexedDB，包含模型资源、图层、纸张、主题与相机。打开失败时尝试前一个有效快照；导出 AirDraw JSON 可备份到其他设备。旋转视角只改变你看它的方式：会保存，但不占撤销步骤。'}]},
  {id:'make3d',title:'识别与 Make 3D',summary:'先给建议，再由你确认。',blocks:[{kind:'steps',items:['在 Canvas Draw 画封闭圆形；停止约一秒，捏合确认圆形建议。','选择 Make 3D；封闭图形用 Extrude 或 Relief，开放线条用 Tube 或 Outline。','捏住 Depth、Bevel、Smooth、Scale 滑杆，观察场景中的预览。','生成后原稿保留并锁定，新对象进入 Model Control。选 Rotate 并捏住对象，转动手掌。']},{kind:'p',text:'建议不会自动改作品，忽略会淡出，确认与转换都可撤销。文字建议接口可接浏览器模型；当前默认未装载真实 OCR，开发者 Mock 仅演示接口。'}]},
  {id:'professional-export',title:'导出与录制',summary:'图片、矢量、模型和工程包。',blocks:[{kind:'list',items:['Canvas Draw 支持 PNG 与 SVG，透明纸张可导出透明 PNG。','项目导出提供高清或透明 PNG、GLB 模型和 AirDraw JSON 工程包。','导出面板捏合录制 WebM，再次确认停止；项目名旁显示红点与计时。','只录 WebGL 创作画面，摄像头预览与界面不会进入视频。高级材质导出 GLB 时降为标准 PBR。']},{kind:'p',text:'保存或导出失败时显示重试提示，当前工程仍留在工作区。本地文件选择和浏览器摄像头授权需要操作系统输入。'}]},
  {id:'modes',title:'三种模式',summary:'同一摄像头，自由切换工作区。',blocks:[{kind:'table',head:['模式','操作'],rows:[['Spatial Draw','真实捏合落笔；左侧调整颜色和粗细，右侧选择表面材质。'],['Canvas Draw','固定平面绘画；右侧选钢笔、马克笔、荧光笔、橡皮擦及纸张；支持 PNG / SVG。'],['Model Control','指向模型并真实捏合；选择 Move、Rotate 或 Scale，再移动手掌。']]},{kind:'p',text:'模型 Scale 支持双手捏合拉开或收拢，也可单手上下移动或拖动缩放条。张掌保持可取消选中，握拳暂停。'}]},
  {id:'contact',title:'接触校准',summary:'接近只预览，稳定接触才落笔。',blocks:[{kind:'steps',items:['第一次进入不用先校准：默认手感就能落笔，教程会带你画出第一笔。','想把手感调准：设置 → 重新校准捏合，完成三次张开、真实捏合、松开。','接近时圆环收紧，不会落笔；稳定接触后指针变实心。','手部丢失、切换主手或进入面板会立即结束笔画和抓取。']},{kind:'p',text:'单目摄像头只能估算指尖接近程度。遇到提前触发或难以落笔，请改善光照、让整只手入镜后重新校准；校准只记录你自己的样本，不需要填写任何算法参数。'},{kind:'p',text:'本地模型导入需要浏览器文件选择器；GLTF 的 BIN 和贴图请同时选择。摄像头授权及系统文件选择需系统操作。'}]},
  {
    id: 'start',
    title: '快速开始',
    summary: '三步就能画出第一条线。',
    blocks: [
      { kind: 'p', text: '举起一只手，掌心朝向摄像头，距离约 40–80 厘米。看到圆环出现，说明 AirDraw 已经找到你。' },
      {
        kind: 'steps',
        items: [
          '伸出食指——圆环就是你在空间里的指针。',
          '拇指与食指捏合，指针会拖出一条有厚度的 3D 笔迹。',
          '张开手指抬笔。想换颜色或粗细，先张开手掌保持一下呼出工具 Dock。',
        ],
      },
      { kind: 'p', text: '整个过程不需要鼠标和键盘。第一次授权摄像头之后，AirDraw 只靠你看懂你的动作。' },
    ],
  },
  {
    id: 'gestures',
    title: '基础手势',
    summary: '六个动作，就是全部的输入方式。',
    blocks: [
      {
        kind: 'table',
        head: ['手势', '作用'],
        rows: [
          ['食指指向', '移动空间光标'],
          ['捏合', '确认；在画布上则是落笔'],
          ['捏合并移动', '绘画；在滑杆上则是拖动'],
          ['张开手掌（保持约 0.7 秒）', '呼出 / 收起工具 Dock'],
          ['剪刀手 · 保持 0.4 秒', '进入 / 退出查看模式'],
          ['握拳', '暂停绘制并锁定输入'],
        ],
      },
      { kind: 'p', text: '一次确认的完整过程是：指向目标 → 停留一下 → 捏合 → 在目标上松开。中途移开手指不算数，所以不会误触发。' },
      { kind: 'live', text: '现在把手放进画面，试着捏合一下——上面那张卡片会实时亮起。' },
    ],
  },
  {
    id: 'drawing',
    title: '写字和画画',
    summary: '笔迹从指尖长出来，松开就停。',
    blocks: [
      { kind: 'p', text: '捏住不放并移动，笔迹会连续地跟着指尖生长；稳定松开后线条收住，保留圆润端头；短暂丢帧不会立刻断笔。' },
      {
        kind: 'list',
        items: [
          '写汉字或英文连笔时，在转折处稍微放慢，转角会被完整保留。',
          '画圆圈和螺旋时保持匀速，笔迹的粗细只由笔刷设置决定。',
          '手部快速移动时线条会自动稀疏采样，不会拖出跳线。',
          '手短暂离开画面，当前笔画会安全收尾，回来后可以继续画。',
        ],
      },
    ],
  },
  {
    id: 'tools',
    title: '工具 Dock',
    summary: '所有工具都在画面下方，抬手可及。',
    blocks: [
      {
        kind: 'table',
        head: ['工具', '说明'],
        rows: [
          ['颜色', '10 颗颜色球，捏合即选'],
          ['材质', '糖果 / 亮面塑料 / 金属 / 玻璃 / 霓虹'],
          ['粗细', '弧形滑杆，捏住拖动实时预览'],
          ['撤销 / 重做', '收回或恢复最近的一笔'],
          ['橡皮', '捏合状态下擦过笔迹即可局部擦除'],
          ['清空', '需要长按确认，短捏只会弹出确认浮层'],
          ['查看', '进入 3D 查看模式'],
          ['保存', '把当前作品存到这台设备'],
        ],
      },
      { kind: 'p', text: '张开手掌保持约 0.7 秒呼出 Dock；手离开 Dock 区域一会儿后它会自动收起，把画面完整还给你。' },
    ],
  },
  {
    id: 'materials',
    title: '颜色与材质',
    summary: '同一笔颜色，五种完全不同的质感。',
    blocks: [
      {
        kind: 'list',
        items: [
          '糖果：通透带内反光，最接近硬糖或树脂。',
          '亮面塑料：柔和漫反射加一层清漆高光。',
          '金属：强反射，随环境光移动而流动。',
          '玻璃：折射与透光，开销最大，性能不足时会自动降级。',
          '霓虹：自发光加轻微泛光，夜间模式下最醒目。',
        ],
      },
      { kind: 'p', text: '材质球的样子就是笔迹最终的样子，光照和日夜模式会一起影响高光。' },
    ],
  },
  {
    id: 'view',
    title: '3D 查看模式',
    summary: '作品是立在空间里的，可以转过来看。',
    blocks: [
      { kind: 'p', text: '保持剪刀手约 0.4 秒（或捏合工具里的「查看」）进入查看模式。此时不会落笔。' },
      {
        kind: 'list',
        items: [
          '捏住并移动：旋转视角，松手后有轻微惯性。',
          '两只手同时入镜并拉开 / 靠近：缩放。',
          '旋转和缩放都有幅度上限，作品不会被转到看不见的角度。',
          '再保持剪刀手约 0.4 秒退出，视角会平滑回到绘画位置。',
        ],
      },
    ],
  },
  {
    id: 'theme',
    title: '日间与夜间',
    summary: '切换的是整个空间的光，不是配色表。',
    blocks: [
      { kind: 'p', text: '捏合右上角的日月按钮，环境光、主光、泛光、背景、玻璃透明度和笔迹反射会在约 0.8 秒内连续过渡。' },
      { kind: 'list', items: ['过渡过程中可以照常书写，不会闪白或黑屏。', '日间是柔和的浅灰白与淡天空光；夜间是接近纯黑但不纯黑的深灰，带一点冷蓝。', '你的选择会被记住，下次打开还是这个模式。'] },
    ],
  },
  {
    id: 'save',
    title: '保存作品',
    summary: '作品只存在这台设备的这个浏览器里。',
    blocks: [
      { kind: 'p', text: '捏合工具里的「保存」，当前画布会连同颜色、材质、粗细、日夜模式和视角一起保存，并生成一张缩略图。' },
      { kind: 'list', items: ['在作品库里可以打开继续画、复制一份，或长按确认删除。', '点"打开"会先把当前工程存好，再把这张作品作为一个新的独立工程打开，你原来的画不会被覆盖。', '可以导出一张 PNG 图片，背景可选透明、日间或夜间。', '清空画布不会删除已经保存的作品。'] },
    ],
  },
  {
    id: 'help',
    title: '常见问题',
    summary: '卡住的时候先看这里。',
    blocks: [
      {
        kind: 'table',
        head: ['现象', '怎么办'],
        rows: [
          ['顶部提示「Show your hand」', '把手完全放进画面，掌心朝向摄像头，露出五指'],
          ['光标不动或乱跳', '确保光线均匀，避免强逆光；手保持在画面中央区域'],
          ['捏合没有反应', '拇指与食指要真正靠近；也可以在设置里打开「捏合辅助」'],
          ['线条断续', '移动太快或手出画；放慢速度，或调整「指针灵敏度」'],
          ['工具 Dock 不出现', '张掌需要保持约 0.7 秒，五指完全张开'],
          ['画面变卡', 'AirDraw 会自动进入性能模式，降低泛光与细节，不影响识别'],
          ['想换一只手操作', '设置 → 主用手，可选自动、左手或右手'],
        ],
      },
    ],
  },
  {
    id: 'privacy',
    title: '隐私与摄像头',
    summary: '摄像头本地处理；语音服务可能联网。',
    blocks: [
      { kind: 'p', text: '摄像头画面只在你的浏览器里被实时读取，用来计算手部关键点。AirDraw 不上传、不录制、不保存任何视频帧。' },
      { kind: 'p', text: 'AirDraw 不向外部服务发送摄像头数据。开启语音后，浏览器 SpeechRecognition 可能将麦克风音频发送到厂商语音服务，并非保证离线。作品与设置保存在本地；拒绝麦克风不会影响手势绘画。' },
      { kind: 'list', items: ['切换模式不重新申请摄像头权限；浏览器可能因权限设置或清理记录再次询问。', '随时可以在浏览器地址栏收回摄像头或麦克风权限。', '关闭语音会立即停止语音监听。'] },
    ],
  },
  {
    id:'voice',title:'语音助手',summary:'你好，AirDraw。说完唤醒，再说命令。',
    blocks:[
      {kind:'steps',items:['顶部麦克风单独开启，允许浏览器使用麦克风。','说“你好，AirDraw，打开画板”，或唤醒后在约8秒内说命令。','支持菜单、三种模式、玩具、翻页、撤销、保存、作品库、帮助、日夜、粗细、红色与蓝色。','清空先询问确认，再说“确认清空”或捏合确认；“取消”或超时退出。']},
      {kind:'p',text:'正在落笔时撤销和保存会等到当前笔结束。麦克风拒绝或不支持语音不影响手势。浏览器语音可能联网，Settings 可设置语言、唤醒词和静音反馈。'},
    ],
  },
  {
    id: 'troubleshoot',
    title: '故障排查',
    summary: '几种明确的失败状态和对应的恢复方法。',
    blocks: [
      {
        kind: 'table',
        head: ['提示', '恢复方法'],
        rows: [
          ['摄像头权限被拒绝', '点地址栏左侧图标 → 摄像头 → 允许 → 重试'],
          ['没有找到摄像头', '确认设备有摄像头且未被占用，然后重试'],
          ['摄像头正被其他应用使用', '关闭视频会议或相机应用后重试'],
          ['手部识别模型加载失败', '确认随应用部署的模型文件存在，或稍后重试'],
          ['当前地址无法使用摄像头', '改用 http://localhost 或 https 地址打开'],
        ],
      },
      { kind: 'p', text: '这些情况下 AirDraw 会停在说明页而不是空白画面，并提供「重试」按钮。' },
    ],
  },
];

export const GUIDE_SHORTCUT_SECTIONS = ['start', 'gestures', 'drawing', 'help', 'privacy'];

