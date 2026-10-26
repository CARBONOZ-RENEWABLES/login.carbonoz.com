// @vitest-environment jsdom
import '../../../test/dom'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../../i18n'
import { baseAPI } from '../../../lib/api/api'
import { store } from '../../../lib/redux/store'
import { stubApi } from '../../../test/fetch'
import { TelegramSettings } from './TelegramSettings'

const App = () => (
  <Provider store={store}>
    <I18nProvider>
      <TelegramSettings />
    </I18nProvider>
  </Provider>
)

const linked = {
  enabled: true,
  notificationsEnabled: true,
  botUsername: 'synthetic_test_bot',
  linked: true,
  link: {
    linkedAt: '2026-10-24T10:00:00Z',
    notify: true,
    lowSocPct: 20,
    notifyLowSoc: true,
    notifyOffline: true,
    notifyStale: true,
    notifyAlarms: true,
    notifyRecovery: true,
    siteIds: [],
  },
  mustChooseSites: false,
  sites: [{ id: 'a'.repeat(24), name: 'Synthetic site' }],
}

beforeEach(() => store.dispatch(baseAPI.util.resetApiState()))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Settings → Telegram', () => {
  it('renders nothing while the integration is switched off', async () => {
    const calls = stubApi(() => ({ body: { data: { enabled: false } } }))
    const { container } = render(<App />)
    await waitFor(() => expect(calls.length).toBe(1))
    expect(container.textContent).toBe('')
  })

  it('creates a single-use code and shows the bot link and the /link command', async () => {
    stubApi((c) =>
      c.url.endsWith('/telegram/link-code')
        ? { body: { data: { code: 'ABCDEFGHJK', expiresAt: '2026-10-24T10:10:00Z', deepLink: 'https://t.me/synthetic_test_bot?start=ABCDEFGHJK' } } }
        : { body: { data: { ...linked, linked: false, link: null } } },
    )
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Create link code' }))
    expect(await screen.findByText('/link ABCDEFGHJK')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open the Carbonoz bot in Telegram' }).getAttribute('href')).toBe(
      'https://t.me/synthetic_test_bot?start=ABCDEFGHJK',
    )
  })

  it('saves a preference change and can disconnect', async () => {
    const calls = stubApi(() => ({ body: { data: linked } }))
    render(<App />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Delayed data' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true))
    const patch = calls.find((c) => c.method === 'PATCH')!
    expect(patch.url).toMatch(/\/telegram\/preferences$/)
    expect(JSON.parse(patch.body)).toEqual({ notifyStale: false })
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect Telegram' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/telegram/link'))).toBe(true))
  })
})
