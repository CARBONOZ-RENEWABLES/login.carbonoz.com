import { describe, expect, it } from 'vitest'
import type { DeviceKind, SolarDevice, SolarOverview } from './api'
import { allMetricRows, buildSite, formatMetric, freshness, headline, metricMeta, solarFlow } from './model'

let seq = 0
function dev(installationId: string, kind: DeviceKind, externalId: string, metrics: Record<string, number | string>, opts: { stale?: boolean; parent?: string; cells?: number } = {}): SolarDevice {
  return {
    installationId,
    kind,
    externalId,
    parentExternalId: opts.parent ?? null,
    firstSeenAt: '2026-09-29T00:00:00Z',
    lastSeenAt: '2026-09-29T00:00:00Z',
    latest: {
      ts: new Date(Date.now() - (opts.stale ? 3 * 3600e3 : 10e3) + seq++).toISOString(),
      stale: !!opts.stale,
      metrics,
      cells: opts.cells ? Array.from({ length: opts.cells }, (_, i) => ({ id: String(i + 1), voltage: 3.3 })) : undefined,
    },
  }
}
const overview = (devices: SolarDevice[], over: Partial<SolarOverview> = {}): SolarOverview => ({
  site: { id: 's', name: 'Site' },
  updatedAt: devices[0]?.latest?.ts ?? null,
  source: devices.length ? 'live' : 'none',
  stale: devices.every((d) => d.latest?.stale),
  activeAlarms: 0,
  hasForecast: false,
  metrics: [],
  devices,
  ...over,
})

describe('headline totals', () => {
  it('sums fresh installations', () => {
    const h = headline(buildSite(overview([dev('A', 'SYSTEM', 'sys', { pv_power_w: 1000, soc_pct: 40 }), dev('B', 'SYSTEM', 'sys', { pv_power_w: 500, soc_pct: 60 })])))
    expect(h.pv).toBe(1500)
    expect(h.soc).toBe(50)
    expect(h.allStale).toBe(false)
    expect(h.excludedInstallations).toBe(0)
  })

  it('never mixes a delayed installation into current totals', () => {
    const h = headline(buildSite(overview([dev('A', 'SYSTEM', 'sys', { pv_power_w: 1000 }), dev('B', 'SYSTEM', 'sys', { pv_power_w: 9999 }, { stale: true })])))
    expect(h.pv).toBe(1000)
    expect(h.excludedInstallations).toBe(1)
    expect(h.allStale).toBe(false)
  })

  it('shows last values, flagged, when everything is delayed', () => {
    const h = headline(buildSite(overview([dev('A', 'SYSTEM', 'sys', { pv_power_w: 700 }, { stale: true })])))
    expect(h.pv).toBe(700)
    expect(h.allStale).toBe(true)
    expect(h.excludedInstallations).toBe(0)
  })

  it('has no values and no flags without data', () => {
    const h = headline(buildSite(overview([])))
    expect(h.pv).toBeUndefined()
    expect(h.allStale).toBe(false)
    expect(freshness(overview([])).label).toBe('No data yet')
  })

  it('falls back to inverters/batteries when no system total exists', () => {
    const h = headline(buildSite(overview([dev('A', 'INVERTER', 'i1', { pv_power_w: 300 }), dev('A', 'INVERTER', 'i2', { pv_power_w: 200 }), dev('A', 'BATTERY', 'b1', { power_w: -100, soc_pct: 80 })])))
    expect(h.pv).toBe(500)
    expect(h.battery).toBe(-100)
    expect(h.soc).toBe(80)
  })
})

describe('site model', () => {
  it('keeps same-id devices of different installations apart and matches BMS within an installation', () => {
    const site = buildSite(
      overview([
        dev('A', 'BATTERY', 'battery-1', { soc_pct: 50 }),
        dev('B', 'BATTERY', 'battery-1', { soc_pct: 80 }),
        dev('A', 'BMS', 'bms-1', {}, { parent: 'battery-1', cells: 16 }),
        dev('B', 'BMS', 'bms-1', {}, { parent: 'battery-1', cells: 8 }),
        dev('B', 'BMS', 'bms-loose', {}, { cells: 3 }),
      ]),
      { A: 'Pi A', B: 'Pi B' },
    )
    expect(site.batteries).toHaveLength(2)
    expect(site.batteries.map((b) => b.bms.map((m) => m.latest!.cells!.length))).toEqual([[16], [8]])
    expect(site.looseBms.map((m) => m.externalId)).toEqual(['bms-loose'])
    expect(site.labelOf(site.batteries[1])).toContain('Pi B')
  })
})

describe('formatting and flow', () => {
  it('formats power, voltages and unknown metrics', () => {
    expect(formatMetric('pv_power_w', 1500)).toEqual({ value: '1.50', unit: 'kW' })
    expect(formatMetric('grid_power_w', -250)).toEqual({ value: '−250', unit: 'W' })
    expect(formatMetric('cell_voltage_min_v', 3.2981)).toEqual({ value: '3.298', unit: 'V' })
    expect(formatMetric('brand_new_metric', 'ok')).toEqual({ value: 'ok', unit: '' })
    expect(metricMeta('brand_new_metric_kw').label).toBe('Brand new metric')
  })

  it('derives home usage from the balance when it is not reported', () => {
    const f = solarFlow({ pv: 3000, load: undefined, grid: 500, battery: 1000, soc: 50, allStale: false, excludedInstallations: 0 })!
    expect(f.load).toBe(2500)
    expect(f.battery_state).toBe('charging')
    expect(f.grid_state).toBe('importing')
  })
})

describe('dynamic metrics', () => {
  it('renders metrics no card was designed for, by value type', () => {
    expect(formatMetric('future_metric', 123)).toEqual({ value: '123', unit: '' })
    expect(formatMetric('heatsink_temperature_c', 41.52)).toEqual({ value: '41.5', unit: '°C' })
    expect(formatMetric('fan_running', true)).toEqual({ value: 'Yes', unit: '' })
    expect(formatMetric('operating_mode', 'Battery first')).toEqual({ value: 'Battery first', unit: '' })
    // Timestamps: ISO strings and epoch seconds/ms under a time-like key.
    const iso = formatMetric('last_balancing_at', '2026-09-30T08:00:00Z').value
    expect(iso).not.toContain('T08')
    expect(iso).toMatch(/2026/)
    expect(formatMetric('last_update_ts', 1790755200).value).toMatch(/2026/)
    expect(formatMetric('last_update_ts', 1790755200000).value).toMatch(/2026/)
    // A number that is not a timestamp stays a number, even under a time-like key.
    expect(formatMetric('uptime', 1790755200).value).toBe('1,790,755,200')
    expect(formatMetric('charge_time', 42).value).toBe('42')
    expect(metricMeta('future_metric').label).toBe('Future metric')
  })

  it('lists every reported value of every device, including new ones, and filters them', () => {
    const devices = [
      dev('A', 'SYSTEM', 'sys', { pv_power_w: 1000, future_metric: 7 }),
      dev('A', 'BMS', 'bms-1', { soc_pct: 60, cell_count: 16 }, { stale: true }),
    ]
    const rows = allMetricRows(devices)
    expect(rows.map((r) => r.key)).toEqual(['pv_power_w', 'future_metric', 'soc_pct', 'cell_count'])
    expect(rows.find((r) => r.key === 'soc_pct')?.stale).toBe(true)
    expect(allMetricRows(devices, 'future').map((r) => r.key)).toEqual(['future_metric'])
    expect(allMetricRows(devices, 'solar').map((r) => r.key)).toEqual(['pv_power_w'])
    expect(allMetricRows([dev('A', 'SYSTEM', 'sys', {})])).toEqual([])
  })

  it('keeps any number of cells per BMS', () => {
    for (const n of [16, 24, 32]) {
      const site = buildSite(overview([dev('A', 'BATTERY', 'b1', { soc_pct: 50 }), dev('A', 'BMS', 'bms-1', { cell_count: n }, { parent: 'b1', cells: n })]))
      expect(site.batteries[0].bms[0].latest?.cells).toHaveLength(n)
    }
  })

  it('flags stale and missing data', () => {
    expect(freshness(overview([dev('A', 'SYSTEM', 'sys', { pv_power_w: 1 }, { stale: true })]))).toEqual({ tone: 'warning', label: 'Delayed' })
    expect(freshness(overview([]))).toEqual({ tone: 'neutral', label: 'No data yet' })
    expect(freshness(undefined).label).toBe('No data yet')
  })
})
