// @vitest-environment jsdom
import '../test/dom'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LanguageSection from '../components/dashboard/profile/LanguageSection'
import Settings from '../components/dashboard/settings/settings'
import { store } from '../lib/redux/store'
import { stubApi } from '../test/fetch'
import { getLanguage, I18nProvider, setLanguage } from '.'

function App({ save = false }: { save?: boolean }) {
  return (
    <Provider store={store}>
      <MemoryRouter>
        <I18nProvider>
          <LanguageSection canSaveToProfile={save} />
          <Settings />
        </I18nProvider>
      </MemoryRouter>
    </Provider>
  )
}

const pick = (code: string) => fireEvent.change(screen.getByTestId('language-select'), { target: { value: code } })

beforeEach(() => {
  localStorage.clear()
  act(() => setLanguage('en'))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('language selector', () => {
  it('changes the rendered UI text immediately: English → German → French → Spanish', () => {
    render(<App />)
    expect(screen.getByText('Appearance')).toBeTruthy()
    expect(screen.getByText('Light')).toBeTruthy()

    pick('de')
    expect(screen.getByText('Darstellung')).toBeTruthy()
    expect(screen.getByText('Hell')).toBeTruthy()
    expect(screen.queryByText('Appearance')).toBeNull()
    expect(document.documentElement.lang).toBe('de')

    pick('fr')
    expect(screen.getByText('Apparence')).toBeTruthy()
    expect(screen.getByText('Clair')).toBeTruthy()

    pick('es')
    expect(screen.getByText('Apariencia')).toBeTruthy()
    expect(screen.getByText('Claro')).toBeTruthy()
    expect((screen.getByTestId('language-select') as HTMLSelectElement).value).toBe('es')
  })

  it('remembers the choice across a reload', async () => {
    render(<App />)
    pick('fr')
    expect(localStorage.getItem('carbonoz.language')).toBe('fr')
    cleanup()
    // A fresh module graph = a page reload reading the stored preference.
    vi.resetModules()
    const fresh = await import('./store')
    expect(fresh.getLanguage()).toBe('fr')
    expect(fresh.translate('settings.appearance')).toBe('Apparence')
  })

  it('saves the language in the profile when the account has one', async () => {
    const calls = stubApi(() => ({ body: { message: 'ok', data: {} } }))
    render(<App save />)
    pick('de')
    await waitFor(() => expect(calls.length).toBe(1))
    expect(calls[0].method).toBe('PATCH')
    expect(calls[0].url).toMatch(/\/v1\/user\/edit-user$/)
    expect(JSON.parse(calls[0].body)).toEqual({ customerLanguage: 'de' })
    expect(getLanguage()).toBe('de')
  })
})
