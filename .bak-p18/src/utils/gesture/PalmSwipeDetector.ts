import { PALM_SWIPE } from '../../config';
import type { Point } from '../../types/drawing';
import type { HandFrame } from '../../hands/handFrame';

/**
 * Palm swipe → page turn.
 *
 * Deliberately a six-state machine rather than "the wrist moved right fast":
 * a single-frame position is mostly monocular noise, and a page that flips on
 * noise makes every other gesture untrustworthy. So the hand must first *prove*
 * it is open, facing the camera and still (ARMED), then travel a distance
 * measured in its own palm widths (scale-invariant: it works close to and far
 * from the camera), in one direction, at a real speed, within a time window.
 *
 * `progress` is published while tracking, which is what lets the hub card follow
 * the hand live instead of snapping after a commit.
 */
export type SwipeState = 'IDLE' | 'ARMED' | 'TRACKING' | 'COMMIT' | 'CANCEL' | 'COOLDOWN';
export type SwipeDirection = 'left' | 'right';
export type SwipeReason =
  | 'idle'
  | 'locked'
  | 'closed'
  | 'edge-on'
  | 'unstable'
  | 'arm-hold'
  | 'tracking'
  | 'too-short'
  | 'too-slow'
  | 'reversed'
  | 'vertical'
  | 'too-long'
  | 'pinch'
  | 'lost'
  | 'committed'
  | 'cooldown';

export type SwipeSnapshot = {
  state: SwipeState;
  /** −1..1 travel against the commit threshold — drives the live card offset. */
  progress: number;
  /** Travel in palm widths, signed, for diagnostics. */
  travel: number;
  direction: SwipeDirection | null;
  reason: SwipeReason;
};

const clamp = (value: number, low = -1, high = 1) => Math.min(high, Math.max(low, value));

export class PalmSwipeDetector {
  private state: SwipeState = 'IDLE';
  private reason: SwipeReason = 'idle';
  private armedSince = 0;
  private startedAt = 0;
  private origin: Point | null = null;
  private previous: Point | null = null;
  private direction: SwipeDirection | null = null;
  private travel = 0;
  private progress = 0;
  private path = 0;
  private vertical = 0;
  private peak = 0;
  private reversePath = 0;
  private cooldownUntil = 0;
  private blockedUntil = 0;
  /** Set by the hub for the duration of a switch so one wave cannot start a second one. */
  suppressed = false;

  get snapshot(): SwipeSnapshot {
    return { state: this.state, progress: this.progress, travel: this.travel, direction: this.direction, reason: this.reason };
  }

  reset(reason: SwipeReason = 'idle'): void {
    this.state = 'IDLE';
    this.reason = reason;
    this.armedSince = 0;
    this.blockedUntil = 0;
    this.clear();
  }

  private clear(): void {
    this.origin = null;
    this.previous = null;
    this.direction = null;
    this.travel = 0;
    this.progress = 0;
    this.path = 0;
    this.vertical = 0;
    this.peak = 0;
    this.reversePath = 0;
  }

  /** Required travel in plane units: palm widths, but never more than a share of the frame. */
  private requiredWidth(palmWidth: number): number {
    return Math.max(0.04, Math.min((PALM_SWIPE.distancePalms / this.gain) * palmWidth, PALM_SWIPE.distanceFrame));
  }

  /**
   * Toy Interaction Intensity: how much travel a page turn needs. 0.5 is the
   * shipped tuning and leaves the detector exactly as tuned.
   */
  setIntensity(amount: number): void {
    this.gain = Math.round((0.7 + Math.min(Math.max(amount, 0), 1) * 0.6) * 1000) / 1000;
  }

  /** What the travel requirement is divided by — 1 is the shipped tuning. */
  get intensity(): number {
    return this.gain;
  }

  private gain = 1;

  private cancel(reason: SwipeReason, at: number): null {
    this.reason = reason;
    this.clear();
    // A cancelled attempt must cool off too: without this, a back-and-forth wave
    // simply re-arms 140 ms later and commits on its final leg.
    this.state = 'CANCEL';
    this.blockedUntil = at + PALM_SWIPE.cancelMs;
    this.armedSince = 0;
    return null;
  }

  /**
   * Feed one detection tick. `enabled` is the arbitration question: is a page turn
   * legal right now (hub / gallery / tutorial, and nothing else holding input)?
   * Returns the committed direction exactly once per swipe.
   */
  update(frame: HandFrame | null, at: number, enabled: boolean): SwipeDirection | null {
    if (at < this.cooldownUntil) {
      if (this.state !== 'COOLDOWN') {
        this.state = 'COOLDOWN';
        this.reason = 'cooldown';
        this.clear();
      }
      return null;
    }
    if (at < this.blockedUntil) {
      if (this.state !== 'CANCEL') {
        this.state = 'CANCEL';
        this.clear();
      }
      return null;
    }
    if (!enabled || this.suppressed) {
      // Not a cancel — the swipe simply does not exist here. Drawing, a model grab
      // or an open dialog keeps the input, and the page never moves.
      if (this.state !== 'IDLE') this.reset('locked');
      return null;
    }
    if (!frame) {
      if (this.state === 'TRACKING') return this.cancel('lost', at);
      if (this.state !== 'IDLE') this.reset('lost');
      return null;
    }
    if (!frame.isStable) {
      if (this.state === 'TRACKING') return this.cancel('unstable', at);
      if (this.state !== 'IDLE') this.reset('unstable');
      return null;
    }

    const pinching = frame.pinchState === 'CONTACT' || frame.pinchState === 'HOLD';
    if (pinching) {
      // A pinch belongs to the toy or the control under the finger, never the page.
      if (this.state === 'TRACKING') return this.cancel('pinch', at);
      if (this.state !== 'IDLE') this.reset('pinch');
      return null;
    }
    if (frame.openness < PALM_SWIPE.minOpenness) {
      if (this.state === 'TRACKING') return this.cancel('closed', at);
      if (this.state !== 'IDLE') this.reset('closed');
      return null;
    }
    if (frame.facing < PALM_SWIPE.minFacing) {
      if (this.state === 'TRACKING') return this.cancel('edge-on', at);
      if (this.state !== 'IDLE') this.reset('edge-on');
      return null;
    }

    switch (this.state) {
      case 'IDLE':
        this.armedSince = at;
        this.state = 'ARMED';
        this.reason = 'arm-hold';
        this.origin = frame.palmCenter;
        this.previous = frame.palmCenter;
        return null;

      case 'ARMED': {
        // Re-anchor while holding still: the hand may drift, only its travel counts.
        this.origin = frame.palmCenter;
        this.previous = frame.palmCenter;
        if (at - this.armedSince < PALM_SWIPE.armMs) return null;
        this.state = 'TRACKING';
        this.startedAt = at;
        this.reason = 'tracking';
        return null;
      }

      case 'TRACKING': {
        const width = Math.max(frame.palmWidth, 1e-4);
        const stepX = frame.palmCenter.x - (this.previous?.x ?? frame.palmCenter.x);
        const origin = this.origin ?? frame.palmCenter;
        this.previous = frame.palmCenter;
        this.path += Math.abs(stepX);
        this.travel = (frame.palmCenter.x - origin.x) / width;
        this.vertical = Math.max(this.vertical, Math.abs((frame.palmCenter.y - origin.y) / width));

        const required = this.requiredWidth(width);
        const span = Math.max(0.01, required / width - PALM_SWIPE.followDeadZone);
        this.progress = Math.sign(this.travel) * clamp((Math.abs(this.travel) - PALM_SWIPE.followDeadZone) / span, 0, 1);

        const signed: SwipeDirection = this.travel < 0 ? 'left' : 'right';
        if (!this.direction && Math.abs(this.travel) >= 0.8) this.direction = signed;
        this.peak = Math.max(this.peak, Math.abs(this.travel));
        if (this.direction) {
          // Travel against the locked direction: a hand that swings back a good
          // share of the way it came is waving, not turning a page — even when it
          // never crosses the point it started from.
          const against = (this.direction === 'left' ? stepX > 0 : stepX < 0) ? Math.abs(stepX) / width : 0;
          this.reversePath += against;
          if (this.reversePath >= PALM_SWIPE.reverseShare * this.peak) return this.cancel('reversed', at);
        }

        const elapsed = at - this.startedAt;
        const reached = Math.abs(this.travel) * width >= required;
        if (!reached) {
          if (elapsed > PALM_SWIPE.maxMs) return this.cancel('too-long', at);
          this.reason = elapsed < PALM_SWIPE.minMs ? 'too-short' : 'tracking';
          return null;
        }
        // Far enough but drifted there: a hand walked sideways is not a page turn.
        if (elapsed < PALM_SWIPE.minMs || Math.abs(this.travel) / (elapsed / 1000) < PALM_SWIPE.minSpeed) {
          if (elapsed > PALM_SWIPE.maxMs) return this.cancel('too-long', at);
          this.reason = 'too-slow';
          return null;
        }
        if (this.vertical > PALM_SWIPE.maxVerticalDrift * Math.abs(this.travel)) return this.cancel('vertical', at);
        if (this.path > 1e-9 && Math.abs(this.travel) * width / this.path < PALM_SWIPE.directionConsistency) return this.cancel('reversed', at);

        const committed = this.direction ?? signed;
        this.state = 'COMMIT';
        this.reason = 'committed';
        this.cooldownUntil = at + PALM_SWIPE.cooldownMs;
        this.progress = committed === 'left' ? -1 : 1;
        this.direction = null;
        this.origin = null;
        this.previous = null;
        this.path = 0;
        this.vertical = 0;
        return committed;
      }

      default:
        this.reset();
        return null;
    }
  }
}
