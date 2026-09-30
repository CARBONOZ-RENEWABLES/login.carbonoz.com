import { Fragment, ReactNode, useEffect, useSyncExternalStore } from 'react'
import { LanguageContext } from './context'
import { getLanguage, subscribe } from './store'

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
  }, [lang])
  return (
    <LanguageContext.Provider value={lang}>
      <Fragment key={lang}>{children}</Fragment>
    </LanguageContext.Provider>
  )
}
