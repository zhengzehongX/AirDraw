import type { Camera, Group, Scene, WebGLRenderer } from 'three';
import type { Point } from '../types/drawing';
import type { FeedbackTone } from '../app/feedback';
import type { HandFrame, TwoHandFrame } from '../hands/handFrame';
import type { QualityLevel } from './quality';

/**
 * The PlayLab contract.
 *
 * A toy is a plugin, not a React component: it owns a `THREE.Group` and the GPU
 * resources inside it, and it is driven by one `update` per frame from the host.
 * That keeps the camera, the Hand Landmarker, the renderer, the theme and input
 * arbitration shared — five toys each opening their own stream was the failure
 * mode this contract exists to prevent.
 *
 * Lifecycle is strict and every hook must be safe to call twice:
 *   initialize → enter → (update | onHandFrame | onGesture)* → pause ⇄ resume →
 *   exit → …(re-enter)… → dispose
 * `dispose` is the only place that may free GPU memory, and it must not throw if
 * `initialize` never ran.
 */
export type ToyId = 'orb' | 'galaxy' | 'fluid' | 'ocean' | 'fireworks';

export type ToyCapability =
  | 'attract'
  | 'repel'
  | 'push'
  | 'pull'
  | 'pinch-grab'
  | 'pinch-throw'
  | 'trails'
  | 'vortex'
  | 'shapes'
  | 'two-hand-link'
  | 'two-hand-stretch'
  | 'two-hand-rotate'
  | 'two-hand-split'
  | 'two-hand-mix';

/** High-level, frame-integrated gestures. Nothing here may come from one sample. */
export type LabEvent =
  | 'PALM_SWIPE_LEFT'
  | 'PALM_SWIPE_RIGHT'
  | 'PALM_PUSH'
  | 'PALM_PULL'
  | 'PINCH_START'
  | 'PINCH_HOLD'
  | 'PINCH_MOVE'
  | 'PINCH_END'
  | 'HAND_OPEN'
  | 'HAND_CLOSE'
  | 'TWO_HAND_EXPAND'
  | 'TWO_HAND_CONTRACT'
  | 'TWO_HAND_ROTATE'
  | 'TWO_HAND_CLAP_NEAR'
  | 'TWO_HAND_SEPARATE'
  | 'TWO_HAND_ENERGY_LINK';

export type LabEventListener = (event: LabEvent, frame: ToyFrame) => void;
export type LabGestureSource = {
  handId: string; role: 'primary' | 'secondary'; sessionId: number;
  state: 'START' | 'HOLD' | 'MOVE' | 'END'; cancelled: boolean;
};

/** Everything a toy is told each frame. Read-only by convention. */
export type ToyFrame = {
  handEpoch?: number;
  gesture?: LabGestureSource;
  at: number;
  /** Seconds since the last update, clamped for tab switches. */
  dt: number;
  primary: HandFrame | null;
  secondary: HandFrame | null;
  two: TwoHandFrame | null;
  /** Smoothed pointer in plane space — where the cursor ring is. */
  pointer: Point;
  /** True while the contact detector holds a confirmed pinch. */
  pinching: boolean;
  /** False during the switch animation's dead beat, while idle, or when another owner holds input. */
  interactive: boolean;
  quality: QualityLevel;
  night: number;
  reducedMotion: boolean;
  /** 0..1 how long the hands have been away; toys use it to settle instead of snapping. */
  idleFor: number;
};

export type ToyContext = {
  id: ToyId;
  /** The toy adds everything it owns here; the host attaches/detaches the group. */
  root: Group;
  scene: Scene;
  camera: Camera;
  renderer: WebGLRenderer;
  /** Playable volume in world units, centred on the origin. */
  volume: { width: number; height: number; depth: number };
  /** Plane space (0..1, mirrored) → world position at the given depth. */
  toWorld: (point: Point, depth?: number) => { x: number; y: number; z: number };
  quality: QualityLevel;
  notify: (message: string, tone?: FeedbackTone) => void;
  /** For toys that want to react to their own effects (e.g. a shell that landed). */
  emit: (event: LabEvent) => void;
};

export type ToyPreview = 'orb' | 'points' | 'fluid' | 'water' | 'sparks';

export type Toy = {
  id: ToyId;
  /** The toy's own scene graph; the host mounts and unmounts this one node. */
  group: Group;
  title: string;
  titleZh: string;
  description: string;
  /** Cheap procedural card art: the hub never mounts a toy to preview it. */
  thumbnail: { accent: string; preview: ToyPreview };
  capabilities: readonly ToyCapability[];
  supportsTwoHands: boolean;
  qualityLevels: readonly QualityLevel[];
  /** One line of teaching per first visit, driven by real gesture state. */
  lesson: { prompt: string; done: LabEvent | 'ANY_TOUCH'; seconds: number };
  initialize?(ctx: ToyContext): void | Promise<void>;
  enter(ctx: ToyContext, reason: 'first' | 'return'): void;
  update(frame: ToyFrame, ctx: ToyContext): void;
  onHandFrame?(frame: ToyFrame, ctx: ToyContext): void;
  onGesture?(event: LabEvent, frame: ToyFrame, ctx: ToyContext): void;
  pause?(): void;
  resume?(): void;
  exit?(): void;
  dispose(): void;
};
