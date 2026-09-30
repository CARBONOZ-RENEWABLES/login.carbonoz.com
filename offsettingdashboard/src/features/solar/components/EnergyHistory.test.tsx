// @vitest-environment jsdom
import '../../../test/dom'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider, setLanguage } from '../../../i18n'
import { baseAPI } from '../../../lib/api/api'
import { store } from '../../../lib/redux/store'
import { stubApi } from '../../../test/fetch'
import type { EnergyBucket, EnergyHistory as History } from '../api'
import { EnergyHistory } from './EnergyHistory'

const day = (key: string, over: Partial<EnergyBucket> = {}): EnergyBucket => ({
  key,
  start: `${key}T00:00:00.000Z`,
  end: `${key}T23:59:59.000Z`,
  partial: false,
  expectedHours: 24,
  completeness: 1,
  pvKwh: null,
  loadKwh: null,
  gridPositiveKwh: null,
  gridNegativeKwh: null,
  batteryPositiveKwh: null,
  batteryNegativeKwh: null,
  ...over,
})

function history(range: History['range'], buckets: EnergyBucket[], over: Partial<History> = {}): History {
  return {
    range,
    resolution: range === '30d' ? 'day' : range === '1y' ? 'month' : 'year',
    timezone: 'Europe/Berlin',
    anchor: buckets[buckets.length - 1]?.key ?? '2026-09-30',
    previousAnchor: '2026-08-31',
    nextAnchor: null,
    firstDataAt: '2026-09-01T08:00:00.000Z',
    installations: 1,
    sources: { device: 'SYSTEM', pv: 'pv_power_w', load: 'load_power_w', grid: 'grid_power_w', battery: 'battery_power_w' },
    method: 'hourly-average-power',
    buckets,
    ...over,
  }
}

const DAYS = [
  day('2026-08-28', { pvKwh: 41.289, loadKwh: 14.192, gridPositiveKwh: 1.064, gridNegativeKwh: 20.5, batteryPositiveKwh: 31.852, batteryNegativeKwh: 7.459 }),
  day('2026-08-29'), // no readings at all
  day('2026-08-30', { pvKwh: 12, loadKwh: 6, gridPositiveKwh: null, gridNegativeKwh: null, completeness: 0.5 }),
]
const MONTHS = [day('2026-08', { pvKwh: 900.4, loadKwh: 400 }), day('2026-09', { pvKwh: 1234.5, loadKwh: 500, gridPositiveKwh: 50, gridNegativeKwh: 600 })]

function mount() {
  return render(
    <Provider store={store}>
      <I18nProvider>
        <EnergyHistory siteId='site-1' />
      </I18nProvider>
    </Provider>,
  )
}

beforeEach(() => {
  store.dispatch(baseAPI.util.resetApiState())
  act(() => setLanguage('en'))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('energy history view', () => {
  it('shows a loading state, then the real API data in a localized table (German)', async () => {
    act(() => setLanguage('de'))
    let release: () => void = () => undefined
    const gate = new Promise<void>((r) => (release = r))
    const calls = stubApi(async (c) => {
      await gate
      return { body: { data: c.url.includes('range=1y') ? history('1y', MONTHS) : history('30d', DAYS) } }
    })
    mount()
    // No section-level spinner: the page shows the only loading screen.
    expect(screen.queryByRole('status')).toBeNull()
    release()

    const table = await screen.findByTestId('energy-table')
    expect(calls[0].url).toContain('/v1/solar/sites/site-1/energy?range=30d')
    const t = within(table)
    // Column headers.
    for (const h of ['Datum', 'PV', 'Verbrauch', 'Netzbezug', 'Batterie geladen', 'Batterie entladen', 'PV-Deckung']) expect(t.getByText(h)).toBeTruthy()
    // Values straight from the API, German number format.
    expect(t.getByText('41,289 kWh')).toBeTruthy()
    expect(t.getByText('14,192 kWh')).toBeTruthy()
    expect(t.getByText('1,064 kWh')).toBeTruthy()
    expect(t.getByText('31,852 kWh')).toBeTruthy()
    expect(t.getByText('7,459 kWh')).toBeTruthy()
    expect(t.getByText(/92,5\s%/)).toBeTruthy()
    // A day without readings: no invented zeros.
    expect(t.getByText('Keine Daten')).toBeTruthy()
    expect(t.queryByText('0,000 kWh')).toBeNull()
    expect(t.getByText('unvollständig')).toBeTruthy()
    // Charts for the daily view, with Grafana-style legend tables.
    expect(screen.getByText('PV und Verbrauch (täglich)')).toBeTruthy()
    expect(screen.getByText('PV-Deckung (täglich)')).toBeTruthy()
    const legends = screen.getAllByTestId('grafana-legend')
    expect(legends).toHaveLength(3)
    const pvLegend = within(legends[0])
    expect(pvLegend.getByText('Mittel')).toBeTruthy()
    // PV: 41.289 and 12 kWh on two days → max 41,3 · total 53,3 (gaps excluded).
    expect(pvLegend.getAllByText('41,3 kWh').length).toBeGreaterThan(0)
    expect(pvLegend.getByText('53,3 kWh')).toBeTruthy()
    // Clicking a legend row hides that series (and marks it).
    const pvToggle = pvLegend.getByRole('button', { name: /PV/ })
    fireEvent.click(pvToggle)
    expect(pvToggle.getAttribute('aria-pressed')).toBe('false')

    // 1 year → monthly aggregation from the API.
    fireEvent.click(screen.getByRole('radio', { name: '1 Jahr' }))
    await waitFor(() => expect(screen.getByText('Monatliche PV-Erzeugung')).toBeTruthy())
    expect(calls.some((c) => c.url.includes('range=1y'))).toBe(true)
    expect(within(screen.getByTestId('energy-table')).getByText('1.234,5 kWh')).toBeTruthy()
    expect(within(screen.getByTestId('energy-table')).getByText('September 2026')).toBeTruthy()
  })

  it('renders English labels and the 10-year view', async () => {
    stubApi((c) => ({ body: { data: c.url.includes('range=10y') ? history('10y', [day('2025', { pvKwh: 9000, loadKwh: 4000, gridPositiveKwh: 800, gridNegativeKwh: 3000 }), day('2026', { pvKwh: 7000 })]) : history('30d', DAYS) } }))
    mount()
    await screen.findByTestId('energy-table')
    expect(screen.getAllByText('41.289 kWh').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('radio', { name: '10 years' }))
    await waitFor(() => expect(screen.getByText('Yearly PV production')).toBeTruthy())
    const t = within(screen.getByTestId('energy-table'))
    expect(t.getByText('Year')).toBeTruthy()
    expect(t.getByText('9,000 kWh')).toBeTruthy()
    expect(t.getByText('80.0%')).toBeTruthy() // (4000 − 800) / 4000
  })

  it('shows the empty state when the site has no energy readings', async () => {
    stubApi(() => ({ body: { data: history('30d', [day('2026-09-29'), day('2026-09-30')], { firstDataAt: null }) } }))
    mount()
    expect(await screen.findByText('No energy data for this period')).toBeTruthy()
    expect(screen.queryByTestId('energy-table')).toBeNull()
  })

  it('shows an error state with retry when the API fails', async () => {
    let fail = true
    stubApi(() => (fail ? { status: 500, body: { message: 'boom' } } : { body: { data: history('30d', DAYS) } }))
    mount()
    expect(await screen.findByText('Could not load the energy history')).toBeTruthy()
    fail = false
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
    expect(await screen.findByTestId('energy-table')).toBeTruthy()
  })

  it('offers a card list for phones instead of a wide table', async () => {
    stubApi(() => ({ body: { data: history('30d', DAYS) } }))
    mount()
    const cards = await screen.findByTestId('energy-cards')
    expect(cards.className).toContain('sm:hidden')
    expect(screen.getByTestId('energy-table').className).toContain('hidden sm:block')
    expect(within(cards).getAllByRole('listitem')).toHaveLength(3)
  })
})
