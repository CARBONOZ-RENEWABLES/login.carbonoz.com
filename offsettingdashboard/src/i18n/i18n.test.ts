import { afterEach, describe, expect, it } from 'vitest'
import { formatDate, formatNumber, getLanguage, LANGUAGES, normalizeLanguage, setLanguage, translate } from '.'
import { catalogues, en } from './messages'

afterEach(() => setLanguage('en'))

/** Every leaf path of a catalogue ("solar.tabs.overview", plural objects count as one). */
function leaves(o: object, prefix = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'string' || (v && typeof v === 'object' && 'other' in v) ? [`${prefix}${k}`] : leaves(v as object, `${prefix}${k}.`),
  )
}

describe('translations', () => {
  it('translates into English, German, French and Spanish', () => {
    expect(translate('solar.tabs.overview', undefined, 'en')).toBe('Overview')
    expect(translate('solar.tabs.overview', undefined, 'de')).toBe('Übersicht')
    expect(translate('solar.tabs.overview', undefined, 'fr')).toBe('Aperçu')
    expect(translate('solar.tabs.overview', undefined, 'es')).toBe('Resumen')
    expect(translate('energy.gridImport', undefined, 'de')).toBe('Netzbezug')
  })

  it('switches the current language and uses it by default', () => {
    setLanguage('fr')
    expect(getLanguage()).toBe('fr')
    expect(translate('profile.language.title')).toBe('Langue')
    setLanguage('es')
    expect(translate('profile.language.title')).toBe('Idioma')
  })

  it('falls back to English for a missing translation, then to the key', () => {
    const fr = catalogues.fr as { common: Record<string, unknown> }
    const saved = fr.common.refresh
    delete fr.common.refresh
    try {
      expect(translate('common.refresh', undefined, 'fr')).toBe('Refresh')
    } finally {
      fr.common.refresh = saved
    }
    expect(translate('does.not.exist' as never, undefined, 'de')).toBe('does.not.exist')
  })

  it('interpolates values and picks plural forms per language', () => {
    expect(translate('solar.cells.count', { count: 1 }, 'en')).toBe('1 cell')
    expect(translate('solar.cells.count', { count: 16 }, 'en')).toBe('16 cells')
    expect(translate('solar.cells.count', { count: 16 }, 'de')).toBe('16 Zellen')
    expect(translate('solar.pack', { name: 'A' }, 'fr')).toBe('Pack : A')
  })

  it('has every English key in German, French and Spanish', () => {
    const all = leaves(en)
    for (const lang of ['de', 'fr', 'es'] as const) {
      const have = new Set(leaves(catalogues[lang]))
      expect(all.filter((k) => !have.has(k)), `missing in ${lang}`).toEqual([])
    }
  })
})

describe('locale formatting', () => {
  it('formats numbers and dates per language', () => {
    const cases = { en: '41,289.5', de: '41.289,5', fr: '41 289,5', es: '41.289,5' } as const
    for (const [lang, want] of Object.entries(cases)) {
      setLanguage(lang as 'en')
      expect(formatNumber(41289.5, { maximumFractionDigits: 1 }).replace(/\s/g, ' ')).toBe(want)
    }
    setLanguage('de')
    expect(formatDate(new Date(Date.UTC(2026, 8, 30, 12)), { day: '2-digit', month: '2-digit' }, 'UTC')).toBe('30.09.')
    setLanguage('en')
    expect(formatDate(new Date(Date.UTC(2026, 8, 30, 12)), { day: '2-digit', month: '2-digit' }, 'UTC')).toBe('30/09')
  })
})

describe('language preference', () => {
  it('reads codes, legacy profile labels and locales', () => {
    expect(normalizeLanguage('English')).toBe('en')
    expect(normalizeLanguage('french')).toBe('fr')
    expect(normalizeLanguage('Deutsch')).toBe('de')
    expect(normalizeLanguage('es-ES')).toBe('es')
    expect(normalizeLanguage('klingon')).toBeUndefined()
    expect(normalizeLanguage(null)).toBeUndefined()
    expect(LANGUAGES.map((l) => l.code)).toEqual(['en', 'de', 'fr', 'es'])
  })
})
