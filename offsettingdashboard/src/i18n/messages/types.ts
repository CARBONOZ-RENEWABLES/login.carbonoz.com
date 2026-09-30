import type { en } from './en'

/** A message is a string, or plural forms chosen by `count`. */
export type Plural = { one?: string; other: string }

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string | Plural ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>
}[keyof T & string]

/** Every translation key, checked at compile time: `t('solar.tabs.overview')`. */
export type MessageKey = Leaves<typeof en>

type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : T[K] extends Plural ? Plural : DeepPartial<T[K]> }

/** Other languages may omit keys; missing ones fall back to English. */
export type Catalogue = DeepPartial<typeof en>
