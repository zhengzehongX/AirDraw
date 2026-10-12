/**
 * Day/Night theme endpoints. Every visual difference between the two modes is
 * expressed here as an interpolatable value; `ThemeController` blends them and
 * writes the result into CSS custom properties each frame of the transition,
 * so background, glass, text and the 3D scene all move together continuously
 * (no hard cut, no flash).
 *
 * Colors are [r, g, b]; numbers carry their unit in the name.
 */

export type ThemeMode = 'day' | 'night';

export type ThemeVars = {
  bg: [number, number, number];
  glowA: [number, number, number];
  glowB: [number, number, number];
  glowAlpha: number;
  text: [number, number, number];
  textDim: [number, number, number];
  textFaint: [number, number, number];
  glassBg: [number, number, number];
  glassAlpha: number;
  glassBorder: [number, number, number];
  glassBorderAlpha: number;
  glassHighlightAlpha: number;
  accent: [number, number, number];
  /** Status hues, themed so success/warn/danger read correctly on both surfaces. */
  success: [number, number, number];
  warn: [number, number, number];
  danger: [number, number, number];
  /** Legible ink on a danger-filled surface; flips with the theme. */
  dangerInk: [number, number, number];
  blurPx: number;
  shadowAlpha: number;
  /** Three.js side */
  sceneBg: [number, number, number];
  ambientIntensity: number;
  keyIntensity: number;
  envIntensity: number;
  bloomIntensity: number;
  materialEnvIntensity: number;
  gridAlpha: number;
};

export const NIGHT: ThemeVars = {
  bg: [30, 35, 45],
  glowA: [104, 147, 187],
  glowB: [129, 149, 180],
  glowAlpha: 0.1,
  text: [238, 241, 248],
  textDim: [188, 198, 218],
  textFaint: [140, 152, 172],
  glassBg: [16, 18, 28],
  glassAlpha: 0.78,
  glassBorder: [255, 255, 255],
  glassBorderAlpha: 0.1,
  glassHighlightAlpha: 0.06,
  accent: [34, 211, 238],
  success: [74, 222, 128],
  warn: [251, 191, 36],
  danger: [251, 113, 133],
  dangerInk: [12, 10, 14],
  blurPx: 22,
  shadowAlpha: 0.45,
  sceneBg: [30, 35, 45],
  ambientIntensity: 0.55,
  keyIntensity: 1.7,
  envIntensity: 1,
  bloomIntensity: 0.55,
  materialEnvIntensity: 1.15,
  gridAlpha: 0.16,
};

export const DAY: ThemeVars = {
  bg: [238, 241, 245],
  glowA: [125, 211, 252],
  glowB: [196, 181, 253],
  glowAlpha: 0.16,
  text: [28, 34, 48],
  textDim: [82, 92, 112],
  // 12–13px captions live on this colour: at the previous value it measured ~3.2:1
  // against the day background, under the 4.5:1 small-text floor.
  textFaint: [96, 104, 122],
  glassBg: [255, 255, 255],
  glassAlpha: 0.88,
  glassBorder: [255, 255, 255],
  glassBorderAlpha: 0.7,
  glassHighlightAlpha: 0.5,
  // Accent carries hint text at 11.5px, so it is darkened to clear 4.5:1 on paper.
  accent: [7, 118, 146],
  success: [21, 128, 61],
  warn: [180, 83, 9],
  danger: [190, 18, 60],
  dangerInk: [255, 255, 255],
  blurPx: 20,
  shadowAlpha: 0.07,
  sceneBg: [233, 237, 242],
  ambientIntensity: 1.05,
  keyIntensity: 2.2,
  envIntensity: 1.25,
  bloomIntensity: 0.18,
  materialEnvIntensity: 1.35,
  gridAlpha: 0.05,
};

export const THEMES: Record<ThemeMode, ThemeVars> = { night: NIGHT, day: DAY };

/** t: 0 = night, 1 = day */
export function mixTheme(t: number): ThemeVars {
  const a = NIGHT;
  const b = DAY;
  const k = Math.min(Math.max(t, 0), 1);
  const mix3 = (x: [number, number, number], y: [number, number, number]): [number, number, number] => [
    x[0] + (y[0] - x[0]) * k,
    x[1] + (y[1] - x[1]) * k,
    x[2] + (y[2] - x[2]) * k,
  ];
  const mix1 = (x: number, y: number) => x + (y - x) * k;
  return {
    bg: mix3(a.bg, b.bg),
    glowA: mix3(a.glowA, b.glowA),
    glowB: mix3(a.glowB, b.glowB),
    glowAlpha: mix1(a.glowAlpha, b.glowAlpha),
    text: mix3(a.text, b.text),
    textDim: mix3(a.textDim, b.textDim),
    textFaint: mix3(a.textFaint, b.textFaint),
    glassBg: mix3(a.glassBg, b.glassBg),
    glassAlpha: mix1(a.glassAlpha, b.glassAlpha),
    glassBorder: mix3(a.glassBorder, b.glassBorder),
    glassBorderAlpha: mix1(a.glassBorderAlpha, b.glassBorderAlpha),
    glassHighlightAlpha: mix1(a.glassHighlightAlpha, b.glassHighlightAlpha),
    accent: mix3(a.accent, b.accent),
    success: mix3(a.success, b.success),
    warn: mix3(a.warn, b.warn),
    danger: mix3(a.danger, b.danger),
    dangerInk: mix3(a.dangerInk, b.dangerInk),
    blurPx: mix1(a.blurPx, b.blurPx),
    shadowAlpha: mix1(a.shadowAlpha, b.shadowAlpha),
    sceneBg: mix3(a.sceneBg, b.sceneBg),
    ambientIntensity: mix1(a.ambientIntensity, b.ambientIntensity),
    keyIntensity: mix1(a.keyIntensity, b.keyIntensity),
    envIntensity: mix1(a.envIntensity, b.envIntensity),
    bloomIntensity: mix1(a.bloomIntensity, b.bloomIntensity),
    materialEnvIntensity: mix1(a.materialEnvIntensity, b.materialEnvIntensity),
    gridAlpha: mix1(a.gridAlpha, b.gridAlpha),
  };
}
