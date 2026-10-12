import { LAB_GESTURES } from '../config';
import type { ToyFrame } from '../playlab/types';
import type { LabEvent, LabGestureSource } from '../playlab/types';

/**
 * High-level gesture events.
 *
 * Toys should not each re-derive "did the user open their hand" — five copies of
 * that logic is five ways to disagree about what the same hand is doing. Every
 * event here is produced from consecutive frames with hysteresis and a minimum
 * hold, because a single monocular sample is noise, and one-shot thresholds are
 * how a phase ends with effects that fire on nothing.
 *
 * `update` returns what fired this frame so the host can dispatch it; it also
 * keeps the previous state, so calling it twice with the same frame is safe.
 */
export type LabGestureListener = (event: LabEvent, frame: ToyFrame) => void;

const TWO = {
  /** Both hands must hold still-and-visible for this long before two-hand events start. */
  engageMs: 200,
  /** …and stay gone for longer than this before the pair is dropped (hysteresis). */
  releaseMs: 420,
};

export class LabGestures {
  private listeners = new Set<LabGestureListener>();
  private sessions = new Map<'primary' | 'secondary', { id: string; sessionId: number; point: { x: number; y: number; z: number } }>();
  private blocked = new Map<'primary' | 'secondary', string>();
  private nextSession = 0;
  private open = false;
  private openFrames = 0;
  private widthReference = 0;
  private pushAt = 0;
  private twoEngagedAt = 0;
  private twoLostAt = 0;
  private twoActive = false;
  private twistReference = 0;
  private nearSince = 0;
  private wasNear = false;
  private linked = false;
  private rotating = false;
  private lastExpand = 0;

  subscribe(listener: LabGestureListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Toy Interaction Intensity from Settings. Only the *motion* gates move: how far
   * a pinch has to travel, how much a palm has to change size. Reliability gates —
   * confirm frames, openness levels — deliberately do not, because the middle of
   * the range must reproduce the shipped tuning exactly and no setting may make
   * recognition less trustworthy.
   */
  setIntensity(amount: number): void {
    this.gain = Math.round((0.7 + Math.min(Math.max(amount, 0), 1) * 0.6) * 1000) / 1000;
  }

  /** What the running gates are scaled by — 1 is the shipped tuning. */
  get intensity(): number {
    return this.gain;
  }

  private gain = 1;
  private gate(base: number): number {
    return base / this.gain;
  }

  /** Forget everything; used when the hands leave or a toy is switched. */
  reset(): void {
    for (const [role, session] of this.sessions) {
      this.notify('PINCH_END', { ...this.lastFrame, gesture: { handId: session.id, role, sessionId: session.sessionId, state: 'END', cancelled: true } });
      this.blocked.set(role, session.id);
    }
    this.sessions.clear();
    this.open = false;
    this.openFrames = 0;
    this.widthReference = 0;
    this.twoActive = false;
    this.twoEngagedAt = 0;
    this.twistReference = 0;
    this.nearSince = 0;
    this.wasNear = false;
    this.linked = false;
  }

  private lastFrame: ToyFrame = {
    at: 0, dt: 0, primary: null, secondary: null, two: null,
    pointer: { x: 0, y: 0, z: 0 }, pinching: false, interactive: false,
    quality: 'high', night: 0, reducedMotion: false, idleFor: 0,
  };

  private notify(event: LabEvent, frame: ToyFrame): void {
    this.listeners.forEach((listener) => listener(event, frame));
  }

  /**
   * Consume one frame and return the events that fired. Events are also pushed to
   * subscribers, so a caller may ignore the array; the return value exists so the
   * state machine can be asserted in Node without a renderer.
   */
  update(frame: ToyFrame): LabEvent[] {
    this.lastFrame = frame;
    const fired: LabEvent[] = [];
    const emit = (event: LabEvent, source?: LabGestureSource) => {
      fired.push(event);
      this.notify(event, source ? { ...frame, gesture: source } : frame);
    };

    // Separate lifecycle and cancellation fence for each tracked hand.
    for (const role of ['primary', 'secondary'] as const) {
      const h = frame[role], id = h ? String(frame.handEpoch ?? 0) + ':' + h.handedness : '';
      const held = h?.pinchState === 'HOLD';
      let session = this.sessions.get(role);
      if (session && (!h || id !== session.id || !frame.interactive || !held)) {
        const cancelled = !h || id !== session.id || !frame.interactive;
        emit('PINCH_END', { handId: session.id, role, sessionId: session.sessionId, state: 'END', cancelled });
        this.sessions.delete(role); session = undefined;
        if (cancelled) this.blocked.set(role, id || 'lost');
      }
      if (!frame.interactive || this.blocked.has(role) && this.blocked.get(role) !== id) this.blocked.set(role, id || 'lost');
      if (h && !held && (h.pinchState === 'OPEN' || h.pinchState === 'RELEASE')) this.blocked.delete(role);
      if (!h || !held || !frame.interactive || this.blocked.has(role)) continue;
      if (!session) {
        session = { id, sessionId: ++this.nextSession, point: { ...h.pinchPoint } };
        this.sessions.set(role, session);
        emit('PINCH_START', { handId: id, role, sessionId: session.sessionId, state: 'START', cancelled: false });
      } else {
        const step = Math.hypot(h.pinchPoint.x - session.point.x, h.pinchPoint.y - session.point.y);
        session.point = { ...h.pinchPoint };
        const moving = step > this.gate(LAB_GESTURES.movePalmFraction) * h.palmWidth;
        emit(moving ? 'PINCH_MOVE' : 'PINCH_HOLD', { handId: id, role, sessionId: session.sessionId, state: moving ? 'MOVE' : 'HOLD', cancelled: false });
      }
    }
    if (!frame.interactive) return fired;

    const hand = frame.primary;
    if (hand) {
      // ── open / close, with a small frame count so a one-frame misread cannot fire.
      const wantOpen = hand.openness >= LAB_GESTURES.openAt;
      const wantClosed = hand.openness <= LAB_GESTURES.closedAt;
      if (wantOpen && !this.open) this.openFrames += 1;
      else if (wantClosed && this.open) this.openFrames -= 1;
      else this.openFrames = Math.max(0, this.openFrames);
      if (!this.open && this.openFrames >= LAB_GESTURES.confirmFrames) {
        this.open = true;
        this.openFrames = 0;
        emit('HAND_OPEN');
      } else if (this.open && this.openFrames <= -LAB_GESTURES.confirmFrames) {
        this.open = false;
        this.openFrames = 0;
        emit('HAND_CLOSE');
      }

      // ── push / pull: a hand coming closer widens its palm. Compare against a slow
      //    reference rather than the previous frame, which is mostly jitter.
      if (!this.widthReference) this.widthReference = hand.palmWidth;
      const ratio = hand.palmWidth / this.widthReference;
      this.widthReference += (hand.palmWidth - this.widthReference) * LAB_GESTURES.widthFollow;
      if (frame.at - this.pushAt > LAB_GESTURES.pushCooldownMs && hand.isStable) {
        if (ratio > 1 + this.gate(LAB_GESTURES.pushRatio)) {
          this.pushAt = frame.at;
          emit('PALM_PULL');
        } else if (ratio < 1 - this.gate(LAB_GESTURES.pushRatio)) {
          this.pushAt = frame.at;
          emit('PALM_PUSH');
        }
      }
    }

    // ── two-hand pair, gated by an engage/release window on both hands.
    const both = !!frame.two?.active && !!frame.primary && !!frame.secondary;
    if (both) {
      if (!this.twoActive) {
        if (!this.twoEngagedAt) this.twoEngagedAt = frame.at;
        if (frame.at - this.twoEngagedAt >= TWO.engageMs) {
          this.twoActive = true;
          this.twistReference = 0;
        }
      }
      this.twoLostAt = 0;
    } else if (this.twoActive) {
      this.twoLostAt = this.twoLostAt || frame.at;
      if (frame.at - this.twoLostAt > TWO.releaseMs) {
        this.twoActive = false;
        this.twoEngagedAt = 0;
        this.linked = false;
        this.wasNear = false;
      }
    }

    const two = frame.two;
    if (this.twoActive && two && frame.primary && frame.secondary) {
      const palm = Math.max((frame.primary.palmWidth + frame.secondary.palmWidth) / 2, 1e-4);
      const distance = two.distance / palm;

      // Continuous separation reads as a pulse every few hundred ms, which is what
      // a toy wants while the hands keep drifting apart.
      if (Math.abs(two.separationVelocity) > this.gate(LAB_GESTURES.expandSpeed) && frame.at - this.lastExpand > LAB_GESTURES.expandCooldownMs) {
        this.lastExpand = frame.at;
        emit(two.separationVelocity > 0 ? 'TWO_HAND_EXPAND' : 'TWO_HAND_CONTRACT');
      }

      if (!this.twistReference) this.twistReference = Math.atan2(two.direction.y, two.direction.x);
      const deviation = Math.atan2(
        Math.sin(Math.atan2(two.direction.y, two.direction.x) - this.twistReference),
        Math.cos(Math.atan2(two.direction.y, two.direction.x) - this.twistReference),
      );
      if (!this.rotating && Math.abs(deviation) > this.gate(LAB_GESTURES.rotateRad)) {
        this.rotating = true;
        emit('TWO_HAND_ROTATE');
      } else if (this.rotating && Math.abs(deviation) < LAB_GESTURES.rotateRad * 0.5) this.rotating = false;

      const near = distance < LAB_GESTURES.nearPalms;
      if (near) {
        if (!this.nearSince) this.nearSince = frame.at;
        if (!this.wasNear && frame.at - this.nearSince >= LAB_GESTURES.nearHoldMs) {
          this.wasNear = true;
          emit('TWO_HAND_CLAP_NEAR');
        }
      } else {
        this.nearSince = 0;
        if (this.wasNear && distance > LAB_GESTURES.farPalms) {
          this.wasNear = false;
          emit('TWO_HAND_SEPARATE');
        }
      }

      const link = !near && distance <= LAB_GESTURES.linkPalms && frame.primary.openness >= 0.5 && frame.secondary.openness >= 0.5;
      if (link && !this.linked) {
        this.linked = true;
        emit('TWO_HAND_ENERGY_LINK');
      } else if (!link) this.linked = false;
    }

    return fired;
  }
}
