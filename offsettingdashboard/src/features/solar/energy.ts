/**
 * Adapter between GET /solar/sites/:id/energy and the energy history view:
 * sign convention, PV coverage, totals and locale-aware labels. Missing
 * values stay `null` all the way to the screen.
 */
import { formatDate, formatNumber } from '../../i18n'
import type { EnergyBucket, EnergyHistory } from './api'
import { SOLAR_SIGN } from './model'

export type Resolution = EnergyHistory['resolution']

export interface EnergyRow {
  key: string
  start: string
  pv: number | null
  consumption: number | null
  gridImport: number | null
  gridExport: number | null
  batteryCharged: number | null
  batteryDischarged: number | null
  /** Share of consumption not drawn from the grid, 0–100 (PV directly or via the battery). */
  coverage: number | null
  /** Readings cover less of the bucket than expected (gap, data started, or still running). */
  incomplete: boolean
  /** The bucket isn't over yet (today, this month, this year). */
  inProgress: boolean
  completeness: number | null
  hasData: boolean
}

/** Below this share of expected readings a bucket is marked incomplete. */
export const COMPLETE_AT = 0.95

/**
 * PV coverage = (consumption − grid import) / consumption: how much of what the
 * home used did not come from the grid. Needs both values; never assumes 0.
 */
export function pvCoverage(consumption: number | null, gridImport: number | null): number | null {
  if (consumption == null || gridImport == null || consumption <= 0) return null
  return Math.min(100, Math.max(0, ((consumption - gridImport) / consumption) * 100))
}

export function toRow(b: EnergyBucket, now = Date.now()): EnergyRow {
  const gridImport = SOLAR_SIGN.gridImportPositive ? b.gridPositiveKwh : b.gridNegativeKwh
  const gridExport = SOLAR_SIGN.gridImportPositive ? b.gridNegativeKwh : b.gridPositiveKwh
  const batteryCharged = SOLAR_SIGN.batteryChargingPositive ? b.batteryPositiveKwh : b.batteryNegativeKwh
  const batteryDischarged = SOLAR_SIGN.batteryChargingPositive ? b.batteryNegativeKwh : b.batteryPositiveKwh
  const hasData = [b.pvKwh, b.loadKwh, gridImport, batteryCharged].some((v) => v != null)
  const inProgress = Date.parse(b.end) > now
  return {
    key: b.key,
    start: b.start,
    pv: b.pvKwh,
    consumption: b.loadKwh,
    gridImport,
    gridExport,
    batteryCharged,
    batteryDischarged,
    coverage: pvCoverage(b.loadKwh, gridImport),
    completeness: b.completeness,
    incomplete: hasData && (b.partial || (b.completeness != null && b.completeness < COMPLETE_AT)),
    inProgress,
    hasData,
  }
}

const sum = (vals: (number | null)[]) => {
  const v = vals.filter((x): x is number => x != null)
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) * 1000) / 1000 : null
}

/** Period totals; a metric without any value stays null. */
export function totals(rows: EnergyRow[]) {
  const t = {
    pv: sum(rows.map((r) => r.pv)),
    consumption: sum(rows.map((r) => r.consumption)),
    gridImport: sum(rows.map((r) => r.gridImport)),
    batteryCharged: sum(rows.map((r) => r.batteryCharged)),
    batteryDischarged: sum(rows.map((r) => r.batteryDischarged)),
  }
  // Coverage over the buckets that have both values, so a gap doesn't skew it.
  const both = rows.filter((r) => r.consumption != null && r.gridImport != null)
  return { ...t, coverage: pvCoverage(sum(both.map((r) => r.consumption)), sum(both.map((r) => r.gridImport))) }
}

/** Calendar key → a UTC date on that day, so formatting never shifts it by the viewer's zone. */
const keyDate = (key: string) => {
  const [y, m = 1, d = 1] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12))
}

/** Axis/table label: 30.09. (de) · 30/09 (en, fr, es) · Sep 26 · 2026; `medium` = "5 Mar" / "5. März". */
export function bucketLabel(key: string, res: Resolution, style: 'short' | 'medium' | 'long' = 'short'): string {
  const d = keyDate(key)
  if (res === 'year') return key
  if (style === 'medium') return formatDate(d, res === 'month' ? { month: 'short' } : { day: 'numeric', month: 'short' }, 'UTC')
  if (res === 'month') return formatDate(d, style === 'long' ? { month: 'long', year: 'numeric' } : { month: 'short', year: '2-digit' }, 'UTC')
  return formatDate(d, style === 'long' ? { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' } : { day: '2-digit', month: '2-digit' }, 'UTC')
}

/** "1 Sep – 30 Sep 2026" style range caption. */
export function periodLabel(rows: { key: string }[], res: Resolution): string {
  if (!rows.length) return ''
  const a = rows[0].key
  const b = rows[rows.length - 1].key
  if (res === 'year') return `${a} – ${b}`
  if (res === 'month') return `${bucketLabel(a, res, 'long')} – ${bucketLabel(b, res, 'long')}`
  return `${formatDate(keyDate(a), { day: 'numeric', month: 'short' }, 'UTC')} – ${formatDate(keyDate(b), { day: 'numeric', month: 'short', year: 'numeric' }, 'UTC')}`
}

/** Energy in the current locale: 41.289 (en) · 41,289 (de). Fewer decimals for larger totals. */
export function formatKwh(v: number | null, res: Resolution = 'day'): string {
  if (v == null) return '—'
  const digits = res === 'day' ? 3 : res === 'month' ? 1 : 0
  return `${formatNumber(v, { minimumFractionDigits: digits, maximumFractionDigits: digits })} kWh`
}

export function formatPct(v: number | null): string {
  return v == null ? '—' : formatNumber(v / 100, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

export type GrafanaKey = 'pv' | 'consumption' | 'gridImport' | 'coverage'

/** Min / max / mean / total over the values that exist (gaps are not zeros). */
export function seriesStats(rows: EnergyRow[], key: GrafanaKey) {
  const v = rows.map((r) => r[key]).filter((x): x is number => x != null)
  if (!v.length) return null
  const total = v.reduce((a, b) => a + b, 0)
  return { min: Math.min(...v), max: Math.max(...v), mean: total / v.length, total, last: v[v.length - 1], count: v.length }
}
