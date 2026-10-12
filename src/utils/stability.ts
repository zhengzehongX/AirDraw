import { OUTLIER_HARD_STEP, OUTLIER_MAX_STREAK, PALM_SCALE_EMA, PALM_SCALE_MAX_CHANGE } from '../config';
import type { Point } from '../types/drawing';

/** CSS-pixel noise floor shared by the visible pointer and ink, independent of DPR.
 * Keep a fixed anchor while inside the disk: an EMA would keep drifting at rest.
 * Once intentional motion leaves the disk, accept the full position (no trailing offset).
 */
export class ScreenStabilizer {
  private anchor: { x: number; y: number } | null = null;
  constructor(private readonly radius = 2) {}
  reset(): void { this.anchor = null; }
  update(next: { x: number; y: number }): { x: number; y: number } {
    if (!this.anchor || Math.hypot(next.x-this.anchor.x,next.y-this.anchor.y)>this.radius) {
      this.anchor = { ...next };
    }
    return { ...this.anchor };
  }
}

function planeDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Joint guard against tracking glitches:
 *
 *  1. a single-frame step larger than `hardStep` is an outlier — the previous
 *     position is held instead of letting the pen teleport;
 *  2. several consecutive outliers mean a genuine jump (hand re-entering
 *     somewhere else), so the guard gives up and accepts the new position;
 *  3. steps that are large but plausible are clamped to a maximum speed, which
 *     turns a 1-frame spike into a short, smooth catch-up instead of a jump.
 */
export class VelocityLimiter {
  private prev: Point | null = null;
  private outlierStreak = 0;
  rejectedCount = 0;

  constructor(
    private readonly maxSpeed: number,
    private readonly hardStep: number = OUTLIER_HARD_STEP,
    private readonly maxStreak: number = OUTLIER_MAX_STREAK,
  ) {}

  get rejected(): number {
    return this.rejectedCount;
  }

  reset(point?: Point): void {
    this.prev = point ? { ...point } : null;
    this.outlierStreak = 0;
  }

  limit(next: Point, dtSeconds: number): Point {
    const prev = this.prev;
    if (!prev) {
      this.prev = { ...next };
      return { ...next };
    }

    const step = planeDistance(prev, next);

    if (step > this.hardStep) {
      this.rejectedCount += 1;
      this.outlierStreak += 1;
      if (this.outlierStreak >= this.maxStreak) {
        this.outlierStreak = 0;
        this.prev = { ...next };
        return { ...next };
      }
      return { ...prev };
    }

    this.outlierStreak = 0;
    const maxStep = this.maxSpeed * Math.min(Math.max(dtSeconds, 1 / 240), 1 / 15);
    if (step > maxStep && step > 1e-6) {
      const k = maxStep / step;
      const limited = {
        x: prev.x + (next.x - prev.x) * k,
        y: prev.y + (next.y - prev.y) * k,
        z: next.z,
      };
      this.prev = limited;
      return limited;
    }

    this.prev = { ...next };
    return { ...next };
  }
}

/**
 * Rate-clamped EMA for the palm-length reference. The pinch ratio divides by
 * this value, so one glitchy frame must not be able to rescale it instantly.
 */
export class PalmScaleSmoother {
  private value = 0;

  get current(): number {
    return this.value;
  }

  reset(): void {
    this.value = 0;
  }

  update(raw: number): number {
    if (!Number.isFinite(raw) || raw <= 0) return this.value;
    if (this.value === 0) {
      this.value = raw;
      return this.value;
    }
    const lo = this.value * (1 - PALM_SCALE_MAX_CHANGE);
    const hi = this.value * (1 + PALM_SCALE_MAX_CHANGE);
    const clamped = Math.min(Math.max(raw, lo), hi);
    this.value = PALM_SCALE_EMA * clamped + (1 - PALM_SCALE_EMA) * this.value;
    return this.value;
  }
}

/** Median of buffered plane points — used as the reset anchor on re-capture. */
export function medianPoint(points: readonly Point[]): Point {
  const xs = points.map((p) => p.x).sort((a, b) => a - b);
  const ys = points.map((p) => p.y).sort((a, b) => a - b);
  const zs = points.map((p) => p.z).sort((a, b) => a - b);
  const mid = Math.floor(points.length / 2);
  return { x: xs[mid], y: ys[mid], z: zs[mid] };
}
