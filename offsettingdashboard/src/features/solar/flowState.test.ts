import { afterEach, describe, expect, it } from 'vitest'
import { setLanguage } from '../../i18n'
import type { SolarOverview } from './api'
import { CONNECTION_TIMEOUT_MS, DELAYED_AFTER_MS, energyFlowState, liveStatus, sendInterval } from './flowState'
import { batteryLabel, gridLabel, liveText, signedPower, summaryText } from './flowText'
import { applyFrame, LiveDevice, LiveSnapshot, liveInterval, withLive } from './live'
import { SOLAR_SIGN } from './model'
import { SOLARBMS_SEMANTICS } from './semantics'

afterEach(() => {
  setLanguage('en')
  SOLARBMS_SEMANTICS.grid.positive = 'import'
  SOLARBMS_SEMANTICS.battery.positive = 'charging'
})

const flows = (s: ReturnType<typeof energyFlowState>) => Object.fromEntries(s.flows.map((f) => [`${f.from}>${f.to}`, Math.round(f.watts)]))

describe('grid semantics', () => {
  it('1. positive grid power = import (configured convention), shown as GRID → HOME', () => {
    const s = energyFlowState({ pv: 0, load: 2400, grid: 2400, battery: 0 })
    expect(s.grid).toMatchObject({ direction: 'import', power: 2400, magnitude: 2400 })
    expect(flows(s)).toEqual({ 'grid>home': 2400 })
    expect(gridLabel(s.grid)).toBe('Importing from the grid')
    expect(signedPower(s.grid.power)).toBe('+2.40 kW')
  })

  it('2. negative grid power = export: SOLAR → GRID', () => {
    const s = energyFlowState({ pv: 4600, load: 2800, grid: -1800, battery: 0 })
    expect(s.grid.direction).toBe('export')
    expect(flows(s)).toEqual({ 'solar>home': 2800, 'solar>grid': 1800 })
    expect(signedPower(s.grid.power)).toBe('−1.80 kW')
  })

  it('the sign convention comes from one mapping: flipping it flips every direction', () => {
    SOLARBMS_SEMANTICS.grid.positive = 'export'
    SOLARBMS_SEMANTICS.battery.positive = 'discharging'
    const s = energyFlowState({ pv: 0, load: 1000, grid: -1000, battery: 0 })
    expect(s.grid.direction).toBe('import')
    expect(energyFlowState({ pv: 0, load: 500, grid: 0, battery: 500 }).battery.state).toBe('discharging')
    expect(SOLAR_SIGN).toEqual({ gridImportPositive: true, batteryChargingPositive: true }) // energy history: read at load, unchanged
    expect(s.signsConfirmed).toBe(false)
  })

  it('9. no grid reading: direction unknown, no flows, nothing invented', () => {
    const s = energyFlowState({ pv: 3000, load: 1000, battery: 2000 })
    expect(s.grid).toMatchObject({ direction: 'unknown', power: null })
    expect(s.flows).toEqual([])
    expect(s.summary).toEqual({ kind: 'unavailable', reason: 'incomplete' })
    expect(summaryText(s)).toEqual(['Energy flow is currently unavailable: not every power value is reported.'])
    expect(gridLabel(s.grid)).toBe('No grid reading')
  })
})

describe('battery semantics', () => {
  it('3. charging from solar (grid not importing): SOLAR → BATTERY', () => {
    const s = energyFlowState({ pv: 5000, load: 1800, grid: 0, battery: 3200, soc: 60 })
    expect(s.battery).toMatchObject({ state: 'charging', sources: ['solar'], destinations: null, soc: 60 })
    expect(flows(s)).toEqual({ 'solar>battery': 3200, 'solar>home': 1800 })
    expect(batteryLabel(s.battery)).toBe('Charging from solar')
  })

  it('4. charging from the grid (no solar): GRID → BATTERY', () => {
    const s = energyFlowState({ pv: 0, load: 600, grid: 2700, battery: 2100 })
    expect(s.battery.sources).toEqual(['grid'])
    expect(flows(s)).toEqual({ 'grid>battery': 2100, 'grid>home': 600 })
    expect(batteryLabel(s.battery)).toBe('Charging from the grid')
  })

  it('5. discharging to the home (grid not exporting): BATTERY → HOME', () => {
    const s = energyFlowState({ pv: 0, load: 2800, grid: 0, battery: -2800 })
    expect(s.battery).toMatchObject({ state: 'discharging', destinations: ['home'] })
    expect(flows(s)).toEqual({ 'battery>home': 2800 })
    expect(batteryLabel(s.battery)).toBe('Discharging to the home')
  })

  it('6. discharging to the grid (no solar, exporting): BATTERY → GRID and BATTERY → HOME', () => {
    const s = energyFlowState({ pv: 0, load: 500, grid: -1500, battery: -2000 })
    expect(s.battery.destinations).toEqual(['home', 'grid'])
    expect(flows(s)).toEqual({ 'battery>grid': 1500, 'battery>home': 500 })
    expect(batteryLabel(s.battery)).toBe('Discharging to the home and grid')
    const toGridOnly = energyFlowState({ pv: 0, load: 0, grid: -1500, battery: -1500 })
    expect(batteryLabel(toGridOnly.battery)).toBe('Discharging to the grid')
  })

  it('7. idle battery (within the noise threshold)', () => {
    const s = energyFlowState({ pv: 1000, load: 1000, grid: 0, battery: 10 })
    expect(s.battery.state).toBe('idle')
    expect(batteryLabel(s.battery)).toBe('Idle')
    expect(energyFlowState({ pv: 0, load: 0, grid: 0, battery: 0 }).summary).toEqual({ kind: 'idle' })
  })

  it('8. solar and grid both supplying while charging: the battery source is unknown, not invented', () => {
    const s = energyFlowState({ pv: 3000, load: 2000, grid: 1000, battery: 2000 })
    expect(s.battery).toMatchObject({ state: 'charging', sources: null })
    expect(s.flows).toEqual([])
    expect(s.splitKnown).toBe(false)
    expect(batteryLabel(s.battery)).toBe('Charging · source unavailable')
    expect(summaryText(s)).toEqual([
      "Solar is producing; how it is split can't be determined from the readings.",
      "The grid is supplying power; where it goes can't be determined from the readings.",
    ])
  })

  it('discharging while solar exports: the battery destination is unknown', () => {
    const s = energyFlowState({ pv: 2000, load: 1000, grid: -2000, battery: -1000 })
    expect(s.battery).toMatchObject({ state: 'discharging', destinations: null })
    expect(batteryLabel(s.battery)).toBe('Discharging · destination unavailable')
  })

  it('no battery reading: state unknown', () => {
    const s = energyFlowState({ pv: 1000, load: 1000, grid: 0 })
    expect(s.battery).toMatchObject({ state: 'unknown', power: null, sources: null })
    expect(batteryLabel(s.battery)).toBe('No battery reading')
  })
})

describe('solar allocation and balance', () => {
  it('13. solar split shown when every part is determined (single source)', () => {
    const s = energyFlowState({ pv: 8000, load: 3000, grid: -1000, battery: 4000 })
    expect(s.solarAllocation).toEqual({ home: 3000, battery: 4000, grid: 1000 })
    expect(summaryText(s)).toEqual(['Solar is supplying the home, the battery and the grid.'])
  })

  it('14. solar split NOT shown when it is ambiguous; the solar total still is', () => {
    const s = energyFlowState({ pv: 3000, load: 2000, grid: 1000, battery: 2000 })
    expect(s.solarAllocation).toBeNull()
    expect(s.solar.power).toBe(3000)
  })

  it('measurements that do not balance hide every split', () => {
    const s = energyFlowState({ pv: 5000, load: 1000, grid: 0, battery: 0 })
    expect(s.balance).toEqual({ residual: 4000, consistent: false })
    expect(s.flows).toEqual([])
    expect(s.solarAllocation).toBeNull()
    expect(summaryText(s)).toEqual(["The readings don't add up (difference 4.00 kW), so no split is shown."])
  })

  it('small conversion losses are tolerated', () => {
    const s = energyFlowState({ pv: 3000, load: 1000, grid: 0, battery: 1940 })
    expect(s.balance?.consistent).toBe(true)
    expect(s.battery.sources).toEqual(['solar'])
  })

  it('home not reported: calculated from the balance and marked as such', () => {
    const s = energyFlowState({ pv: 3000, grid: 500, battery: 1000 })
    expect(s.load).toEqual({ power: 2500, derived: true })
  })

  it('mixed sources to one sink are determined (solar + grid + battery → home)', () => {
    const s = energyFlowState({ pv: 1000, load: 3000, grid: 1200, battery: -800 })
    expect(flows(s)).toEqual({ 'grid>home': 1200, 'solar>home': 1000, 'battery>home': 800 })
    expect(summaryText(s)).toEqual(['Solar is supplying the home.', 'The grid is supplying the home.', 'The battery is supplying the home.'])
  })

  it('no readings at all', () => {
    expect(energyFlowState({}).summary).toEqual({ kind: 'unavailable', reason: 'noData' })
    expect(summaryText(energyFlowState({}))).toEqual(['Energy flow is currently unavailable.'])
  })

  it('is translated', () => {
    setLanguage('de')
    const s = energyFlowState({ pv: 5000, load: 1800, grid: 0, battery: 3200 })
    expect(summaryText(s)).toEqual(['Solar versorgt das Haus und die Batterie.'])
    expect(batteryLabel(s.battery)).toBe('Lädt mit Solarstrom')
  })
})

describe('freshness and connection', () => {
  const now = Date.parse('2026-10-01T12:00:00Z')
  it('live within 3× the observed send interval', () => {
    expect(liveStatus({ readingAt: now - 2000, now, connection: 'open', intervalMs: 1000 })).toMatchObject({ state: 'live', ageMs: 2000, liveWithinMs: 5000 })
    expect(liveStatus({ readingAt: now - 25_000, now, connection: 'open', intervalMs: 10_000 }).state).toBe('live')
    expect(liveStatus({ readingAt: now - 25_000, now, connection: 'open', intervalMs: null }).state).toBe('live') // 30 s default
  })

  it('10. stale readings: delayed, then offline after 5 minutes', () => {
    const d = liveStatus({ readingAt: now - 8000, now, connection: 'open', intervalMs: 1000 })
    expect(d.state).toBe('delayed')
    expect(liveText(d)).toMatchObject({ label: 'Delayed', detail: 'Last update 8s ago', tone: 'warning', pulse: false })
    expect(liveStatus({ readingAt: now - DELAYED_AFTER_MS - 1, now, connection: 'open', intervalMs: 1000 }).state).toBe('offline')
  })

  it('11. lost connection: offline, even with a recent reading', () => {
    const s = liveStatus({ readingAt: now - 42_000, now, connection: 'lost', intervalMs: 10_000 })
    expect(s.state).toBe('offline')
    expect(liveText(s)).toMatchObject({ label: 'Offline', detail: 'Last update 42s ago' })
    expect(CONNECTION_TIMEOUT_MS).toBe(5000)
  })

  it('connecting and waiting are not "live"', () => {
    expect(liveStatus({ readingAt: now - 1000, now, connection: 'connecting', intervalMs: null }).state).toBe('connecting')
    expect(liveStatus({ readingAt: null, now, connection: 'open', intervalMs: null }).state).toBe('waiting')
    expect(liveText(liveStatus({ readingAt: now - 500, now, connection: 'open', intervalMs: 1000 }))).toMatchObject({ label: 'Live', detail: 'Updated just now', pulse: true })
  })

  it('send interval = median gap between distinct reading times', () => {
    expect(sendInterval([0, 1000, 2000, 2000, 3100, 9000])).toBe(1000)
    expect(sendInterval([5])).toBeNull()
  })
})

describe('12. realtime updates', () => {
  const sys = (ts: string, metrics: Record<string, number>): LiveDevice => ({ installationId: 'i1', kind: 'SYSTEM', externalId: 'sys', ts, metrics })
  it('snapshots replace the readings; heartbeats only keep the connection alive; clock offset from the server', () => {
    const e = { state: { devices: null, connection: 'connecting', clockOffsetMs: 0, lastFrameAt: null, readingTimes: [], available: true } as LiveSnapshot, listeners: new Set<() => void>() }
    let notified = 0
    e.listeners.add(() => notified++)
    applyFrame(e, 'snapshot', { serverTime: new Date(Date.now() + 3000).toISOString(), devices: [sys('2026-10-01T12:00:00Z', { grid_power_w: 2400 })] })
    expect(e.state.connection).toBe('open')
    expect(Math.round(e.state.clockOffsetMs / 1000)).toBe(3)
    const first = e.state.devices
    applyFrame(e, 'heartbeat', { serverTime: new Date().toISOString(), available: true })
    expect(e.state.devices).toBe(first) // same reference: views reading only the devices don't re-render
    applyFrame(e, 'snapshot', { serverTime: new Date().toISOString(), devices: [sys('2026-10-01T12:00:01Z', { grid_power_w: -1800 })] })
    expect(e.state.devices?.[0].metrics.grid_power_w).toBe(-1800)
    expect(liveInterval(e.state)).toBe(1000)
    expect(notified).toBe(3)
  })

  it('a newer live reading replaces the polled one in the overview; an older one does not', () => {
    const o = {
      updatedAt: '2026-10-01T12:00:00Z',
      source: 'live',
      stale: false,
      devices: [{ installationId: 'i1', kind: 'SYSTEM', externalId: 'sys', firstSeenAt: '', lastSeenAt: '', latest: { ts: '2026-10-01T12:00:00Z', stale: false, metrics: { grid_power_w: 100 } } }],
    } as unknown as SolarOverview
    const now = Date.parse('2026-10-01T12:00:02Z')
    const newer = withLive(o, [sys('2026-10-01T12:00:01Z', { grid_power_w: -900 })], now)
    expect(newer.devices[0].latest?.metrics.grid_power_w).toBe(-900)
    expect(newer.updatedAt).toBe('2026-10-01T12:00:01.000Z')
    const older = withLive(o, [sys('2026-10-01T11:59:00Z', { grid_power_w: 5 })], now)
    expect(older.devices[0].latest?.metrics.grid_power_w).toBe(100)
  })
})
