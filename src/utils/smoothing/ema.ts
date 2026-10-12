/**
 * Exponential moving average. Cheapest jitter reducer; use OneEuroFilter when
 * you need low latency during fast movement.
 */
export class EmaFilter {
  private value = 0;
  private initialized = false;

  constructor(
    private alpha: number,
    initial?: number,
  ) {
    if (initial !== undefined) {
      this.value = initial;
      this.initialized = true;
    }
  }

  get current(): number {
    return this.value;
  }

  filter(next: number): number {
    if (!this.initialized) {
      this.value = next;
      this.initialized = true;
    } else {
      this.value = this.alpha * next + (1 - this.alpha) * this.value;
    }
    return this.value;
  }

  reset(next?: number): void {
    this.initialized = next !== undefined;
    this.value = next ?? 0;
  }
}

export class EmaFilter2D {
  private x: EmaFilter;
  private y: EmaFilter;

  constructor(alpha: number) {
    this.x = new EmaFilter(alpha);
    this.y = new EmaFilter(alpha);
  }

  filter(x: number, y: number): { x: number; y: number } {
    return { x: this.x.filter(x), y: this.y.filter(y) };
  }

  reset(): void {
    this.x.reset();
    this.y.reset();
  }
}

/**
 * Frame-rate independent alpha for "reach the target with time constant tau"
 * smoothing: usable when dt varies between frames.
 */
export function alphaFor(dtSeconds: number, tauSeconds: number): number {
  if (tauSeconds <= 0) return 1;
  return 1 - Math.exp(-dtSeconds / tauSeconds);
}
