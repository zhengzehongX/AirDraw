import type { Preferences, ToyDetailChoice } from './preferences';

/**
 * One table that both the persistence layer and the settings screen read.
 *
 * Settings broke before because the range lived in the slider, the clamp lived in
 * `sanitize()` and the "restore defaults" list lived nowhere: three places to agree,
 * and they did not. A field is described once here, so the control, the stored value
 * and the reset button cannot drift apart.
 */
export type NumericSetting = {
  key: 'pointerSensitivity' | 'pointerSmoothing' | 'pinchAssist' | 'gestureHoldMs' | 'toyIntensity' | 'voiceVolume' | 'panSpeed' | 'zoomSensitivity' | 'dotDensity';
  kind: 'number';
  min: number;
  max: number;
  step: number;
  default: number;
  /** How the raw number is shown, so the unit never disagrees with the service. */
  format: (value: number) => string;
};

export type ChoiceSetting<K extends keyof Preferences> = {
  key: K;
  kind: 'choice';
  values: readonly Preferences[K][];
  default: Preferences[K];
};

export type FlagSetting = {
  key: 'devMode' | 'voiceFeedback';
  kind: 'flag';
  default: boolean;
};

export type SettingDescriptor = NumericSetting | ChoiceSetting<'theme' | 'dominantHand' | 'reducedMotion' | 'uiLanguage' | 'toyDetail' | 'voiceLanguage'> | FlagSetting;

export const TOY_DETAIL_VALUES = ['auto', 'ultra', 'high', 'balanced', 'performance'] as const satisfies readonly ToyDetailChoice[];

export const SETTINGS_SCHEMA = {
  pointerSensitivity: {
    key: 'pointerSensitivity',
    kind: 'number',
    min: 0.6,
    max: 1.6,
    step: 0.05,
    default: 1,
    format: (value) => value.toFixed(2),
  },
  pointerSmoothing: {
    key: 'pointerSmoothing',
    kind: 'number',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.5,
    format: (value) => `${Math.round(value * 100)}%`,
  },
  pinchAssist: {
    key: 'pinchAssist',
    kind: 'number',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0,
    format: (value) => `${Math.round(value * 100)}%`,
  },
  gestureHoldMs: {
    key: 'gestureHoldMs',
    kind: 'number',
    min: 400,
    max: 1400,
    step: 50,
    default: 700,
    format: (value) => `${(value / 1000).toFixed(1)} s`,
  },
  toyIntensity: {
    key: 'toyIntensity',
    kind: 'number',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.5,
    format: (value) => `${Math.round(value * 100)}%`,
  },
  voiceVolume: {
    key: 'voiceVolume',
    kind: 'number',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.35,
    format: (value) => `${Math.round(value * 100)}%`,
  },
  panSpeed: {
    key: 'panSpeed',
    kind: 'number',
    min: 0.5,
    max: 2,
    step: 0.1,
    default: 1,
    format: (value) => `${value.toFixed(1)}×`,
  },
  zoomSensitivity: {
    key: 'zoomSensitivity',
    kind: 'number',
    min: 0.5,
    max: 2,
    step: 0.1,
    default: 1,
    format: (value) => `${value.toFixed(1)}×`,
  },
  dotDensity: {
    key: 'dotDensity',
    kind: 'number',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.5,
    format: (value) => `${Math.round(value * 100)}%`,
  },
  theme: { key: 'theme', kind: 'choice', values: ['day', 'night', 'auto'] as const, default: 'auto' },
  dominantHand: { key: 'dominantHand', kind: 'choice', values: ['auto', 'Left', 'Right'] as const, default: 'auto' },
  reducedMotion: { key: 'reducedMotion', kind: 'choice', values: ['system', 'on', 'off'] as const, default: 'system' },
  // 'system' is the right default once every surface is translated; until then an
  // English browser would get English menus over a Chinese guide, which is worse
  // than one consistent language. Users can still choose 跟随系统 explicitly.
  uiLanguage: { key: 'uiLanguage', kind: 'choice', values: ['system', 'zh', 'en'] as const, default: 'zh' },
  voiceLanguage: { key: 'voiceLanguage', kind: 'choice', values: ['zh-CN', 'en-US'] as const, default: 'zh-CN' },
  toyDetail: { key: 'toyDetail', kind: 'choice', values: TOY_DETAIL_VALUES, default: 'auto' },
  devMode: { key: 'devMode', kind: 'flag', default: false },
  voiceFeedback: { key: 'voiceFeedback', kind: 'flag', default: false },
} as const satisfies Record<string, SettingDescriptor>;

export type SettingKey = keyof typeof SETTINGS_SCHEMA;

export const SETTING_KEYS = Object.keys(SETTINGS_SCHEMA) as SettingKey[];

const numericOf = (descriptor: NumericSetting, value: unknown): number => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : null;
  if (parsed === null || !Number.isFinite(parsed)) return descriptor.default;
  return parsed;
};

/** Clamps and quantises a raw stored value into what the field actually accepts. */
export function coerceSetting(key: SettingKey, value: unknown): Preferences[SettingKey] {
  const descriptor = SETTINGS_SCHEMA[key];
  if (descriptor.kind === 'number') {
    const raw = numericOf(descriptor, value);
    const bounded = Math.min(Math.max(raw, descriptor.min), descriptor.max);
    const stepped = descriptor.min + Math.round((bounded - descriptor.min) / descriptor.step) * descriptor.step;
    // Two decimals keep 1.0 exactly 1.0 instead of 0.9999999999999999 after a drag.
    return Math.round(stepped * 100) / 100 as Preferences[SettingKey];
  }
  if (descriptor.kind === 'flag') return value === true as Preferences[SettingKey];
  const values: readonly unknown[] = descriptor.values;
  return (values.includes(value) ? value : descriptor.default) as Preferences[SettingKey];
}

/** The values `resetPreferences` writes, derived from the same table. */
export function settingDefaults(): Pick<Preferences, SettingKey> {
  const out = {} as Pick<Preferences, SettingKey>;
  for (const key of SETTING_KEYS) {
    (out as Record<string, unknown>)[key] = SETTINGS_SCHEMA[key].default;
  }
  return out;
}

export const SETTING_DEFAULTS = settingDefaults();
