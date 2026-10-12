import type { QualityTier } from '../types/drawing';

/**
 * PlayLab quality ladder.
 *
 * The existing governor already picks high/medium/low for detection and ink; this
 * maps that onto per-toy GPU budgets. The rule is the same one the drawing path
 * follows: **the governor may only touch visuals, never recognition.** Dropping
 * a fluid grid is free; loosening the pinch threshold is how the last phase
 * shipped a pen that would not draw.
 */
export type QualityLevel = 'ultra' | 'high' | 'balanced' | 'performance';

export type QualityProfile = {
  /** GPU point count for particle toys. */
  particles: number;
  /** Edge length of the fluid simulation grid. */
  fluidResolution: number;
  /** Fluid Jacobi-ish passes per frame. */
  fluidPressurePasses: number;
  /** Vertex subdivisions per side of the water plane. */
  waterSegments: number;
  /** Extra arcs on the energy orb. */
  arcs: number;
  bloom: boolean;
  /** Environment cube resolution; 0 disables it. */
  envResolution: number;
  dprMax: number;
  /** Below this render fps the manager steps down; above the next one it steps up. */
  targetFps: number;
};

export const QUALITY_LEVELS: readonly QualityLevel[] = ['ultra', 'high', 'balanced', 'performance'];

export const QUALITY_PROFILES: Record<QualityLevel, QualityProfile> = {
  ultra: { particles: 90_000, fluidResolution: 256, fluidPressurePasses: 20, waterSegments: 220, arcs: 7, bloom: true, envResolution: 128, dprMax: 2, targetFps: 55 },
  high: { particles: 48_000, fluidResolution: 192, fluidPressurePasses: 16, waterSegments: 160, arcs: 5, bloom: true, envResolution: 64, dprMax: 1.75, targetFps: 50 },
  balanced: { particles: 24_000, fluidResolution: 128, fluidPressurePasses: 12, waterSegments: 110, arcs: 4, bloom: true, envResolution: 32, dprMax: 1.35, targetFps: 45 },
  performance: { particles: 9_000, fluidResolution: 96, fluidPressurePasses: 8, waterSegments: 64, arcs: 2, bloom: false, envResolution: 0, dprMax: 1, targetFps: 0 },
};

const FROM_TIER: Record<QualityTier, QualityLevel> = { high: 'high', medium: 'balanced', low: 'performance' };

export class QualityManager {
  private level: QualityLevel = 'high';
  private samples: number[] = [];
  private listeners = new Set<() => void>();
  /** Manual override from Settings; when set, the governor stands down. */
  locked: QualityLevel | null = null;

  get current(): QualityLevel {
    return this.locked ?? this.level;
  }

  get profile(): QualityProfile {
    return QUALITY_PROFILES[this.current];
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  private emit(): void {
    this.listeners.forEach((cb) => cb());
  }

  /** PlayLab follows the app's detection tier, then refines it per frame. */
  fromTier(tier: QualityTier): void {
    if (this.locked) return;
    if (tier === this.tier) return;
    this.tier = tier;
    const next = FROM_TIER[tier];
    if (next !== this.level) {
      this.level = next;
      this.emit();
    }
  }

  private tier: QualityTier | null = null;

  /**
   * Feed render fps once per second. Stepping down is quick (three low samples)
   * and stepping up is slow (twelve good ones), because a quality that bounces
   * back and forth is worse than a slightly plainer picture.
   */
  sample(fps: number): void {
    if (this.locked) return;
    this.samples.push(fps);
    if (this.samples.length > 12) this.samples.shift();
    const profile = QUALITY_PROFILES[this.current];
    if (this.samples.length < 3 || profile.targetFps === 0) return;
    const index = QUALITY_LEVELS.indexOf(this.current);
    if (this.samples.slice(-3).every((value) => value < profile.targetFps - 8) && index < QUALITY_LEVELS.length - 1) {
      this.samples = [];
      this.level = QUALITY_LEVELS[index + 1];
      this.emit();
      return;
    }
    const upgrade = QUALITY_LEVELS[index - 1];
    const headroom = this.samples.length >= 12 && !!upgrade && this.samples.every((value) => value > profile.targetFps + 4);
    if (headroom && upgrade) {
      this.samples = [];
      this.level = upgrade;
      this.emit();
    }
  }
}

export const quality = new QualityManager();
