import { createContext } from 'react'
import type { Language } from './languages'
import { getLanguage } from './store'

export const LanguageContext = createContext<Language>(getLanguage())
