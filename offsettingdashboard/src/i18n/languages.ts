export type Language = 'en' | 'de' | 'fr' | 'es'

export interface LanguageInfo {
  code: Language
  /** Name in its own language, as shown in the selector. */
  label: string
  flag: string
  /** BCP 47 locale for dates and numbers. */
  locale: string
}

export const LANGUAGES: LanguageInfo[] = [
  { code: 'en', label: 'English', flag: '🇬🇧', locale: 'en-GB' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪', locale: 'de-DE' },
  { code: 'fr', label: 'Français', flag: '🇫🇷', locale: 'fr-FR' },
  { code: 'es', label: 'Español', flag: '🇪🇸', locale: 'es-ES' },
]

export const DEFAULT_LANGUAGE: Language = 'en'

export const languageInfo = (code: Language): LanguageInfo => LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0]

const ALIASES: Record<string, Language> = {
  en: 'en',
  english: 'en',
  de: 'de',
  german: 'de',
  deutsch: 'de',
  fr: 'fr',
  french: 'fr',
  français: 'fr',
  francais: 'fr',
  es: 'es',
  spanish: 'es',
  español: 'es',
  espanol: 'es',
}

/**
 * Stored preference → language code. Profiles saved before this change hold
 * labels such as "English" or "french"; `de-DE` style locales work too.
 */
export function normalizeLanguage(value: unknown): Language | undefined {
  if (typeof value !== 'string') return undefined
  const v = value.trim().toLowerCase()
  return ALIASES[v] ?? ALIASES[v.split(/[-_]/)[0]]
}
