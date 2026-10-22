import { describe, expect, it } from 'vitest'
import type { SolarDevice } from './api'
import { isHostMetric, settingsOf, socRatePerHour } from './fields'
import { inverterFigures } from './inverter'
import { formatMetric } from './model'

const inv = (metrics: SolarDevice['latest'] extends infer L ? (L extends { metrics: infer M } ? M : never) : never): SolarDevice => ({
  installationId: 'i',
  kind: 'INVERTER',
  externalId: 'inverter-1',
  firstSeenAt: '2026-10-22T00:00:00Z',
  lastSeenAt: '2026-10-22T00:00:00Z',
  latest: { ts: '2026-10-22T00:00:00Z', stale: false, metrics },
})

describe('Raspberry health values are not charted', () => {
  it('recognises CPU, memory, storage and network values, not solar ones', () => {
    for (const k of ['cpu_temperature_c', 'cpu_usage_pct', 'free_memory_mb', 'free_storage_gb', 'pi_uptime_s', 'wifi_rssi', 'disk_used_pct']) expect(isHostMetric(k)).toBe(true)
    for (const k of ['pv_power_w', 'battery_temperature_c', 'load_percentage', 'temperature_mos_c', 'grid_voltage_v', 'cell_voltage_max_v']) expect(isHostMetric(k)).toBe(false)
  })
})

describe('Solar Assistant fields on the inverter card', () => {
  it('reads temperature (highest/AC/DC), device mode, grid, generator and load split', () => {
    const f = inverterFigures(
      inv({ ac_output_power_w: 1960, temperature_highest_c: 48.2, temperature_ac_c: 48.2, temperature_dc_c: 43.8, device_mode: 'Discharge above 30%', grid_power_w: 0, grid_voltage_v: 242, grid_frequency_hz: 50.1, generator_power_w: 2, load_power_w: 1960, load_power_essential_w: 1960, load_power_non_essential_w: 0, energy_pattern: 'Load first', work_mode_timer: '00:00-06:00 Grid charge', inverter_time: '2026-10-22T15:41:00+04:00' }),
    )
    expect(f).toMatchObject({ temperature: 48.2, temperatureAc: 48.2, temperatureDc: 43.8, deviceMode: 'Discharge above 30%', grid: { power: 0, voltage: 242, frequency: 50.1 }, generator: 2, loadEssential: 1960, loadNonEssential: 0 })
    expect(f.settings.map(([k]) => k)).toEqual(['energy_pattern', 'inverter_time', 'work_mode_timer'])
    // Nothing shown above is repeated under "All inverter values".
    for (const k of ['device_mode', 'grid_voltage_v', 'generator_power_w', 'energy_pattern', 'temperature_dc_c']) expect(f.used.has(k)).toBe(true)
  })

  it('settings are text values only, measurements are not settings', () => {
    expect(settingsOf({ work_mode: 'Self use', mode_pct: 30, pv_power_w: 100 }).map(([k]) => k)).toEqual(['work_mode'])
  })
})

describe('units and charge rate', () => {
  it('load percentage shows a % sign', () => {
    expect(formatMetric('load_percentage', 2.97)).toEqual({ value: '3', unit: '%' })
  })

  it('SoC trend in %/h over at least 15 minutes', () => {
    const t0 = Date.UTC(2026, 9, 22, 12)
    // −7.2 %/h: 97 % falling 0.6 % every 5 minutes.
    const pts = Array.from({ length: 12 }, (_, i) => ({ t: t0 + i * 300e3, v: 97 - 0.6 * i }))
    expect(socRatePerHour(pts)).toBeCloseTo(-7.2, 5)
    expect(socRatePerHour(pts.slice(0, 2))).toBeUndefined()
    expect(socRatePerHour(pts.slice(0, 3))).toBeUndefined() // only 10 minutes
  })
})
