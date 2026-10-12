import * as THREE from 'three';
import { PLAYLAB } from '../config';
import { arbitration } from '../interaction/GestureArbitration';
import { LabGestures } from '../hands/labGestures';
import { PalmSwipeDetector } from '../utils/gesture/PalmSwipeDetector';
import { loadToy, TOY_CARDS, TOY_ORDER } from './catalog';
import { quality, type QualityLevel } from './quality';
import { PlaygroundStateMachine, type LabSnapshot } from './state';
import type { Toy, ToyContext, ToyFrame, ToyId } from './types';
import type { DrawEngine } from '../engine/DrawEngine';
import type { HandFrame } from '../hands/handFrame';

/**
 * The PlayLab runtime: everything that is not React and not a shader.
 *
 * It owns the phase machine, the one toy that is currently live, the swipe
 * detector for the card rail and the high-level gesture stream — and it reads the
 * *same* engine frame the pen reads. Nothing here opens a camera, builds a
 * Hand Landmarker or creates a renderer; if a toy ever needs that, the contract is
 * wrong, not the toy.
 */
export type HubSnapshot = LabSnapshot & {
  /** −1..1 live travel of the rail while a swipe is in progress. */
  swipe: number;
  swipeState: string;
  /** Rail index the card is settling on. */
  index: number;
  loaded: boolean;
  error: string | null;
  interactive: boolean;
  /**
   * What the player can actually do right now, and why. The chrome shows one of
   * these five; none of them is allowed to be a spinner without a reason.
   */
  status: LabStatus;
  detail: string | null;
};

export type LabStatus = 'loading' | 'waiting' | 'ready' | 'paused' | 'failed';

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export class LabRuntime {
  readonly group = new THREE.Group();
  private machine = new PlaygroundStateMachine();
  private gestures = new LabGestures();
  private swipe = new PalmSwipeDetector();
  private toy: Toy | null = null;
  private toyRoot = new THREE.Group();
  private context: ToyContext | null = null;
  private listeners = new Set<() => void>();
  private snapshot: HubSnapshot = { phase: 'HUB', toy: null, pending: null, swipe: 0, swipeState: 'IDLE', index: 0, loaded: true, interactive: false, error: null, status: 'loading', detail: null };
  private index = 0;
  private idleFor = 0;
  /** Last frame's hand presence, kept for the status the chrome shows. */
  private lastPresent = false;
  private lastIdleFor = 0;
  /**
   * Whether a hand has been seen since this toy was entered. Until it has, the
   * honest message is "raise your hand", not "your hand went away".
   */
  private everPresent = false;
  /** Interpolated palm positions: detection is 18–30 Hz, the scene is 60 Hz. */
  private smooth = new Map<'primary' | 'secondary', THREE.Vector3>();
  private lastFrameEpoch = -1;
  private disposed = false;

  constructor(private engine: DrawEngine) {
    this.group.add(this.toyRoot);
    this.machine.subscribe((transition) => {
      if (transition.mounted) void this.mount(transition.mounted);
      if (transition.unmounted) void this.unmount();
    });
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  get state(): HubSnapshot {
    return this.snapshot;
  }

  get phase(): LabSnapshot['phase'] {
    return this.machine.snapshot.phase;
  }

  /** Which rail card is centred; the hub renders this without knowing the machine. */
  get cardIndex(): number {
    return this.index;
  }

  setActive(active: boolean): void {
    if (!active) {
      this.machine.toHub();
      if (this.snapshot.phase !== 'HUB') this.publish();
      return;
    }
    this.publish();
  }

  /** Enter a toy from the rail (or from a swipe landing on it). */
  request(toy: ToyId): void {
    this.index = TOY_ORDER.indexOf(toy);
    this.machine.request(toy);
    this.publish();
  }

  back(): void {
    this.machine.toHub();
    this.publish();
  }

  /**
   * Try the current toy again after a failed mount. The catalogue keeps the module,
   * so this rebuilds the toy's resources from scratch without touching the camera,
   * the renderer or the shared runtime.
   */
  retry(): void {
    const id = this.machine.snapshot.toy ?? TOY_ORDER[this.index];
    if (!id) return;
    this.error = null;
    void this.unmount().then(() => this.mount(id));
  }

  /** The rail's own navigation: one committed swipe moves exactly one card. */
  step(direction: -1 | 1): void {
    this.index = clamp(this.index + direction, 0, TOY_ORDER.length - 1) as number;
    this.publish();
  }

  private publish(): void {
    const machine = this.machine.snapshot;
    const status = this.statusFor(machine);
    this.snapshot = {
      ...machine,
      index: this.index,
      swipe: this.swipe.snapshot.progress,
      swipeState: this.swipe.snapshot.state,
      loaded: this.toy !== null,
      error: this.error,
      interactive: this.machine.interactive,
      status,
      detail: this.detailFor(status, machine.toy),
    };
    this.listeners.forEach((cb) => cb());
  }

  /** What is actually holding the toy back; the chrome already words the states. */
  private detailFor(status: LabStatus, toy: ToyId | null): string | null {
    if (status === 'failed') return this.error;
    if (status === 'loading') return toy ? TOY_CARDS[toy].titleZh : null;
    return null;
  }

  private statusFor(machine: LabSnapshot): LabStatus {
    if (this.error) return 'failed';
    if (machine.phase !== 'ACTIVE' || this.toy === null) return 'loading';
    if (!this.lastPresent) return this.everPresent && this.lastIdleFor * 1000 > PLAYLAB.handGraceMs ? 'paused' : 'waiting';
    return 'ready';
  }

  private async mount(id: ToyId): Promise<void> {
    if (this.mounting) return;
    this.mounting = true;
    this.everPresent = false;
    this.lastPresent = false;
    this.lastIdleFor = 0;
    try {
      const toy = await loadToy(id);
      if (this.disposed) {
        toy.dispose();
        return;
      }
      const ctx = this.contextFor(id);
      await toy.initialize?.(ctx);
      this.toy = toy;
      this.toyRoot.clear();
      this.toyRoot.add(toy.group);
      this.swipe.suppressed = false;
      toy.enter(ctx, 'first');
      this.error = null;
    } catch (cause) {
      // A toy that cannot mount must not take the lab down with it; the message is
      // surfaced in the chrome and in the DEV handle for the tests to read.
      this.error = cause instanceof Error ? cause.message : String(cause);
      console.error('[PlayLab]', id, cause);
    } finally {
      this.mounting = false;
    }
    this.publish();
  }

  private mounting = false;
  error: string | null = null;

  private async unmount(): Promise<void> {
    const toy = this.toy;
    if (!toy) return;
    this.toy = null;
    toy.exit?.();
    toy.dispose();
    this.toyRoot.clear();
    this.publish();
  }

  private contextFor(id: ToyId): ToyContext {
    if (!this.context) throw new Error('PlayLab runtime is not attached to a scene yet');
    // Read live: a context captured at attach time would freeze the quality tier
    // and every Settings change after it.
    return { ...this.context, id, quality: quality.current };
  }

  attach(ctx: ToyContext): void {
    this.context = ctx;
  }

  /** Toy Interaction Intensity from Settings — one place, both detectors. */
  setGestureIntensity(amount: number): void {
    this.gestures.setIntensity(amount);
    this.swipe.setIntensity(amount);
  }

  /** Particle and shader budget; `auto` lets the performance governor decide again. */
  setDetail(level: QualityLevel | null): void {
    if (quality.locked === level) return;
    quality.locked = level;
    // A toy sizes its buffers once, so the only honest way to apply a new budget
    // is to rebuild the toy that is on screen.
    if (level && this.machine.snapshot.phase === 'ACTIVE') this.retry();
  }

  /** One render frame: interpolate hands, feed the detectors, drive the toy. */
  update(dt: number, night: number, reducedMotion: boolean): void {
    const at = performance.now();
    const frame = this.frame(dt, at, night, reducedMotion);
    this.lastPresent = !!frame.primary;
    this.lastIdleFor = frame.idleFor;
    if (frame.primary) this.everPresent = true;
    const previousStatus = this.snapshot.status;
    this.machine.tick(at);
    const transition = this.machine.snapshot;
    if (transition.phase === 'ACTIVE' && this.toy === null && transition.toy) void this.mount(transition.toy);
    if (transition.phase === 'HUB' && this.toy !== null) void this.unmount();

    // The rail is the only place a page turn is legal, and never while something
    // else owns the hand (a grab, a press, a dialog, a lost hand).
    const railOpen = transition.phase === 'HUB';
    const enabled = railOpen && arbitration.swipeAllowed && !this.engine.debugInternals.locked;
    const direction = this.swipe.update(frame.primary, at, enabled);
    if (direction) this.step(direction === 'left' ? 1 : -1);
    if (railOpen && Math.abs(this.swipe.snapshot.progress) !== Math.abs(this.snapshot.swipe)) this.publish();

    if (this.toy && transition.phase !== 'HUB') {
      const events = this.gestures.update(frame);
      this.toy.onHandFrame?.(frame, this.contextFor(this.toy.id));
      this.toy.update(frame, this.contextFor(this.toy.id));
      for (const event of events) this.toy.onGesture?.(event, frame, this.contextFor(this.toy.id));
      if (frame.interactive && (frame.primary || frame.secondary)) arbitration.begin('toy');
      else arbitration.end('toy');
    } else {
      arbitration.end('toy');
    }

    if (
      this.snapshot.swipeState !== this.swipe.snapshot.state ||
      this.snapshot.phase !== transition.phase ||
      this.statusFor(transition) !== previousStatus
    ) {
      this.publish();
    }
  }

  private frame(dt: number, at: number, night: number, reducedMotion: boolean): ToyFrame {
    const source = this.engine.frame;
    const epochChanged = source.epoch !== this.lastFrameEpoch;
    this.lastFrameEpoch = source.epoch;
    if (epochChanged) this.smooth.clear();

    const hands = [source.primary, source.secondary] as (HandFrame | null)[];
    const [primary, secondary] = hands.map((hand) => (hand ? this.interpolate(this.displayHand(hand), dt) : null));
    const two = source.two && primary && secondary
      ? { ...source.two, direction:{...source.two.direction,x:-source.two.direction.x},twist:-source.two.twist,midpoint: this.mix(primary.palmCenter, secondary.palmCenter) }
      : null;

    const present = !!primary;
    this.idleFor = present ? 0 : this.idleFor + dt;
    const interactive = this.machine.interactive && present && !this.engine.debugInternals.locked;

    return {
      at,
      dt: clamp(dt, 0, 0.05),
      primary,
      secondary,
      two,
      pointer: this.engine.cursorPlanePoint() ?? { x: 0.5, y: 0.5, z: 0 },
      pinching: this.engine.contact.state === 'HOLD',
      interactive,
      quality: quality.current,
      night,
      reducedMotion,
      idleFor: this.idleFor,
    };
  }

  /**
   * Detection runs at 18–30 Hz and the scene at up to 60 Hz, so every hand
   * position is exponentially chased rather than snapped to the last sample. The
   * pinch *state* is never interpolated — a half-confirmed pinch is a bug.
   */
  private interpolate(hand: HandFrame, dt: number): HandFrame {
    let target = this.smooth.get(hand.role);
    if (!target) {
      target = new THREE.Vector3(hand.palmCenter.x, hand.palmCenter.y, 0);
      this.smooth.set(hand.role, target);
    }
    target.lerp(new THREE.Vector3(hand.palmCenter.x, hand.palmCenter.y, 0), Math.min(1, dt * 18));
    return { ...hand, palmCenter: { x: target.x, y: target.y, z: hand.palmCenter.z } };
  }
  /** Mirror once at the final presentation boundary; landmarks remain camera-standard. */
  private displayHand(hand:HandFrame):HandFrame{return {...hand,palmCenter:{...hand.palmCenter,x:1-hand.palmCenter.x},pinchPoint:{...hand.pinchPoint,x:1-hand.pinchPoint.x},palmVelocity:{...hand.palmVelocity,x:-hand.palmVelocity.x},palmAcceleration:{...hand.palmAcceleration,x:-hand.palmAcceleration.x}};}

  private mix(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number; z: number } {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: 0 };
  }

  /** Called when the tab hides or the user leaves PlayLab. */
  pause(): void {
    this.toy?.pause?.();
    this.gestures.reset();
    this.swipe.reset();
  }

  resume(): void {
    this.toy?.resume?.();
  }

  dispose(): void {
    this.disposed = true;
    this.toy?.dispose();
    this.toy = null;
    this.group.clear();
    this.listeners.clear();
  }
}

export const LAB_VOLUME = { width: 16, height: 9, depth: 3 };

/** Plane space (0..1, mirrored) → world, matching the ink scene's own mapping. */
export function labToWorld(point: { x: number; y: number; z: number }, depth = 0): { x: number; y: number; z: number } {
  return { x: (point.x - 0.5) * LAB_VOLUME.width, y: (0.5 - point.y) * LAB_VOLUME.height, z: depth + point.z * 0.35 };
}

export function cardFor(id: ToyId) {
  return TOY_CARDS[id];
}

export const LAB_SWITCH_LOCK_MS = PLAYLAB.switchLockMs;
