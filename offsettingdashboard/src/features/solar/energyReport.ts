/**
 * Energy table / report: any period the user picks, served by the existing
 * GET /solar/sites/:id/energy windows (30 days · 12 months · 10 years), merged
 * and trimmed client-side. Also the CSV export and period presets.
 */
import type { EnergyBucket, EnergyHistory, EnergyRange } from './api'
import { EnergyRow, Resolution } from './energy'

export type Group = Resolution // 'day' | 'month' | 'year'

/** Inclusive period as calendar keys of the site: YYYY-MM-DD. */
export interface Period {
  from: string
  to: string
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const parse = (s: string) => {
  const [y, m = 1, d = 1] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
export const addDays = (s: string, n: number) => {
  const d = parse(s)
  d.setUTCDate(d.getUTCDate() + n)
  return ymd(d)
}
const addMonths = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number)
  const i = y * 12 + m - 1 + n
  return `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`
}
const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400e3)

/** Today in the site's zone, `YYYY-MM-DD` (never the viewer's zone). */
export const todayIn = (tz: string, now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)

/** Limits keep a report to a sensible number of API calls and rows. */
export const LIMITS: Record<Group, number> = { day: 366, month: 120, year: 30 }

/** Buckets of a period at a resolution: days, months or years. */
export function bucketCount(p: Period, g: Group): number {
  if (g === 'day') return daysBetween(p.from, p.to) + 1
  if (g === 'month') {
    const [fy, fm] = p.from.split('-').map(Number)
    const [ty, tm] = p.to.split('-').map(Number)
    return (ty - fy) * 12 + (tm - fm) + 1
  }
  return Number(p.to.slice(0, 4)) - Number(p.from.slice(0, 4)) + 1
}

/** Normalises a period: ordered, not in the future, snapped to whole months/years, within limits. */
export function normalizePeriod(p: Period, g: Group, today: string): Period {
  let { from, to } = p.from <= p.to ? p : { from: p.to, to: p.from }
  if (to > today) to = today
  if (from > to) from = to
  if (g === 'month') {
    from = `${from.slice(0, 7)}-01`
    to = to.slice(0, 7) === today.slice(0, 7) ? today : addDays(`${addMonths(to.slice(0, 7), 1)}-01`, -1)
  }
  if (g === 'year') {
    from = `${from.slice(0, 4)}-01-01`
    to = to.slice(0, 4) === today.slice(0, 4) ? today : `${to.slice(0, 4)}-12-31`
  }
  // Too long: keep the most recent part.
  const max = LIMITS[g]
  if (bucketCount({ from, to }, g) > max) {
    from =
      g === 'day'
        ? addDays(to, -(max - 1))
        : g === 'month'
        ? `${addMonths(to.slice(0, 7), -(max - 1))}-01`
        : `${Number(to.slice(0, 4)) - (max - 1)}-01-01`
  }
  return { from, to }
}

/** API windows that together cover the period (newest first). */
export function windowsFor(p: Period, g: Group): { range: EnergyRange; anchor: string }[] {
  const out: { range: EnergyRange; anchor: string }[] = []
  if (g === 'day') {
    for (let a = p.to; a >= p.from; a = addDays(a, -30)) out.push({ range: '30d', anchor: a })
  } else if (g === 'month') {
    const first = p.from.slice(0, 7)
    for (let a = p.to.slice(0, 7); a >= first; a = addMonths(a, -12)) out.push({ range: '1y', anchor: a })
  } else {
    const first = Number(p.from.slice(0, 4))
    for (let a = Number(p.to.slice(0, 4)); a >= first; a -= 10) out.push({ range: '10y', anchor: String(a) })
  }
  return out
}

/** Buckets of all windows, de-duplicated, trimmed to the period, oldest first. */
export function mergeWindows(responses: EnergyHistory[], p: Period, g: Group): EnergyBucket[] {
  const lo = g === 'day' ? p.from : g === 'month' ? p.from.slice(0, 7) : p.from.slice(0, 4)
  const hi = g === 'day' ? p.to : g === 'month' ? p.to.slice(0, 7) : p.to.slice(0, 4)
  const byKey = new Map<string, EnergyBucket>()
  for (const r of responses) for (const b of r.buckets) if (b.key >= lo && b.key <= hi) byKey.set(b.key, b)
  return [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : 1))
}

export type PresetId = 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'last90' | 'thisYear' | 'lastYear' | 'last12m' | 'last10y'

/** Named periods (in the site's calendar), each with the resolution it reads best at. */
export function presets(today: string): { id: PresetId; group: Group; period: Period }[] {
  const month = today.slice(0, 7)
  const year = Number(today.slice(0, 4))
  const lastMonth = addMonths(month, -1)
  return [
    { id: 'last7', group: 'day', period: { from: addDays(today, -6), to: today } },
    { id: 'last30', group: 'day', period: { from: addDays(today, -29), to: today } },
    { id: 'thisMonth', group: 'day', period: { from: `${month}-01`, to: today } },
    { id: 'lastMonth', group: 'day', period: { from: `${lastMonth}-01`, to: addDays(`${month}-01`, -1) } },
    { id: 'last90', group: 'day', period: { from: addDays(today, -89), to: today } },
    { id: 'thisYear', group: 'month', period: { from: `${year}-01-01`, to: today } },
    { id: 'lastYear', group: 'month', period: { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` } },
    { id: 'last12m', group: 'month', period: { from: `${addMonths(month, -11)}-01`, to: today } },
    { id: 'last10y', group: 'year', period: { from: `${year - 9}-01-01`, to: today } },
  ]
}

export type ExportColumn = 'pv' | 'consumption' | 'gridImport' | 'batteryCharged' | 'batteryDischarged' | 'coverage'
export const EXPORT_COLUMNS: ExportColumn[] = ['pv', 'consumption', 'gridImport', 'batteryCharged', 'batteryDischarged', 'coverage']

/** Machine-readable state of a row, for exports. */
export const rowState = (r: EnergyRow): 'no_data' | 'in_progress' | 'incomplete' | 'complete' => (!r.hasData ? 'no_data' : r.inProgress ? 'in_progress' : r.incomplete ? 'incomplete' : 'complete')

const csvCell = (v: string) => (/[",;\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/**
 * CSV: ISO period keys and dot-decimal numbers (kWh, %) so any spreadsheet or
 * script reads it; empty cells where there was no reading (never 0).
 */
export function toCsv(rows: EnergyRow[], headers: { period: string; columns: Record<ExportColumn, string>; completeness: string; state: string }, meta: string[] = []): string {
  const num = (v: number | null, d: number) => (v == null ? '' : v.toFixed(d))
  const lines = [
    ...meta.map((m) => `# ${m}`),
    [headers.period, ...EXPORT_COLUMNS.map((c) => headers.columns[c]), headers.completeness, headers.state].map(csvCell).join(','),
    ...rows.map((r) =>
      [r.key, ...EXPORT_COLUMNS.map((c) => num(r[c], c === 'coverage' ? 1 : 3)), r.completeness == null ? '' : (r.completeness * 100).toFixed(1), rowState(r)].map(csvCell).join(','),
    ),
  ]
  // BOM: Excel opens UTF-8 (umlauts, accents) correctly.
  return '\ufeff' + lines.join('\r\n') + '\r\n'
}

export function download(filename: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const slug = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'site'
