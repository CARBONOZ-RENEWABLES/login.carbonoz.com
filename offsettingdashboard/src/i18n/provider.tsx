import { Fragment, ReactNode, useEffect, useSyncExternalStore } from 'react'
import { LanguageContext } from './context'
import { getLanguage, subscribe } from './store'
import dayjs from 'dayjs'
import 'dayjs/locale/de'
import 'dayjs/locale/en-gb'
import 'dayjs/locale/es'
import 'dayjs/locale/fr'

const DAYJS_LOCALE = { en: 'en-gb', de: 'de', fr: 'fr', es: 'es' } as const

/**
 * Provides the current language. The subtree is re-created on a change, so
 * every string — including ones computed outside components — is rendered
 * again in the new language without a page reload. Redux (API cache) and the
 * router live above it and keep their state.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribe, getLanguage, getLanguage)
  useEffect(() => {
    document.documentElement.lang = lang
    // antd date pickers format and name months with dayjs.
    dayjs.locale(DAYJS_LOCALE[lang])
  }, [lang])
  return (
    <LanguageContext.Provider value={lang}>
      <Fragment key={lang}>{children}</Fragment>
    </LanguageContext.Provider>
  )
}
