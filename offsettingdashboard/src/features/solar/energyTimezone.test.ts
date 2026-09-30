/**
 * Energy history is site-time-zone based: the API sends calendar keys of the
 * site's zone, and the viewer's browser zone must never move a bucket to
 * another day, month or year, or change a total.
 */
import dayjs from 'dayjs'
import { afterAll, describe, expect, it } from 'vitest'
import { setLanguage } from '../../i18n'
import type { EnergyBucket } from './api'
import { bucketLabel, periodLabel, toRow, totals } from './energy'
import { mergeWindows, normalizePeriod, presets, todayIn, windowsFor } from './energyReport'

// Tests run in Node: its TZ plays the browser's zone (no Node types in this tsconfig).
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env
const original = env.TZ
afterAll(() => {
  env.TZ = original
  setLanguage('en')
})

// Buckets exactly as GET /energy returns them for a Europe/Berlin site:
// keys are Berlin calendar days/months/years, start/end are Berlin midnights in UTC.
const b = (key: string, start: string, end: string, pv: number, grid = 1): EnergyBucket => ({
  key,
  start,
  end,
  partial: false,
  expectedHours: (Date.parse(end) - Date.parse(start)) / 3600e3,
  completeness: 1,
  pvKwh: pv,
  loadKwh: pv + 2,
  gridPositiveKwh: grid,
  gridNegativeKwh: 0.5,
  batteryPositiveKwh: 0.8,
  batteryNegativeKwh: 0.6,
})
const DAYS = [
  b('2026-03-28', '2026-03-27T23:00:00.000Z', '2026-03-28T23:00:00.000Z', 10), // before spring forward
  b('2026-03-29', '2026-03-28T23:00:00.000Z', '2026-03-29T22:00:00.000Z', 11), // 23 h
  b('2025-10-26', '2025-10-25T22:00:00.000Z', '2025-10-26T23:00:00.000Z', 12), // 25 h
  b('2026-08-31', '2026-08-30T22:00:00.000Z', '2026-08-31T22:00:00.000Z', 13), // month end
  b('2026-09-01', '2026-08-31T22:00:00.000Z', '2026-09-01T22:00:00.000Z', 14), // 1st, 00:00 Berlin = 22:00Z the day before
  b('2026-09-30', '2026-09-29T22:00:00.000Z', '2026-09-30T22:00:00.000Z', 15),
  b('2025-12-31', '2025-12-30T23:00:00.000Z', '2025-12-31T23:00:00.000Z', 16),
  b('2026-01-01', '2025-12-31T23:00:00.000Z', '2026-01-01T23:00:00.000Z', 17), // New Year, 23:00Z the day before
]
const MONTHS = [b('2026-09', '2026-08-31T22:00:00.000Z', '2026-09-30T22:00:00.000Z', 400), b('2026-01', '2025-12-31T23:00:00.000Z', '2026-01-31T23:00:00.000Z', 200)]
const YEARS = [b('2025', '2024-12-31T23:00:00.000Z', '2025-12-31T23:00:00.000Z', 5000), b('2026', '2025-12-31T23:00:00.000Z', '2026-12-31T23:00:00.000Z', 4000)]
const NOW = Date.parse('2026-10-15T12:00:00Z')

const BROWSERS = ['Europe/Berlin', 'Africa/Kigali', 'UTC', 'America/New_York', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']

function snapshot() {
  const out: Record<string, unknown> = {}
  for (const lang of ['en', 'de'] as const) {
    setLanguage(lang)
    const rows = DAYS.map((x) => toRow(x, NOW))
    out[lang] = {
      rows,
      dayLabels: DAYS.map((x) => [bucketLabel(x.key, 'day'), bucketLabel(x.key, 'day', 'medium'), bucketLabel(x.key, 'day', 'long')]),
      monthLabels: MONTHS.map((x) => [bucketLabel(x.key, 'month'), bucketLabel(x.key, 'month', 'long')]),
      yearLabels: YEARS.map((x) => bucketLabel(x.key, 'year')),
      period: periodLabel(DAYS.slice(3, 6), 'day'),
      totals: totals(rows),
      monthTotals: totals(MONTHS.map((x) => toRow(x, NOW))),
      yearTotals: totals(YEARS.map((x) => toRow(x, NOW))),
    }
  }
  // Table period logic (keys only) and the site's "today".
  out.today = todayIn('Europe/Berlin', new Date('2026-09-30T22:30:00Z'))
  out.presets = presets('2026-10-01')
  out.windows = windowsFor(normalizePeriod({ from: '2026-08-31', to: '2026-09-01' }, 'day', '2026-10-01'), 'day')
  out.merged = mergeWindows([{ buckets: DAYS } as never], { from: '2026-08-31', to: '2026-09-01' }, 'day').map((x) => x.key)
  // Date picker round trip: a key shown and picked in any browser zone stays the same key.
  out.picker = DAYS.map((x) => dayjs(x.key).format('YYYY-MM-DD'))
  return out
}

describe('energy history in different browser time zones (Berlin site)', () => {
  const results = BROWSERS.map((tz) => {
    env.TZ = tz
    // Offsets in winter and summer (Berlin and Kigali are both UTC+2 in September).
    return { tz, offset: `${new Date('2026-01-15T12:00:00Z').getTimezoneOffset()}/${new Date('2026-09-30T12:00:00Z').getTimezoneOffset()}`, snap: snapshot() }
  })

  it('really ran in different browser zones', () => {
    expect(new Set(results.map((r) => r.offset)).size).toBe(BROWSERS.length)
  })

  it.each(BROWSERS)('viewed from %s: identical days, months, years, labels and totals', (tz) => {
    const berlin = results[0].snap
    expect(results.find((r) => r.tz === tz)!.snap).toEqual(berlin)
  })

  it('keeps the Berlin calendar: midnight, month, year and DST buckets', () => {
    const en = results.find((r) => r.tz === 'America/New_York')!.snap.en as { rows: { key: string; pv: number | null }[]; dayLabels: string[][]; monthLabels: string[][]; yearLabels: string[] }
    // 1 Sep (Berlin) starts at 31 Aug 22:00Z: still labelled 1 Sep in New York.
    expect(en.dayLabels[4]).toEqual(['01/09', '1 Sept', 'Tue, 01/09/2026'])
    expect(en.dayLabels[7][0]).toBe('01/01')
    expect(en.dayLabels[1][0]).toBe('29/03')
    expect(en.dayLabels[2][0]).toBe('26/10')
    expect(en.monthLabels).toEqual([['Sept 26', 'September 2026'], ['Jan 26', 'January 2026']])
    expect(en.yearLabels).toEqual(['2025', '2026'])
    expect(en.rows.map((r) => [r.key, r.pv])).toEqual(DAYS.map((x) => [x.key, x.pvKwh]))
    // Site "today" is Berlin's (1 Oct at 00:30 Berlin), not the New York browser's 30 Sep.
    expect(results[3].snap.today).toBe('2026-10-01')
  })
})
