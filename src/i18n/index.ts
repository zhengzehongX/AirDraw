import { useSyncExternalStore } from 'react';
import { readPreferences, updatePreferences, type Preferences } from '../app/preferences';
import { en } from './en';
import { zh, type TextKey } from './zh';

export type Locale = 'zh' | 'en';
/** `system` follows the browser; the resolved value is always a real locale. */
export type LanguageChoice = Locale | 'system';

export type TextParams = Record<string, string | number>;

const TABLES: Record<Locale, Record<TextKey, string>> = { zh, en };

/**
 * The interface language is deliberately separate from the speech recognition
 * language (`preferences.voiceLanguage`): a person may want Chinese menus while
 * dictating English commands, and switching one must never restart the other.
 */
export function resolveLanguage(choice: LanguageChoice = readPreferences().uiLanguage): Locale {
  if (choice === 'zh' || choice === 'en') return choice;
  const tag = typeof navigator === 'undefined' ? 'zh' : navigator.language || 'zh';
  return tag.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

let locale: Locale = resolveLanguage();
const listeners = new Set<() => void>();

export function currentLocale(): Locale {
  return locale;
}

/**
 * Interpolates `{name}` placeholders. Missing parameters leave the placeholder
 * visible rather than silently deleting the word — a dropped noun in an error
 * message is worse than an ugly brace.
 */
function interpolate(template: string, params?: TextParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match,
  );
}

/**
 * Translate by stable id. Never match on translated text: every feature flag,
 * setting key and command identifier stays the same in both languages.
 */
export function t(key: TextKey, params?: TextParams): string {
  const template = TABLES[locale][key] ?? zh[key] ?? key;
  return interpolate(template, params);
}

/** English needs more room than Chinese; surfaces ask for this to widen labels. */
export const localeIsWide = (): boolean => locale === 'en';

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Changes the interface language. This only swaps strings: the camera, the
 * tracker, the canvas, the current toy and the user's work are untouched, and
 * nothing here re-inits a service.
 */
export function setLanguage(choice: LanguageChoice): Locale {
  updatePreferences({ uiLanguage: choice });
  return applyResolved(resolveLanguage(choice));
}

function applyResolved(next: Locale): Locale {
  if (next !== locale) {
    locale = next;
    if (typeof document !== 'undefined') document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
    for (const listener of listeners) listener();
  }
  return locale;
}

/** Keeps the interface in step with a preferences change from anywhere else. */
export function syncLanguageFromPreferences(preferences: Preferences): void {
  applyResolved(resolveLanguage(preferences.uiLanguage));
  if (typeof document !== 'undefined') document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
}

/** React binding: re-renders the component when the language changes. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, currentLocale, currentLocale);
}

/** `const text = useText(); … text('hub.title')` — bound to the current locale. */
export function useText(): (key: TextKey, params?: TextParams) => string {
  useLocale();
  return t;
}
