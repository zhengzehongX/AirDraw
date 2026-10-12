import { PLAYLAB } from '../config';
import type { ToyId } from './types';

/**
 * Where PlayLab is in its own little world: the card rail, flying into a toy,
 * playing with it, or moving to the next toy.
 *
 * Two rules matter more than the rest. A switch may be interrupted at any point
 * and only the **last** requested toy survives — five queued animations would
 * each have to be mounted and disposed. And for the first slice of a switch, no
 * new grabbing or effect triggers are accepted, while the hand cursor keeps
 * moving: the user must never feel like the camera stopped listening.
 */
export type LabPhase = 'HUB' | 'ENTERING' | 'ACTIVE' | 'EXITING' | 'SWITCHING';

export type LabSnapshot = {
  phase: LabPhase;
  /** The toy the user is looking at, or the one still on the way out. */
  toy: ToyId | null;
  /** The toy being switched to, if different from `toy`. */
  pending: ToyId | null;
};

export type LabTransition = { mounted: ToyId | null; unmounted: ToyId | null } | null;

export class PlaygroundStateMachine {
  private phase: LabPhase = 'HUB';
  private current: ToyId | null = null;
  private pending: ToyId | null = null;
  private started = 0;
  private listeners = new Set<(transition: NonNullable<LabTransition>) => void>();

  subscribe(cb: (transition: NonNullable<LabTransition>) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  get snapshot(): LabSnapshot {
    return { phase: this.phase, toy: this.current, pending: this.pending };
  }

  get progress(): number {
    if (this.phase === 'ACTIVE' || this.phase === 'HUB') return 1;
    return Math.min(1, (performance.now() - this.started) / PLAYLAB.switchMs);
  }

  /** Can the toy accept a new grab or effect right now? */
  get interactive(): boolean {
    return this.phase === 'ACTIVE';
  }

  request(toy: ToyId, at = performance.now()): void {
    if (this.phase === 'ACTIVE' && this.current === toy) return;
    if (this.phase === 'ENTERING' || this.phase === 'SWITCHING') {
      // Replace the destination; the timer restarts so the final toy gets its
      // whole entrance instead of finishing mid-flight.
      this.pending = toy;
      this.started = at;
      return;
    }
    this.pending = toy;
    this.phase = this.current ? 'SWITCHING' : 'ENTERING';
    this.started = at;
  }

  toHub(at = performance.now()): void {
    if (this.phase === 'HUB') return;
    if (this.phase === 'ENTERING') {
      // Never actually arrived: collapse straight back to the rail.
      this.pending = null;
      this.phase = 'HUB';
      this.started = at;
      this.emit({ mounted: null, unmounted: this.current });
      this.current = null;
      return;
    }
    this.phase = 'EXITING';
    this.started = at;
  }

  /** Advance time-based transitions; returns what the host must mount/unmount. */
  tick(at = performance.now()): LabTransition {
    if (this.phase === 'ACTIVE' || this.phase === 'HUB' || this.phase === 'EXITING') {
      if (this.phase === 'EXITING' && at - this.started >= PLAYLAB.switchMs * 0.7) {
        const outgoing = this.current;
        this.current = null;
        this.pending = null;
        this.phase = 'HUB';
        this.started = at;
        const transition = { mounted: null, unmounted: outgoing };
        this.emit(transition);
        return transition;
      }
      return null;
    }
    if (at - this.started < PLAYLAB.switchMs) return null;
    const outgoing = this.phase === 'SWITCHING' ? this.current : null;
    this.current = this.pending;
    this.pending = null;
    this.phase = 'ACTIVE';
    this.started = at;
    const transition = { mounted: this.current, unmounted: outgoing };
    this.emit(transition);
    return transition;
  }

  private emit(transition: NonNullable<LabTransition>): void {
    this.listeners.forEach((cb) => cb(transition));
  }
}
