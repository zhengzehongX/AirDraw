import { useEffect, useRef } from 'react';
import type { EngineMetrics, QualityTier } from '../types/drawing';

type GovernorState = {
  lowStreak: number;
  highStreak: number;
};

const ORDER: QualityTier[] = ['high', 'medium', 'low'];

/**
 * Watches the effective frame rate (the slower of main-thread rAF and the 3D
 * scene loop) and walks the quality tiers with hysteresis: several seconds of
 * headroom are required before upgrading, ~1 s of stutter to downgrade, so the
 * settings cannot oscillate. Detection *accuracy* is never touched — only
 * detection rate, sampling density, tube resolution and post effects.
 */
export function usePerfGovernor(
  metrics: EngineMetrics,
  tier: QualityTier,
  setTier: (tier: QualityTier) => void,
  ceiling: QualityTier = 'high',
): void {
  const stateRef = useRef<GovernorState>({ lowStreak: 0, highStreak: 0 });
  const tierRef = useRef(tier);
  tierRef.current = tier;

  const { renderFps, sceneFps } = metrics;

  useEffect(() => {
    const state = stateRef.current;
    const fps = sceneFps > 0 ? Math.min(renderFps, sceneFps) : renderFps;
    if (fps <= 0) return;

    if (fps < 45) {
      state.lowStreak += 1;
      state.highStreak = 0;
    } else if (fps > 57) {
      state.highStreak += 1;
      state.lowStreak = 0;
    } else {
      state.lowStreak = 0;
      state.highStreak = 0;
    }

    const index = ORDER.indexOf(tierRef.current);
    if (state.lowStreak >= 6 && index < ORDER.length - 1) {
      state.lowStreak = 0;
      setTier(ORDER[index + 1]);
    } else if (state.highStreak >= 30 && index > ORDER.indexOf(ceiling)) {
      state.highStreak = 0;
      setTier(ORDER[index - 1]);
    }
  }, [renderFps, sceneFps, setTier, ceiling]);
}
