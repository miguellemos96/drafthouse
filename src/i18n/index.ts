// Interface strings and number formatting in English, Spanish and Portuguese.
// See "Languages and units" in docs/spec.md.
import { en, type StringKey, type Strings } from './en.ts'
import { es } from './es.ts'
import { pt } from './pt.ts'

export type { StringKey, Strings }

export const LANGUAGES = ['en', 'es', 'pt'] as const
export type Language = (typeof LANGUAGES)[number]

export const STRINGS: Record<Language, Strings> = { en, es, pt }

const STORAGE_KEY = 'drafthouse.language'

const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)

/**
 * Picks the interface language from the browser's preferred languages (`navigator.languages`).
 * The first entry that is English, Spanish or Portuguese wins (`es`, `es-*` → es; `pt`, `pt-*` → pt);
 * anything else falls back to English.
 */
export function pickLanguage(navigatorLanguages: readonly string[]): Language {
  for (const tag of navigatorLanguages) {
    const base = tag.toLowerCase().split('-')[0]
    if (isLanguage(base)) return base
  }
  return 'en'
}

let current: Language = 'en'

export const getLanguage = (): Language => current

/** Sets the language for `t` without remembering it. */
export function useLanguage(lang: Language): void {
  current = lang
}

/** The user's own choice: sets the language and remembers it in localStorage. */
export function setLanguage(lang: Language): void {
  current = lang
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // Storage blocked or unavailable: the choice lasts until the page closes.
  }
}

/** The remembered choice if there is one, else the browser's language. Sets it as current. */
export function loadLanguage(navigatorLanguages: readonly string[]): Language {
  let saved: string | null = null
  try {
    saved = localStorage.getItem(STORAGE_KEY)
  } catch {
    // Storage blocked or unavailable: fall back to the browser's language.
  }
  current = isLanguage(saved) ? saved : pickLanguage(navigatorLanguages)
  return current
}

/** The string for `key` in the current language, with `{name}` placeholders filled from `params`. */
export function t(key: StringKey, params: Record<string, string | number> = {}): string {
  const template = STRINGS[current][key] ?? en[key]
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

/** The `{name}` placeholders in a string, sorted and without repeats. */
export function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort()
}

/** A length in cm for display: `83 cm` below 100 cm, metres from 100 cm up (`2.1 m`, `2,1 m`). */
export function formatLength(cm: number, lang: Language = current): string {
  const whole = Math.round(cm)
  if (Math.abs(whole) < 100) return `${whole} cm`
  const metres = new Intl.NumberFormat(lang, { maximumFractionDigits: 2, useGrouping: false }).format(whole / 100)
  return `${metres} m`
}
