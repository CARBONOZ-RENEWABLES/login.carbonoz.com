// @vitest-environment jsdom
import '../../test/dom'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider, setLanguage } from '../../i18n'
import { ShellProvider } from '../../layout/ShellContext'
import { baseAPI } from '../../lib/api/api'
import { store } from '../../lib/redux/store'
import { EnergyFlowCard } from '../dashboard/EnergyFlow'
import EnergyFlowPage from './EnergyFlowPage'
import { energyFlowState, liveStatus } from './flowState'
import { resetLiveForTests } from './live'

const SITE = 'site-1'
const now = () => new Date().toISOString()
const sysDevice = (metrics: Record<string, number>, ts = now()) => ({ installationId: 'inst-1', kind: 'SYSTEM', externalId: 'sbms-1', ts, metrics })
const overview = (metrics: Record<string, number>) => ({
  site: { id: SITE, name: 'Home Berlin', timezone: 'Europe/Berlin' },
  updatedAt: now(),
  source: 'live',
  stale: false,
  activeAlarms: 0,
  hasForecast: false,
  metrics: [],
  devices: [{ ...sysDevice(metrics), firstSeenAt: now(), lastSeenAt: now(), latest: { ts: now(), stale: false, status: 'Normal', metrics } }],
})

/** fetch stub: JSON for RTK Query, a controllable SSE stream for /live. */
const liveUrls: string[] = []
function stubFetch(metrics: Record<string, number>) {
  let push: (event: string, data: unknown) => void = () => undefined
  class TestRequest {
    url: string
    method: string
    headers: Headers
    constructor(input: string | URL, init: RequestInit = {}) {
      this.url = String(input)
      this.method = init.method ?? 'GET'
      this.headers = new Headers(init.headers)
    }
    clone() {
      return this
    }
    async text() {
      return ''
    }
  }
  vi.stubGlobal('Request', TestRequest)
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: TestRequest | string) => {
      const url = typeof input === 'string' ? input : input.url
      if (url.endsWith('/live')) {
        liveUrls.push(url)
        const stream = new ReadableStream<Uint8Array>({
          start(c) {
            const enc = new TextEncoder()
            push = (event, data) => c.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
          },
        })
        return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
      }
      if (url.includes('/overview')) return json({ data: overview(metrics) })
      if (url.endsWith('/sites')) return json({ data: [{ id: SITE, name: 'Home Berlin', customer: { id: 'c', name: 'C' }, installations: [{ id: 'inst-1', name: 'Pi', kind: 'SOLARBMS', active: true }] }] })
      return json({ message: 'not stubbed' }, 404)
    }),
  )
  return { push: (event: string, data: unknown) => act(() => push(event, data)) }
}

function Where() {
  const l = useLocation()
  return <span data-testid='where'>{l.pathname}</span>
}

/** Dashboard stand-in: the compact card, as the Overview tab renders it. */
function Dashboard() {
  const flow = energyFlowState({ pv: 5000, load: 1800, grid: 0, battery: 3200, soc: 60 })
  const status = liveStatus({ readingAt: Date.now() - 1000, now: Date.now(), connection: 'open', intervalMs: 1000 })
  const l = useLocation()
  return <EnergyFlowCard flow={flow} status={status} to={`/ds/solar/${SITE}/energy-flow`} linkState={{ from: l.pathname }} />
}

function mount(path: string) {
  return render(
    <Provider store={store}>
      <I18nProvider>
        <ShellProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path='/ds/solar/:siteId/energy-flow' element={<EnergyFlowPage />} />
              <Route path='/ds/solar/:siteId' element={<Dashboard />} />
            </Routes>
            <Where />
          </MemoryRouter>
        </ShellProvider>
      </I18nProvider>
    </Provider>,
  )
}

const setReducedMotion = (reduce: boolean) =>
  (window.matchMedia = ((q: string) => ({ matches: reduce && q.includes('reduce'), media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia)

beforeEach(() => {
  store.dispatch(baseAPI.util.resetApiState())
  act(() => setLanguage('en'))
  setReducedMotion(false)
})
afterEach(() => {
  cleanup()
  resetLiveForTests()
  vi.unstubAllGlobals()
})

describe('compact Energy Flow', () => {
  it('19. is one accessible link (native Enter), Space opens it too; labelled and described', async () => {
    stubFetch({ pv_power_w: 5000, load_power_w: 1800, grid_power_w: 0, battery_power_w: 3200, soc_pct: 60 })
    mount(`/ds/solar/${SITE}`)
    const link = screen.getByRole('link', { name: 'Open live energy flow details' })
    expect(link.getAttribute('href')).toBe(`/ds/solar/${SITE}/energy-flow`)
    const desc = document.getElementById(link.getAttribute('aria-describedby')!)!
    expect(desc.textContent).toContain('Solar is supplying the home and the battery.')
    expect(desc.textContent).toContain('Live')
    fireEvent.keyDown(link, { key: ' ' })
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe(`/ds/solar/${SITE}/energy-flow`))
  })

  it('16/17. click opens the Energy Flow page; Back returns to the dashboard', async () => {
    stubFetch({ pv_power_w: 5000, load_power_w: 1800, grid_power_w: 0, battery_power_w: 3200, soc_pct: 60 })
    mount(`/ds/solar/${SITE}`)
    fireEvent.click(screen.getByTestId('energy-flow-open'))
    expect(await screen.findByTestId('energy-flow-page')).toBeTruthy()
    expect(screen.getByTestId('where').textContent).toBe(`/ds/solar/${SITE}/energy-flow`)
    expect(screen.getByTestId('energy-flow-site').textContent).toBe('Home Berlin')
    fireEvent.click(screen.getByTestId('energy-flow-back'))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe(`/ds/solar/${SITE}`))
    expect(screen.getByTestId('energy-flow-card')).toBeTruthy()
  })

  it('20. animates direction only when live and motion is allowed; reduced motion is static', () => {
    stubFetch({})
    const { container, unmount } = mount(`/ds/solar/${SITE}`)
    expect(container.querySelectorAll('animateMotion').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('[marker-end],[marker-start]').length).toBeGreaterThan(0)
    unmount()
    setReducedMotion(true)
    const r = mount(`/ds/solar/${SITE}`)
    expect(r.container.querySelectorAll('animateMotion').length).toBe(0)
    expect(r.container.querySelectorAll('.flow-line').length).toBe(0)
    // Direction stays visible statically (arrowheads).
    expect(r.container.querySelectorAll('[marker-end],[marker-start]').length).toBeGreaterThan(0)
  })
})

describe('Energy Flow page', () => {
  it('18. opens directly (refresh / shared link) and Back then goes to the dashboard', async () => {
    stubFetch({ pv_power_w: 0, load_power_w: 2400, grid_power_w: 2400, battery_power_w: 0, soc_pct: 40 })
    mount(`/ds/solar/${SITE}/energy-flow`)
    expect(await screen.findByTestId('energy-flow-page')).toBeTruthy()
    expect(screen.getByTestId('flow-grid-direction').textContent).toContain('Importing from the grid')
    expect(screen.getByTestId('flow-value-grid').textContent).toContain('+2.40 kW')
    expect(screen.getByTestId('energy-flow-summary').textContent).toContain('The grid is supplying the home.')
    expect(screen.getByTestId('energy-flow-assumptions').textContent).toContain('not yet confirmed')
    fireEvent.click(screen.getByTestId('energy-flow-back'))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe(`/ds/solar/${SITE}`))
  })

  it('12. updates in realtime from the stream: import → export, charging → discharging', async () => {
    const s = stubFetch({ pv_power_w: 0, load_power_w: 2400, grid_power_w: 2400, battery_power_w: 0, soc_pct: 40 })
    mount(`/ds/solar/${SITE}/energy-flow`)
    await screen.findByTestId('energy-flow-page')
    await waitFor(() => expect(screen.getByTestId('flow-connection').textContent).toBe('Connecting'))
    // Same API base as every other call: …/v1/solar/sites/:id/live
    expect(liveUrls[liveUrls.length - 1]).toMatch(/\/v1\/solar\/sites\/site-1\/live$/)
    s.push('snapshot', { serverTime: now(), devices: [sysDevice({ pv_power_w: 6000, load_power_w: 1000, grid_power_w: -2000, battery_power_w: 3000, soc_pct: 41 }, new Date(Date.now() + 50).toISOString())] })
    await waitFor(() => expect(screen.getByTestId('flow-grid-direction').textContent).toContain('Exporting to the grid'))
    expect(screen.getByTestId('flow-battery-state').textContent).toBe('Charging from solar')
    expect(screen.getByTestId('flow-connection').textContent).toBe('Streaming')
    expect(screen.getByTestId('energy-flow-live').textContent).toBe('Live')
    expect(screen.getByTestId('solar-split').textContent).toMatch(/Home\s*1\.00 kW/)
    s.push('snapshot', { serverTime: now(), devices: [sysDevice({ pv_power_w: 0, load_power_w: 2000, grid_power_w: 0, battery_power_w: -2000, soc_pct: 40 }, new Date(Date.now() + 100).toISOString())] })
    await waitFor(() => expect(screen.getByTestId('flow-battery-state').textContent).toBe('Discharging to the home'))
    expect(screen.getByTestId('flow-battery-home')).toBeTruthy()
  })

  it('15. phone layout: portrait diagram and single-column value cards', async () => {
    stubFetch({ pv_power_w: 3000, load_power_w: 1000, grid_power_w: 0, battery_power_w: 2000 })
    const { container } = mount(`/ds/solar/${SITE}/energy-flow`)
    await screen.findByTestId('energy-flow-page')
    // The portrait diagram is the one shown below the `sm` breakpoint.
    const svgs = [...container.querySelectorAll('svg[role="img"]')]
    expect(svgs.some((s) => s.getAttribute('viewBox') === '0 0 340 222' && s.getAttribute('class')?.includes('sm:hidden'))).toBe(true)
    expect(svgs.some((s) => s.getAttribute('viewBox') === '0 0 580 212' && /(^| )hidden( |$)/.test(s.getAttribute('class') ?? '') && !!s.getAttribute('class')?.includes('sm:block'))).toBe(true)
    expect(screen.getByTestId('flow-value-solar').parentElement?.className).toMatch(/grid-cols-1/)
  })
})
