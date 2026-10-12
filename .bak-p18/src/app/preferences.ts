import type { MaterialPresetId } from '../types/drawing';
import type { DominantHandMode } from '../utils/primaryHand';
import type { ThemeMode } from '../theme/themes';
import { SETTING_DEFAULTS, SETTING_KEYS, coerceSetting, type SettingKey } from './settingsSchema';

const STORAGE_KEY = 'airdraw-preferences-v1';

export type ThemeChoice = ThemeMode | 'auto';
/** `auto` leaves the budget to the performance governor; the rest are manual. */
export type ToyDetailChoice = 'auto' | 'ultra' | 'high' | 'balanced' | 'performance';

/**
 * Everything the app remembers about the person using it.
 *
 * Deliberately small and boring: preferences are settings, not artwork. Ink
 * belongs in IndexedDB (`src/storage/artworks.ts`); the canvas is never
 * auto-populated from here, so reopening AirDraw shows an empty sheet unless
 * the user explicitly saved or opened a piece.
 */
export type Preferences = {
  schema: 1;
  theme: ThemeChoice;
  dominantHand: DominantHandMode;
  devMode: boolean;
  /** Finished the interactive tutorial at least once. */
  tutorialDone: boolean;
  /** Saw the Hello opening, so the home can skip straight to the entries. */
  helloSeen: boolean;
  brush: { color: string; width: number; material: MaterialPresetId };
  /** 0.6 = glides more, 1.6 = tracks faster. */
  pointerSensitivity: number;
  /** How long OPEN_PALM must be held to summon the dock. */
  gestureHoldMs: number;
  /** 0 = off, 1 = easiest pinch. */
  pinchAssist: number;
  reducedMotion: 'system' | 'on' | 'off';
  /** The user turned down the one-time pinch-calibration invitation. */
  calibrationSkipped: boolean;
  /** Interface language, kept apart from the speech recognition language. */
  uiLanguage: 'zh' | 'en' | 'system';  /** 0 = crisp, 1 = the shipped default. Drives the pointer filter's floor. */
  pointerSmoothing: number;
  /** 0 = calmest reactions, 1 = most eager. Scales the lab's own gesture gains. */
  toyIntensity: number;
  /** Particle and shader budget for PlayLab; `auto` follows the perf governor. */
  toyDetail: ToyDetailChoice;
  /** Voice feedback loudness, 0..1; the browser may clamp what it renders. */
  voiceVolume: number;
  panSpeed: number;
  zoomSensitivity: number;
  dotDensity: number;
  voiceWakePhrase:string;
  voiceLanguage:'zh-CN'|'en-US';
  voiceFeedback:boolean;
};

export const DEFAULT_PREFERENCES: Preferences = {
  // Every field the settings screen owns comes from the schema, so "restore
  // defaults" and a first run can never disagree.
  ...SETTING_DEFAULTS,
  schema: 1,
  tutorialDone: false,
  helloSeen: false,
  brush: { color: '#22d3ee', width: 10, material: 'candy' },
  calibrationSkipped: false,
  voiceWakePhrase:'你好，AirDraw',
};

/**
 * Numbers arrive from sliders, localStorage and hand-edited JSON alike. A numeric
 * string is a number; anything else is a reason to fall back, never a reason to
 * quietly reset a value the user set three fields away.
 */
const numberOr = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const inRange = (value: unknown, min: number, max: number, fallback: number): number => {
  const parsed = numberOr(value);
  return parsed === null ? fallback : Math.min(Math.max(parsed, min), max);
};

function sanitize(raw: unknown): Preferences {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_PREFERENCES };
  const p = raw as Partial<Preferences>;
  const brush = typeof p.brush === 'object' && p.brush ? p.brush : DEFAULT_PREFERENCES.brush;
  // Everything the settings screen offers is clamped by the schema, so a stored
  // value can never disagree with the control that wrote it.
  const governed = {} as Pick<Preferences, SettingKey>;
  for (const key of SETTING_KEYS) {
    (governed as Record<string, unknown>)[key] = coerceSetting(key, (p as Record<string, unknown>)[key]);
  }
  return {
    ...governed,
    schema: 1,
    devMode: p.devMode === true,
    tutorialDone: p.tutorialDone === true,
    helloSeen: p.helloSeen === true,
    brush: {
      color: typeof brush.color === 'string' ? brush.color : DEFAULT_PREFERENCES.brush.color,
      width: inRange(brush.width, 2, 40, DEFAULT_PREFERENCES.brush.width),
      material:
        brush.material === 'plastic' ||
        brush.material === 'metal' ||
        brush.material === 'glass' ||
        brush.material === 'neon'
          ? brush.material
          : 'candy',
    },
    calibrationSkipped: p.calibrationSkipped === true,
    voiceWakePhrase:typeof p.voiceWakePhrase==='string'&&p.voiceWakePhrase.trim()?p.voiceWakePhrase.slice(0,40):DEFAULT_PREFERENCES.voiceWakePhrase,
  };
}

let current: Preferences = DEFAULT_PREFERENCES;
const listeners = new Set<(preferences: Preferences) => void>();
let loaded = false;

export function loadPreferences(): Preferences {
  if (loaded) return current;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) current = sanitize(JSON.parse(raw));
  } catch {
    /* Private mode or a corrupt entry: defaults are a fine answer. */
  }
  // `?debug=1` opens diagnostics for this session without writing a preference the
  // user never chose, so the settings switch stays the only owner of devMode.
  if (typeof location !== 'undefined' && /[?&]debug=1(?:&|$)/.test(location.search)) {
    current = sanitize({ ...current, devMode: true });
  }
  return current;
}

export function readPreferences(): Preferences {
  return loadPreferences();
}

export function updatePreferences(patch: Partial<Preferences>): Preferences {
  current = sanitize({ ...current, ...patch });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* Storage full or blocked: the session still works, it just won't persist. */
  }
  for (const listener of listeners) listener(current);
  return current;
}

export function subscribePreferences(listener: (preferences: Preferences) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetPreferences(): Preferences {
  return updatePreferences({ ...DEFAULT_PREFERENCES });
}

/** Resolves `auto` against the browser's colour-scheme preference. */
export function resolveTheme(choice: ThemeChoice): ThemeMode {
  if (choice !== 'auto') return choice;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches
    ? 'day'
    : 'night';
}

export function prefersReducedMotion(choice: Preferences['reducedMotion']): boolean {
  if (choice === 'on') return true;
  if (choice === 'off') return false;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
