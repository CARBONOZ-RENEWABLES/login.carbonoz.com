import { afterEach, describe, expect, it } from 'vitest'
import { setLanguage } from '../../i18n'
import type { EnergyBucket } from './api'
import { bucketLabel, formatKwh, formatPct, pvCoverage, toRow, totals } from './energy'

afterEach(() => setLanguage('en'))

const bucket = (over: Partial<EnergyBucket> = {}): EnergyBucket => ({
  key: '2026-09-15',
  start: '2026-09-14T22:00:00.000Z',
  end: '2026-09-15T22:00:00.000Z',
  partial: false,
  expectedHours: 24,
  completeness: 1,
  pvKwh: 41.289,
  loadKwh: 14.192,
  gridPositiveKwh: 1.064,
  gridNegativeKwh: 20,
  batteryPositiveKwh: 31.852,
  batteryNegativeKwh: 7.459,
  ...over,
})
const NOW = Date.parse('2026-09-30T12:00:00Z')

describe('energy rows', () => {
  it('maps signed parts with the SolarBMS sign convention and computes PV coverage', () => {
    const r = toRow(bucket(), NOW)
    expect(r).toMatchObject({ pv: 41.289, consumption: 14.192, gridImport: 1.064, gridExport: 20, batteryCharged: 31.852, batteryDischarged: 7.459, incomplete: false, inProgress: false })
    expect(r.coverage).toBeCloseTo(92.503, 2) // (14.192 − 1.064) / 14.192
  })

  it('keeps missing values missing and never invents coverage', () => {
    const r = toRow(bucket({ gridPositiveKwh: null, gridNegativeKwh: null, batteryPositiveKwh: null, batteryNegativeKwh: null }), NOW)
    expect(r).toMatchObject({ gridImport: null, batteryCharged: null, coverage: null, hasData: true })
    const empty = toRow(bucket({ pvKwh: null, loadKwh: null, gridPositiveKwh: null, gridNegativeKwh: null, batteryPositiveKwh: null, batteryNegativeKwh: null, completeness: 0 }), NOW)
    expect(empty).toMatchObject({ hasData: false, incomplete: false, coverage: null })
    expect(pvCoverage(0, 0)).toBeNull()
    expect(pvCoverage(10, 0)).toBe(100)
    expect(pvCoverage(10, 12)).toBe(0)
  })

  it('flags incomplete and running buckets', () => {
    expect(toRow(bucket({ completeness: 0.6 }), NOW).incomplete).toBe(true)
    expect(toRow(bucket({ partial: true }), NOW).incomplete).toBe(true)
    expect(toRow(bucket({ end: '2026-10-01T00:00:00Z', partial: true }), NOW).inProgress).toBe(true)
  })

  it('sums a period without turning gaps into zeros', () => {
    const rows = [toRow(bucket(), NOW), toRow(bucket({ key: '2026-09-16', pvKwh: 10, loadKwh: null, gridPositiveKwh: null, gridNegativeKwh: null }), NOW)]
    const t = totals(rows)
    expect(t.pv).toBe(51.289)
    expect(t.consumption).toBe(14.192)
    expect(t.gridImport).toBe(1.064)
    // Coverage only over buckets with both consumption and grid readings.
    expect(t.coverage).toBeCloseTo(92.503, 2)
    expect(totals([toRow(bucket({ pvKwh: null, loadKwh: null, gridPositiveKwh: null, gridNegativeKwh: null, batteryPositiveKwh: null, batteryNegativeKwh: null }), NOW)]).pv).toBeNull()
  })
})

describe('localized energy labels', () => {
  it('formats dates, kWh and % per language', () => {
    setLanguage('de')
    expect(bucketLabel('2026-09-30', 'day')).toBe('30.09.')
    expect(formatKwh(41.289, 'day')).toBe('41,289 kWh')
    expect(formatPct(92.5).replace(/\s/g, ' ')).toBe('92,5 %')
    expect(bucketLabel('2026-09', 'month', 'long')).toBe('September 2026')
    setLanguage('fr')
    expect(bucketLabel('2026-09-30', 'day')).toBe('30/09')
    expect(formatKwh(1234.5, 'month').replace(/\s/g, ' ')).toBe('1 234,5 kWh')
    setLanguage('es')
    expect(bucketLabel('2026-09', 'month', 'long')).toBe('septiembre de 2026')
    setLanguage('en')
    expect(bucketLabel('2026-09-30', 'day')).toBe('30/09')
    expect(formatKwh(41.289, 'day')).toBe('41.289 kWh')
    expect(formatKwh(null)).toBe('—')
    expect(bucketLabel('2026', 'year')).toBe('2026')
  })
})
