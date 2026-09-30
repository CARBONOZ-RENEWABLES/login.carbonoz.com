import type { Language } from '../languages'
import { de } from './de'
import { en } from './en'
import { es } from './es'
import { fr } from './fr'
import type { Catalogue } from './types'

export { en }

export const catalogues: Record<Language, Catalogue> = { en, de, fr, es }
