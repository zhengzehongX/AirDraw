import { PINCH_CONFIRM_FRAMES, PINCH_FILTER_ALPHA, PINCH_RELEASE_RATIO, PINCH_START_RATIO } from '../../config';

export type PinchDetectorOptions = {
  /** Ratio below which the pen goes down. */
  startThreshold?: number;
  /** Ratio above which the pen lifts. Must be > startThreshold. */
  releaseThreshold?: number;
  /** Consecutive frames required to flip state (kills single-frame glitches). */
  confirmFrames?: number;
  /** EMA alpha applied to the raw ratio before thresholding. */
  smoothingAlpha?: number;
};

/**
 * Hysteresis state machine for "thumb + index pinched".
 *
 * A single threshold would chatter: fingertip jitter crosses it constantly, so
 * the pen would tap on and off mid-stroke. Two thresholds plus a frame counter
 * mean the state only flips on a deliberate change of hand shape.
 */
export class PinchDetector {
  private readonly baseStart: number;
  private readonly baseRelease: number;
  private startThreshold: number;
  private releaseThreshold: number;
  private readonly confirmFrames: number;
  private readonly smoothingAlpha: number;

  private smoothed = Number.NaN;
  private active = false;
  private pending = 0;
  private strength = 0;

  constructor(options: PinchDetectorOptions = {}) {
    this.baseStart = options.startThreshold ?? PINCH_START_RATIO;
    this.baseRelease = options.releaseThreshold ?? PINCH_RELEASE_RATIO;
    this.startThreshold = this.baseStart;
    this.releaseThreshold = this.baseRelease;
    this.confirmFrames = Math.max(1, options.confirmFrames ?? PINCH_CONFIRM_FRAMES);
    this.smoothingAlpha = options.smoothingAlpha ?? PINCH_FILTER_ALPHA;
  }

  /**
   * Pinch Threshold Assist (0 = off, 1 = easiest): raises both thresholds so a
   * near-touch registers as a pinch, for users whose thumb and index finger
   * never appear fully closed to the camera. The hysteresis band is preserved,
   * so enabling assist can never make the pen chatter.
   */
  setAssist(amount: number): void {
    const k = Math.min(Math.max(amount, 0), 1);
    this.startThreshold = this.baseStart + k * 0.12;
    this.releaseThreshold = Math.max(this.startThreshold + 0.12, this.baseRelease + k * 0.06);
  }

  get thresholds(): { start: number; release: number } {
    return { start: this.startThreshold, release: this.releaseThreshold };
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Smoothed ratio, for the debug panel. */
  get value(): number {
    return this.smoothed;
  }

  /** 0 (open) → 1 (pinched), for cursor visuals. */
  get pinchStrength(): number {
    return this.strength;
  }

  /** @param ratio scale-invariant pinch ratio; pass null when the hand is not visible */
  update(ratio: number | null): boolean {
    if (ratio === null || !Number.isFinite(ratio)) {
      this.pending = 0;
      return this.active;
    }

    this.smoothed = Number.isNaN(this.smoothed)
      ? ratio
      : this.smoothingAlpha * ratio + (1 - this.smoothingAlpha) * this.smoothed;

    const span = Math.max(this.releaseThreshold - this.startThreshold, 1e-4);
    this.strength = clamp01((this.releaseThreshold - this.smoothed) / span);

    const wantsActive = this.active
      ? this.smoothed < this.releaseThreshold
      : this.smoothed < this.startThreshold;

    if (wantsActive !== this.active) {
      this.pending += 1;
      if (this.pending >= this.confirmFrames) {
        this.active = wantsActive;
        this.pending = 0;
      }
    } else {
      this.pending = 0;
    }

    return this.active;
  }

  reset(): void {
    this.smoothed = Number.NaN;
    this.active = false;
    this.pending = 0;
    this.strength = 0;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
