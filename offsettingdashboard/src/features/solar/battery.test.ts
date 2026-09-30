import { describe, expect, it } from 'vitest'
import type { SolarDevice } from './api'
import { batteryFigures } from './battery'

const battery = (metrics: Record<string, number>): SolarDevice => ({
  installationId: 'i',
  kind: 'BATTERY',
  externalId: 'b1',
  firstSeenAt: '2026-09-30T00:00:00Z',
  lastSeenAt: '2026-09-30T00:00:00Z',
  latest: { ts: '2026-09-30T00:00:00Z', stale: false, metrics },
})

describe('battery figures', () => {
  it('reads state and estimates time to full while charging', () => {
    // 51.2 V × (100 − 60) Ah = 2.048 kWh to go at 1.024 kW → 2 h.
    const f = batteryFigures(battery({ soc_pct: 60, voltage_v: 51.2, power_w: 1024, remaining_capacity_ah: 60, full_capacity_ah: 100 }))
    expect(f).toMatchObject({ soc: 60, state: 'charging', power: 1024 })
    expect(f.etaHours).toBeCloseTo(2, 5)
  })

  it('estimates time to empty while discharging and derives power from V × A', () => {
    const f = batteryFigures(battery({ voltage_v: 50, current_a: -20, remaining_capacity_ah: 40, full_capacity_ah: 100 }))
    expect(f.power).toBe(-1000)
    expect(f.state).toBe('discharging')
    expect(f.etaHours).toBeCloseTo(2, 5) // 50 V × 40 Ah = 2 kWh at 1 kW
  })

  it('is idle near zero and never guesses an estimate without capacity', () => {
    expect(batteryFigures(battery({ power_w: 10 })).state).toBe('idle')
    expect(batteryFigures(battery({ power_w: 800, voltage_v: 50 })).etaHours).toBeUndefined()
    expect(batteryFigures(battery({})).state).toBe('idle')
  })
})
