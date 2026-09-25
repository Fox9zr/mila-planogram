import { derived, writable } from 'svelte/store';
import { en } from './locales/en';
import { pt } from './locales/pt';
import { ru } from './locales/ru';

export type Locale = 'en' | 'pt' | 'ru';
export type TranslationKey = keyof typeof en;
/** `en` is complete; `pt` and `ru` are translated per key with an English fallback. */
const dictionaries: Record<Locale, Partial<Record<TranslationKey, string>>> = { en, pt, ru };
const preference = writable<Locale>('en');
const isLocale = (value: unknown): value is Locale => value === 'en' || value === 'pt' || value === 'ru';

export function translate(language: Locale, key: TranslationKey, variables: Record<string, string | number> = {}): string {
  // Partial dictionaries (ru) fall back to English so a missing key never renders blank.
  const template = dictionaries[language][key] ?? en[key];
  // Single-pass substitution preserves literal braces in user-provided values.
  return template.replace(/\{(\w+)\}/g, (token, name) =>
    Object.hasOwn(variables, name) ? String(variables[name]) : token);
}

export const locale = {
  subscribe: preference.subscribe,
  set(value: Locale) {
    if (!isLocale(value)) return;
    preference.set(value);
    if (typeof document !== 'undefined') document.documentElement.lang = value;
    try { localStorage.setItem('o3d_locale', value); } catch { /* In-memory choice still works. */ }
  },
};

/** Run after hydration; SSR and the first client render always agree on English. */
export function initializeLocale() {
  let saved: unknown;
  try { saved = localStorage.getItem('o3d_locale'); } catch { /* Storage can be disabled. */ }
  // Keep English until the remaining interface has been translated; users opt in.
  locale.set(isLocale(saved) ? saved : 'en');
}

/** Svelte's $t subscription updates labels without remounting dialogs or inputs. */
export const t = derived(preference, (language) =>
  (key: TranslationKey, variables?: Record<string, string | number>) => translate(language, key, variables));
