/**
 * One Euro Filter (Casiez et al., CHI 2012).
 *
 * Adaptive low-pass: the cutoff rises with the speed of the signal, so slow
 * movement is heavily smoothed (no jitter on the drawn line) while fast
 * movement passes through almost unfiltered (no rubber-band lag). This is the
 * reason AirDraw can feel both steady and immediate.
 */

export type OneEuroOptions = {
  /** Minimum cutoff frequency in Hz. Lower = smoother at rest. */
  minCutoff?: number;
  /** Speed coefficient. Higher = less lag during fast movement. */
  beta?: number;
  /** Cutoff frequency for the derivative, in Hz. */
  dCutoff?: number;
};

const DEFAULTS: Required<OneEuroOptions> = {
  minCutoff: 1.4,
  beta: 0.02,
  dCutoff: 1.0,
};

function smoothingFactor(cutoffHz: number, dtSeconds: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSeconds);
}

export class OneEuroFilter {
  private minCutoff: number;
  private readonly beta: number;
  private readonly dCutoff: number;
  private gain = 1;

  private xPrev = 0;
  private dxPrev = 0;
  private tPrev = 0;
  private initialized = false;

  constructor(options: OneEuroOptions = {}) {
    const config = { ...DEFAULTS, ...options };
    this.minCutoff = config.minCutoff;
    this.beta = config.beta;
    this.dCutoff = config.dCutoff;
  }

  /**
   * Pointer Sensitivity setting: >1 tracks faster (less smoothing, more jitter),
   * <1 glides more. Clamped so a stray value can never disable filtering.
   */
  setResponsiveness(gain: number): void {
    this.gain = Math.min(Math.max(gain, 0.4), 2.5);
  }

  /**
   * Smoothing setting: the floor of the adaptive cutoff, in Hz. Below ~0.7 Hz a
   * resting hand visibly crawls after itself; above ~2.6 Hz its tremor gets drawn.
   */
  setMinCutoff(hz: number): void {
    this.minCutoff = Math.min(Math.max(hz, 0.6), 3);
  }

  /** @param tSeconds monotonic timestamp in seconds */
  filter(tSeconds: number, x: number): number {
    if (!this.initialized || !Number.isFinite(x)) {
      this.reset(x);
      return this.xPrev;
    }

    // Guard against a stalled tab (dt of minutes) and against duplicate stamps.
    const dt = Math.min(Math.max(tSeconds - this.tPrev, 1 / 240), 1 / 15);
    this.tPrev = tSeconds;

    const dx = (x - this.xPrev) / dt;
    const aD = smoothingFactor(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;

    const cutoff = (this.minCutoff + this.beta * Math.abs(dxHat)) * this.gain;
    const a = smoothingFactor(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;

    this.xPrev = xHat;
    this.dxPrev = dxHat;
    return xHat;
  }

  reset(x = 0): void {
    this.xPrev = x;
    this.dxPrev = 0;
    this.tPrev = 0;
    this.initialized = true;
  }

  get lastValue(): number {
    return this.xPrev;
  }
}

export class OneEuroFilter2D {
  private readonly x: OneEuroFilter;
  private readonly y: OneEuroFilter;

  constructor(options: OneEuroOptions = {}) {
    this.x = new OneEuroFilter(options);
    this.y = new OneEuroFilter(options);
  }

  filter(tSeconds: number, x: number, y: number): { x: number; y: number } {
    return { x: this.x.filter(tSeconds, x), y: this.y.filter(tSeconds, y) };
  }

  reset(x = 0, y = 0): void {
    this.x.reset(x);
    this.y.reset(y);
  }

  setResponsiveness(gain: number): void {
    this.x.setResponsiveness(gain);
    this.y.setResponsiveness(gain);
  }

  setMinCutoff(hz: number): void {
    this.x.setMinCutoff(hz);
    this.y.setMinCutoff(hz);
  }
}
