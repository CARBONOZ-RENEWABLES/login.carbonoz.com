import { baseAPI } from '../../lib/api/api'

export interface TelegramPreferences {
  notify: boolean
  lowSocPct: number
  notifyLowSoc: boolean
  notifyOffline: boolean
  notifyStale: boolean
  notifyAlarms: boolean
  notifyRecovery: boolean
  siteIds: string[]
}

/** GET /telegram: the chat id is never sent to the browser. */
export type TelegramStatus =
  | { enabled: false }
  | {
      enabled: true
      notificationsEnabled: boolean
      botUsername: string | null
      linked: boolean
      link: (TelegramPreferences & { linkedAt: string }) | null
      /** Admins see every site, so they must pick the ones they want alerts for. */
      mustChooseSites: boolean
      sites: { id: string; name: string }[]
    }

export interface TelegramLinkCode {
  code: string
  expiresAt: string
  deepLink: string | null
}

interface Envelope<T> {
  data: T
}

export const telegramApi = baseAPI.injectEndpoints({
  endpoints: (b) => ({
    getTelegram: b.query<Envelope<TelegramStatus>, void>({ query: () => '/telegram', providesTags: ['Telegram'] }),
    createTelegramLinkCode: b.mutation<Envelope<TelegramLinkCode>, void>({ query: () => ({ url: '/telegram/link-code', method: 'POST' }) }),
    updateTelegramPreferences: b.mutation<unknown, Partial<TelegramPreferences>>({
      query: (body) => ({ url: '/telegram/preferences', method: 'PATCH', body }),
      invalidatesTags: ['Telegram'],
    }),
    unlinkTelegram: b.mutation<unknown, void>({ query: () => ({ url: '/telegram/link', method: 'DELETE' }), invalidatesTags: ['Telegram'] }),
  }),
})

export const { useGetTelegramQuery, useCreateTelegramLinkCodeMutation, useUpdateTelegramPreferencesMutation, useUnlinkTelegramMutation } = telegramApi
