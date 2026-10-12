import { mixTheme, THEMES, type ThemeMode, type ThemeVars } from './themes';
import { readPreferences, resolveTheme } from '../app/preferences';

export const THEME_TRANSITION_MS = 800;

type ThemeListener = (t: number, vars: ThemeVars) => void;

const rgb = (c: [number, number, number]) =>
  `${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}`;

/**
 * Owns the day/night blend value `t` (0 night → 1 day).
 *
 * The transition is a single eased 0.8 s interpolation; every frame writes the
 * blended values into CSS custom properties so glass, text, background and
 * shadows move together, while the Three.js scene reads `t` in its own frame
 * loop. Users can keep drawing mid-transition — nothing blocks on it.
 * `prefers-reduced-motion` collapses the duration without changing the result.
 */
class ThemeController {
  private listeners = new Set<ThemeListener>();
  private rafId = 0;
  private target: number;
  t: number;
  mode: ThemeMode;
  reduced=false;

  constructor() {
    // One source of truth: the theme lives in preferences, and a second mirror key
    // here used to win over whatever Settings had just written.
    const initial = resolveTheme(readPreferences().theme);
    this.mode = initial;
    this.t = initial === 'day' ? 1 : 0;
    this.target = this.t;
    this.apply(this.t);
  }

  subscribe(listener: ThemeListener): () => void {
    this.listeners.add(listener);
    listener(this.t, mixTheme(this.t));
    return () => this.listeners.delete(listener);
  }

  toggle(): void {
    this.setMode(this.mode === 'night' ? 'day' : 'night');
  }

  setMode(mode: ThemeMode): void {
    if (mode === this.mode && this.t === this.target) return;
    this.mode = mode;
    this.target = mode === 'day' ? 1 : 0;
    this.animate();
  }

  private animate(): void {
    cancelAnimationFrame(this.rafId);
    const reduced =
      this.reduced || typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduced ? 1 : THEME_TRANSITION_MS;
    const from = this.t;
    const delta = this.target - from;
    if (Math.abs(delta) < 1e-4) {
      this.apply(this.target);
      return;
    }
    const startedAt = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - startedAt) / duration);
      const eased = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      this.apply(from + delta * eased);
      if (u < 1) this.rafId = requestAnimationFrame(step);
    };
    this.rafId = requestAnimationFrame(step);
  }

  private apply(t: number): void {
    this.t = t;
    const vars = mixTheme(t);
    const root = document.documentElement;
    const style = root.style;
    style.setProperty('--ad-bg', `rgb(${rgb(vars.bg)})`);
    style.setProperty('--ad-glow-a', `${rgb(vars.glowA)}`);
    style.setProperty('--ad-glow-b', `${rgb(vars.glowB)}`);
    style.setProperty('--ad-glow-alpha', vars.glowAlpha.toFixed(3));
    style.setProperty('--ad-text', `rgb(${rgb(vars.text)})`);
    style.setProperty('--ad-text-dim', `rgb(${rgb(vars.textDim)})`);
    style.setProperty('--ad-text-faint', `rgb(${rgb(vars.textFaint)})`);
    style.setProperty('--ad-glass-bg', `rgba(${rgb(vars.glassBg)}, ${vars.glassAlpha.toFixed(3)})`);
    style.setProperty(
      '--ad-glass-border',
      `rgba(${rgb(vars.glassBorder)}, ${vars.glassBorderAlpha.toFixed(3)})`,
    );
    style.setProperty('--ad-glass-highlight', vars.glassHighlightAlpha.toFixed(3));
    style.setProperty('--ad-accent', `rgb(${rgb(vars.accent)})`);
    style.setProperty('--ad-accent-rgb', rgb(vars.accent));
    style.setProperty('--ad-success', rgb(vars.success));
    style.setProperty('--ad-warn', rgb(vars.warn));
    style.setProperty('--ad-danger', rgb(vars.danger));
    style.setProperty('--ad-danger-ink', rgb(vars.dangerInk));
    style.setProperty('--ad-scrim-alpha', (0.34 + (1 - t) * 0.34).toFixed(3));
    style.setProperty('--ad-blur', `${vars.blurPx.toFixed(1)}px`);
    style.setProperty('--ad-shadow-alpha', vars.shadowAlpha.toFixed(3));
    root.dataset.theme = this.mode;
    for (const listener of this.listeners) listener(t, vars);
  }
}

export const themeController = new ThemeController();

export { THEMES, type ThemeMode, type ThemeVars };
