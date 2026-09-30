import { describe, expect, it } from 'vitest'
import type { EnergyBucket, EnergyHistory } from './api'
import { toRow } from './energy'
import { bucketCount, mergeWindows, normalizePeriod, presets, rowState, toCsv, windowsFor } from './energyReport'

const b = (key: string, pv: number | null = 1): EnergyBucket => ({
  key,
  start: `${key}T00:00:00Z`,
  end: `${key}T23:59:59Z`,
  partial: false,
  expectedHours: 24,
  completeness: 1,
  pvKwh: pv,
  loadKwh: pv == null ? null : 2,
  gridPositiveKwh: pv == null ? null : 0.5,
  gridNegativeKwh: 0,
  batteryPositiveKwh: null,
  batteryNegativeKwh: null,
})
const resp = (buckets: EnergyBucket[]) => ({ buckets }) as EnergyHistory

describe('energy report periods', () => {
  it('covers a custom daily period with 30-day windows and trims to it', () => {
    const p = { from: '2026-07-15', to: '2026-09-10' }
    const w = windowsFor(p, 'day')
    expect(w).toEqual([
      { range: '30d', anchor: '2026-09-10' },
      // 12 Aug – 10 Sep, then 13 Jul – 11 Aug: two windows reach back past 15 Jul.
      { range: '30d', anchor: '2026-08-11' },
    ])
    const merged = mergeWindows([resp([b('2026-09-10'), b('2026-09-09')]), resp([b('2026-07-14'), b('2026-07-15'), b('2026-09-09')])], p, 'day')
    expect(merged.map((x) => x.key)).toEqual(['2026-07-15', '2026-09-09', '2026-09-10'])
    expect(bucketCount(p, 'day')).toBe(58)
  })

  it('uses 12-month windows for months and 10-year windows for years', () => {
    expect(windowsFor({ from: '2024-03-01', to: '2026-09-30' }, 'month')).toEqual([
      { range: '1y', anchor: '2026-09' },
      { range: '1y', anchor: '2025-09' },
      { range: '1y', anchor: '2024-09' },
    ])
    expect(windowsFor({ from: '2010-01-01', to: '2026-09-30' }, 'year')).toEqual([
      { range: '10y', anchor: '2026' },
      { range: '10y', anchor: '2016' },
    ])
    expect(mergeWindows([resp([b('2024-02'), b('2024-03'), b('2026-09')])], { from: '2024-03-01', to: '2026-09-30' }, 'month').map((x) => x.key)).toEqual(['2024-03', '2026-09'])
  })

  it('normalises periods: order, no future, whole months/years, limits', () => {
    const today = '2026-09-30'
    expect(normalizePeriod({ from: '2026-10-05', to: '2026-09-01' }, 'day', today)).toEqual({ from: '2026-09-01', to: today })
    expect(normalizePeriod({ from: '2026-02-14', to: '2026-05-03' }, 'month', today)).toEqual({ from: '2026-02-01', to: '2026-05-31' })
    expect(normalizePeriod({ from: '2020-06-01', to: '2024-02-01' }, 'year', today)).toEqual({ from: '2020-01-01', to: '2024-12-31' })
    expect(bucketCount(normalizePeriod({ from: '2020-01-01', to: today }, 'day', today), 'day')).toBe(366)
  })

  it('offers presets that end today', () => {
    const p = presets('2026-09-30')
    expect(p.find((x) => x.id === 'last30')?.period).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(p.find((x) => x.id === 'lastMonth')?.period).toEqual({ from: '2026-08-01', to: '2026-08-31' })
    expect(p.find((x) => x.id === 'lastYear')).toMatchObject({ group: 'month', period: { from: '2025-01-01', to: '2025-12-31' } })
    expect(p.find((x) => x.id === 'last10y')).toMatchObject({ group: 'year', period: { from: '2017-01-01' } })
  })
})

describe('CSV export', () => {
  it('writes ISO keys, dot decimals and empty cells for missing values', () => {
    const now = Date.parse('2026-10-01T00:00:00Z')
    const rows = [toRow(b('2026-09-01', 41.289), now), toRow(b('2026-09-02', null), now)]
    const csv = toCsv(rows, { period: 'Datum', columns: { pv: 'PV (kWh)', consumption: 'Verbrauch (kWh)', gridImport: 'Netzbezug (kWh)', batteryCharged: 'Batterie geladen (kWh)', batteryDischarged: 'Batterie entladen (kWh)', coverage: 'PV-Deckung (%)' }, completeness: 'Vollständigkeit (%)', state: 'Status' }, ['Site: Home "Berlin"'])
    const lines = csv.replace(/^\ufeff/, '').trim().split('\r\n')
    expect(lines[0]).toBe('# Site: Home "Berlin"')
    expect(lines[1]).toBe('Datum,PV (kWh),Verbrauch (kWh),Netzbezug (kWh),Batterie geladen (kWh),Batterie entladen (kWh),PV-Deckung (%),Vollständigkeit (%),Status')
    expect(lines[2]).toBe('2026-09-01,41.289,2.000,0.500,,,75.0,100.0,complete')
    expect(lines[3]).toBe('2026-09-02,,,,,,,100.0,no_data')
    expect(csv.startsWith('\ufeff')).toBe(true)
    expect(rowState(rows[0])).toBe('complete')
  })
})
