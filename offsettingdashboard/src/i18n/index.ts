/** Application i18n: central catalogues (`messages/`), English fallback, Intl formatting. */
export { adoptLanguage, formatDate, formatFixed, formatNumber, getLanguage, getLocale, setLanguage, translate } from './store'
export { LANGUAGES, languageInfo, normalizeLanguage } from './languages'
export type { Language } from './languages'
export type { MessageKey } from './messages/types'
export { I18nProvider } from './provider'
export { useI18n, useT } from './hooks'
