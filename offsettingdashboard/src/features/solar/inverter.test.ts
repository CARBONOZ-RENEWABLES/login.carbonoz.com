import { describe, expect, it } from 'vitest'
import type { SolarDevice } from './api'
import { seriesStats } from './energy'
import { inverterFigures } from './inverter'

const inv = (metrics: Record<string, number>, status?: string): SolarDevice => ({
  installationId: 'i',
  kind: 'INVERTER',
  externalId: 'inv-1',
  firstSeenAt: '2026-09-30T00:00:00Z',
  lastSeenAt: '2026-09-30T00:00:00Z',
  latest: { ts: '2026-09-30T00:00:00Z', stale: false, status, metrics },
})

describe('inverter figures', () => {
  it('reads output, input, efficiency, load and strings from common keys', () => {
    const f = inverterFigures(inv({ power_w: 4600, pv_power_w: 4800, rated_power_w: 6000, ac_frequency_hz: 50.01, temperature_c: 41, daily_yield_kwh: 12.4, pv1_voltage_v: 380, pv1_current_a: 6.2, pv2_power_w: 2100 }))
    expect(f).toMatchObject({ output: 4600, pvInput: 4800, frequency: 50.01, temperature: 41, yieldToday: 12.4, state: 'producing' })
    expect(f.efficiency).toBeCloseTo(95.83, 1)
    expect(f.load).toBeCloseTo(0.7667, 3)
    expect(f.strings).toEqual([
      { id: '1', voltage: 380, current: 6.2 },
      { id: '2', power: 2100 },
    ])
    expect(f.used.has('pv1_voltage_v') && f.used.has('power_w')).toBe(true)
  })

  it('is standby at night, fault on a fault status, and never invents a rating', () => {
    expect(inverterFigures(inv({ power_w: 0, ac_frequency_hz: 50 }, 'Standby'))).toMatchObject({ state: 'standby', load: undefined, efficiency: undefined })
    expect(inverterFigures(inv({ power_w: 3000 }, 'Fault: isolation')).state).toBe('fault')
    expect(inverterFigures(inv({ output_power_w: 900 })).rated).toBeUndefined()
  })
})

describe('chart statistics', () => {
  it('computes min/max/mean/total over existing values only', () => {
    const rows = [{ pv: 10 }, { pv: null }, { pv: 30 }] as never
    expect(seriesStats(rows, 'pv')).toMatchObject({ min: 10, max: 30, mean: 20, total: 40, last: 30, count: 2 })
    expect(seriesStats([{ pv: null }] as never, 'pv')).toBeNull()
  })
})
