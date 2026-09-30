/**
 * Language state and translation, independent of React so plain modules
 * (data adapters, formatters) can translate too. `I18nProvider` re-renders
 * the app when the language changes.
 */
import { DEFAULT_LANGUAGE, Language, languageInfo, normalizeLanguage } from './languages'
import { catalogues, en } from './messages'
import type { Catalogue, MessageKey } from './messages/types'

const STORAGE_KEY = 'carbonoz.language'

function readStored(): Language | undefined {
  try {
    return normalizeLanguage(localStorage.getItem(STORAGE_KEY))
  } catch {
    return undefined
  }
}

function initial(): Language {
  return readStored() ?? DEFAULT_LANGUAGE
}

let current: Language = typeof window === 'undefined' ? DEFAULT_LANGUAGE : initial()
const listeners = new Set<() => void>()

export const getLanguage = () => current
export const getLocale = () => languageInfo(current).locale

export function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Switches the UI language immediately and remembers it on this device. */
export function setLanguage(lang: Language) {
  if (lang === current) return
  current = lang
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* private mode: the choice still applies to this session */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang
  listeners.forEach((fn) => fn())
}

/** Applies a preference stored elsewhere (the user profile) without re-saving it. */
export function adoptLanguage(value: unknown) {
  const lang = normalizeLanguage(value)
  if (lang) setLanguage(lang)
}

type Node = string | { [k: string]: Node }

function lookup(cat: Catalogue | undefined, key: string): Node | undefined {
  let node: Node | undefined = cat as unknown as Node
  for (const part of key.split('.')) {
    if (!node || typeof node === 'string') return undefined
    node = node[part]
  }
  return node
}

const pluralRules = new Map<string, Intl.PluralRules>()
function pluralOf(lang: Language, n: number) {
  let r = pluralRules.get(lang)
  if (!r) pluralRules.set(lang, (r = new Intl.PluralRules(languageInfo(lang).locale)))
  return r.select(n)
}

export type Vars = Record<string, string | number>

/**
 * `t('solar.tabs.overview')` in the current language, falling back to English
 * for anything not translated yet, then to the key itself. `{name}` inserts
 * `vars.name`; a message `{ one, other }` is chosen by `vars.count`.
 */
export function translate(key: MessageKey, vars?: Vars, lang: Language = current): string {
  const pick = (cat: Catalogue | undefined): string | undefined => {
    const node = lookup(cat, key)
    if (typeof node === 'string') return node
    if (node && typeof node === 'object' && typeof vars?.count === 'number') {
      const form = node[pluralOf(lang, vars.count)] ?? node.other
      return typeof form === 'string' ? form : undefined
    }
    return undefined
  }
  const text = pick(catalogues[lang]) ?? pick(en as Catalogue) ?? key
  return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(k === 'count' && typeof vars[k] === 'number' ? formatNumber(vars[k] as number) : vars[k]) : m)) : text
}

const numberFormats = new Map<string, Intl.NumberFormat>()
/** Locale number: 41.289 (en) · 41,289 (de, fr, es). */
export function formatNumber(n: number, opts: Intl.NumberFormatOptions = { maximumFractionDigits: 2 }): string {
  const locale = getLocale()
  const k = `${locale}|${JSON.stringify(opts)}`
  let f = numberFormats.get(k)
  if (!f) numberFormats.set(k, (f = new Intl.NumberFormat(locale, opts)))
  return f.format(n)
}

/** Fixed decimals in the current locale (replacement for `toFixed`). */
export const formatFixed = (n: number, digits: number) => formatNumber(n, { minimumFractionDigits: digits, maximumFractionDigits: digits })

export function formatDate(d: Date | number | string, opts: Intl.DateTimeFormatOptions, timeZone?: string): string {
  const date = d instanceof Date ? d : new Date(d)
  return new Intl.DateTimeFormat(getLocale(), { ...opts, ...(timeZone && { timeZone }) }).format(date)
}
