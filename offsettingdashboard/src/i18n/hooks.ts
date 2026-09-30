import { useContext, useMemo } from 'react'
import { LanguageContext } from './context'
import { languageInfo } from './languages'
import type { MessageKey } from './messages/types'
import { formatDate, formatFixed, formatNumber, setLanguage, translate, Vars } from './store'

export function useI18n() {
  const lang = useContext(LanguageContext)
  return useMemo(
    () => ({
      lang,
      locale: languageInfo(lang).locale,
      t: (key: MessageKey, vars?: Vars) => translate(key, vars, lang),
      setLanguage,
      formatNumber,
      formatFixed,
      formatDate,
    }),
    [lang],
  )
}

export const useT = () => useI18n().t
