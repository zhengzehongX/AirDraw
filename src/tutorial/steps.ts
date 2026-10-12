import type { GestureName } from '../types/drawing';

/**
 * The interactive tutorial: eleven lessons that are only passed by actually
 * doing them. Every `complete` predicate reads live tracking state, so the
 * coach cannot advance on a timer and cannot be fooled by an idle hand.
 */

export type TutorialSignal = {
  handPresent: boolean;
  /** How far the spatial cursor has travelled since the lesson began. */
  cursorMovedPx: number;
  /** Region id the user last confirmed with a pinch, since the lesson began. */
  activated: string | null;
  /** Strokes committed since the lesson began. */
  strokesCommitted: number;
  penDown: boolean;
  /** Latched: the pen was down at some point during this lesson. */
  penWasDown: boolean;
  dockOpen: boolean;
  colorChanged: boolean;
  widthChanged: boolean;
  undone: boolean;
  inspect: boolean;
  themeChanged: boolean;
};

export type TutorialStep = {
  id: string;
  title: string;
  body: string;
  /** Pose the glyph shows, and the fingers this lesson is really about. */
  pose: GestureName;
  highlight: Array<'index' | 'middle' | 'ring' | 'pinky' | 'thumb'>;
  /** A real control to ring-highlight, so the lesson points at the product. */
  target?: (s: TutorialSignal) => string | null;
  allowsDrawing: boolean;
  complete: (s: TutorialSignal) => boolean;
};

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'present',
    title: '把手放进画面',
    body: '掌心朝向摄像头，距离约 40–80 厘米。识别到之后我们开始。',
    pose: 'OPEN_PALM',
    highlight: ['index', 'middle', 'ring', 'pinky'],
    allowsDrawing: false,
    complete: (s) => s.handPresent,
  },
  {
    id: 'aim',
    title: '食指就是指针',
    body: '伸出食指，把手移到中间的光点周围，光标会跟着指尖走。',
    pose: 'POINT',
    highlight: ['index'],
    allowsDrawing: false,
    complete: (s) => s.cursorMovedPx > 140,
  },
  {
    id: 'select',
    title: '捏合就是确认',
    body: '把光标移到圆环里，拇指与食指捏合一下，再松开。',
    pose: 'PINCH',
    highlight: ['index', 'thumb'],
    target: () => 'tut-target',
    allowsDrawing: false,
    complete: (s) => s.activated === 'tut-target',
  },
  {
    id: 'draw',
    title: '捏住并移动，开始书写',
    body: '保持捏合，慢慢划一道线——笔迹会跟着指尖长出来。',
    pose: 'PINCH',
    highlight: ['index', 'thumb'],
    allowsDrawing: true,
    complete: (s) => s.strokesCommitted >= 1,
  },
  {
    id: 'lift',
    title: '松开就停笔',
    body: '再画一笔，然后张开手指。松开的一瞬间线条就收住了。',
    pose: 'OPEN_PALM',
    highlight: ['index', 'thumb'],
    allowsDrawing: true,
    complete: (s) => s.penWasDown && s.strokesCommitted >= 1 && !s.penDown,
  },
  {
    id: 'dock',
    title: '张开手掌，唤出工具',
    body: '五指张开保持一下，左侧会出现工具 Dock。',
    pose: 'OPEN_PALM',
    highlight: ['index', 'middle', 'ring', 'pinky', 'thumb'],
    allowsDrawing: false,
    complete: (s) => s.dockOpen,
  },
  {
    id: 'color',
    title: '选一个颜色',
    body: '捏合任意一颗颜色球，它会成为你下一笔的颜色。',
    pose: 'PINCH',
    highlight: ['index', 'thumb'],
    target: (s) => (s.dockOpen ? 'dock-color' : null),
    allowsDrawing: false,
    complete: (s) => s.colorChanged,
  },
  {
    id: 'size',
    title: '调整笔刷粗细',
    body: '打开 Size，捏住滑杆左右拖动，中间的预览会实时变化。',
    pose: 'PINCH',
    highlight: ['index', 'thumb'],
    target: (s) => (s.dockOpen ? 'dock-size' : null),
    allowsDrawing: false,
    complete: (s) => s.widthChanged,
  },
  {
    id: 'undo',
    title: '撤销一笔',
    body: '捏合 Undo，刚才那笔会收回去；再捏合 Redo 会回来。',
    pose: 'PINCH',
    highlight: ['index', 'thumb'],
    target: (s) => (s.dockOpen ? 'dock-undo' : null),
    allowsDrawing: false,
    complete: (s) => s.undone,
  },
  {
    id: 'view',
    title: '剪刀手，进入查看模式',
    body: '伸出食指和中指，保持约 0.4 秒。之后捏住并移动就能转动作品。',
    pose: 'VICTORY',
    highlight: ['index', 'middle'],
    allowsDrawing: false,
    complete: (s) => s.inspect,
  },
  {
    id: 'resume',
    title: '回到绘画',
    body: '再做一次剪刀手，退出查看模式。接着张开手，再捏合开始创作。',
    pose: 'VICTORY',
    highlight: ['index', 'middle'],
    allowsDrawing: false,
    complete: (s) => !s.inspect,
  },
];

export const TUTORIAL_DRAWING_STEPS: ReadonlySet<number> = new Set(
  TUTORIAL_STEPS.map((step, index) => (step.allowsDrawing ? index : -1)).filter((i) => i >= 0),
);
