/**
 * Adapter between the normalized Solar API and the dashboard components.
 * Components never read raw metric keys directly: they ask this module for a
 * label, a formatted value and a group, so a metric SolarBMS adds tomorrow is
 * displayed (with a humanized label) without any component change.
 */
import { formatFixed, getLocale, MessageKey, translate } from '../../i18n'
import { power } from '../dashboard/format'
import type { Tone } from '../../design'
import { SOLARBMS_SEMANTICS } from './semantics'
import { DeviceKind, MetricValue, SolarDevice, SolarOverview } from './api'

export interface MetricMeta {
  label: string
  /** Where generic metric lists place it. */
  group: 'power' | 'energy' | 'battery' | 'cells' | 'temperature' | 'electrical' | 'status' | 'other'
  /** Metric shown on the device card headline, in this order. */
  primary?: number
}

/** Known keys get a curated, translated label (`metrics.<key>`); everything else is humanized from the key. */
const KNOWN: Record<string, Omit<MetricMeta, 'label'>> = {
  pv_power_w: { group: 'power', primary: 1 },
  load_power_w: { group: 'power', primary: 2 },
  grid_power_w: { group: 'power', primary: 3 },
  battery_power_w: { group: 'power', primary: 4 },
  inverter_power_w: { group: 'power', primary: 1 },
  output_power_w: { group: 'power', primary: 2 },
  power_w: { group: 'power', primary: 1 },
  soc_pct: { group: 'battery', primary: 1 },
  soh_pct: { group: 'battery' },
  voltage_v: { group: 'electrical', primary: 2 },
  current_a: { group: 'electrical', primary: 3 },
  temperature_c: { group: 'temperature', primary: 4 },
  cycle_count: { group: 'battery' },
  remaining_capacity_ah: { group: 'battery' },
  full_capacity_ah: { group: 'battery' },
  cell_count: { group: 'cells' },
  cell_voltage_min_v: { group: 'cells' },
  cell_voltage_max_v: { group: 'cells' },
  cell_voltage_avg_v: { group: 'cells' },
  cell_voltage_spread_mv: { group: 'cells' },
  cell_voltage_min_id: { group: 'cells' },
  cell_voltage_max_id: { group: 'cells' },
  frequency_hz: { group: 'electrical' },
  grid_frequency_hz: { group: 'electrical' },
}

const UNIT_SUFFIX = /_(kwh|wh|kw|w|mv|v|ma|ah|a|c|pct|hz|s)$/

export function unitOf(key: string, fallback?: string | null): string | undefined {
  if (fallback) return fallback
  const m = key.match(UNIT_SUFFIX)?.[1]
  return m ? ({ kwh: 'kWh', wh: 'Wh', kw: 'kW', w: 'W', mv: 'mV', v: 'V', ma: 'mA', ah: 'Ah', a: 'A', c: '°C', pct: '%', hz: 'Hz', s: 's' } as Record<string, string>)[m] : undefined
}

export function metricMeta(key: string): MetricMeta {
  if (KNOWN[key]) return { ...KNOWN[key], label: translate(`metrics.${key}` as MessageKey) }
  const base = key.replace(UNIT_SUFFIX, '').replace(/_/g, ' ').trim()
  const label = base.charAt(0).toUpperCase() + base.slice(1)
  const group: MetricMeta['group'] = /temp/.test(key)
    ? 'temperature'
    : /^cell/.test(key)
    ? 'cells'
    : /_(k?w)$/.test(key)
    ? 'power'
    : /_(k?wh)$/.test(key)
    ? 'energy'
    : /_(v|mv|a|ma|hz)$/.test(key)
    ? 'electrical'
    : /(status|state|mode|alarm|fault|error|warning)/.test(key)
    ? 'status'
    : 'other'
  return { label: label || key, group }
}

export interface Formatted {
  value: string
  unit: string
}

const ISO_TS = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/
const TS_KEY = /(^|_)(ts|timestamp|time|at|date)$/

/** Epoch seconds/milliseconds under a time-like key → Date; anything else → undefined. */
function epochOf(key: string, v: number): Date | undefined {
  if (!TS_KEY.test(key)) return undefined
  const ms = v > 1e12 && v < 1e14 ? v : v > 1e9 && v < 1e11 ? v * 1000 : undefined
  return ms ? new Date(ms) : undefined
}

const formatTime = (d: Date) => d.toLocaleString(getLocale(), { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })

/**
 * Generic rendering for any metric, including ones SolarBMS adds later:
 * numbers with their unit, booleans as Yes/No, ISO or epoch timestamps as
 * local date/time, other strings as they are.
 */
export function formatMetric(key: string, v: MetricValue | null | undefined, unit?: string | null): Formatted {
  if (v == null || v === '') return { value: '—', unit: '' }
  if (typeof v === 'boolean') return { value: translate(v ? 'common.yes' : 'common.no'), unit: '' }
  if (typeof v === 'string') {
    if (ISO_TS.test(v.trim()) && !Number.isNaN(Date.parse(v))) return { value: formatTime(new Date(v)), unit: '' }
    return { value: v, unit: '' }
  }
  const at = epochOf(key, v)
  if (at) return { value: formatTime(at), unit: '' }
  const u = unitOf(key, unit)
  if (u === 'W') {
    // Same W/kW presentation as the rest of the dashboard; sign kept as reported.
    const p = power(v)
    return { value: `${v < 0 ? '−' : ''}${p.value}`, unit: p.unit }
  }
  const digits = u === 'V' ? (Math.abs(v) < 10 ? 3 : 1) : u === '%' || u === 'mV' ? 0 : u === 'A' || u === '°C' || u === 'kWh' || u === 'kW' ? 1 : Number.isInteger(v) ? 0 : 2
  return { value: formatFixed(v, digits).replace(/^-/, '−'), unit: u ?? '' }
}

export const num = (v: MetricValue | undefined): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

export function deviceTitle(d: Pick<SolarDevice, 'kind' | 'externalId' | 'name' | 'manufacturer' | 'model'>): string {
  if (d.name) return d.name
  const what = [d.manufacturer, d.model].filter(Boolean).join(' ')
  const kind = { SYSTEM: 'System', INVERTER: 'Inverter', BATTERY: 'Battery', BMS: 'BMS' }[d.kind]
  return what ? `${what}` : `${kind} ${d.externalId}`
}

export interface MetricRow {
  device: SolarDevice
  key: string
  value: MetricValue
  /** Time of the reading this value comes from. */
  ts: string
  stale: boolean
}

/**
 * Every value every device currently reports, one row each — the generic view
 * that makes new SolarBMS fields visible without a dedicated card.
 */
export function allMetricRows(devices: SolarDevice[], filter = ''): MetricRow[] {
  const f = filter.trim().toLowerCase()
  const rows: MetricRow[] = []
  for (const d of devices) {
    if (!d.latest) continue
    for (const [key, value] of orderedMetrics(d.latest.metrics)) {
      if (f && !key.includes(f) && !metricMeta(key).label.toLowerCase().includes(f)) continue
      rows.push({ device: d, key, value, ts: d.latest.ts, stale: d.latest.stale })
    }
  }
  return rows
}

/** Headline metrics first (curated order), then every other metric alphabetically. */
export function orderedMetrics(metrics: Record<string, MetricValue>): [string, MetricValue][] {
  return Object.entries(metrics).sort(([a], [b]) => {
    const pa = KNOWN[a]?.primary ?? 99
    const pb = KNOWN[b]?.primary ?? 99
    return pa - pb || a.localeCompare(b)
  })
}

export interface SiteModel {
  /** One SYSTEM device per installation (site totals as SolarBMS reports them). */
  systems: SolarDevice[]
  inverters: SolarDevice[]
  batteries: Array<SolarDevice & { bms: SolarDevice[] }>
  /** BMS not attached to a reported battery. */
  looseBms: SolarDevice[]
  allBms: SolarDevice[]
  unitOf: (kind: DeviceKind, key: string) => string | undefined
  /** Device title, plus the installation name when a site has several. */
  labelOf: (d: SolarDevice) => string
}

/** Device ids are only unique within an installation. */
export const deviceKey = (d: Pick<SolarDevice, 'installationId' | 'kind' | 'externalId'>) => `${d.installationId}:${d.kind}:${d.externalId}`
export const seriesKey = (installationId: string, deviceId: string) => `${installationId}:${deviceId}`

/** Builds the Site → Inverters / Batteries → BMS → Cells tree from the flat device list. */
export function buildSite(o: SolarOverview | undefined, installationNames: Record<string, string> = {}): SiteModel {
  const devices = o?.devices ?? []
  const byKind = (k: DeviceKind) => devices.filter((d) => d.kind === k)
  const allBms = byKind('BMS')
  const batteries = byKind('BATTERY').map((b) => ({
    ...b,
    bms: allBms.filter((m) => m.installationId === b.installationId && m.parentExternalId === b.externalId),
  }))
  const attached = new Set(batteries.flatMap((b) => b.bms.map(deviceKey)))
  const units = new Map((o?.metrics ?? []).map((m) => [`${m.deviceKind}:${m.key}`, m.unit ?? undefined]))
  const several = new Set(devices.map((d) => d.installationId)).size > 1
  return {
    systems: byKind('SYSTEM'),
    inverters: byKind('INVERTER'),
    batteries,
    looseBms: allBms.filter((m) => !attached.has(deviceKey(m))),
    allBms,
    unitOf: (kind, key) => units.get(`${kind}:${key}`) ?? unitOf(key),
    labelOf: (d) => {
      const title = d.kind === 'SYSTEM' ? installationNames[d.installationId] ?? deviceTitle(d) : deviceTitle(d)
      return several && d.kind !== 'SYSTEM' && installationNames[d.installationId] ? `${title} · ${installationNames[d.installationId]}` : title
    },
  }
}

/**
 * Site headline values, summed over every installation.
 *
 * Stale readings are never mixed into current totals: when at least one
 * device is fresh, only fresh devices count and `excludedInstallations` says
 * how many installations were left out (all their readings delayed). When
 * everything is delayed, the last readings are used and `allStale` is set so
 * the UI labels them as such. Prefers the SolarBMS system totals; falls back
 * to inverters/batteries when no system reports a value.
 */
export function headline(site: SiteModel) {
  const all = [...site.systems, ...site.inverters, ...site.batteries].filter((d) => d.latest)
  const anyFresh = all.some((d) => !d.latest!.stale)
  const use = (list: SolarDevice[]) => list.filter((d) => d.latest && (!anyFresh || !d.latest.stale))
  const systems = use(site.systems)
  const inverters = use(site.inverters)
  const batteries = use(site.batteries)
  const installations = new Set(all.map((d) => d.installationId))
  const freshInstallations = new Set(all.filter((d) => !d.latest!.stale).map((d) => d.installationId))
  const sum = (list: SolarDevice[], ...keys: string[]) => {
    const vals = list.map((d) => keys.map((k) => num(d.latest?.metrics[k])).find((v) => v != null)).filter((v): v is number => v != null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) : undefined
  }
  const avg = (vals: (number | undefined)[]) => {
    const v = vals.filter((x): x is number => x != null)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined
  }
  return {
    pv: sum(systems, 'pv_power_w') ?? sum(inverters, 'pv_power_w'),
    load: sum(systems, 'load_power_w'),
    grid: sum(systems, 'grid_power_w'),
    battery: sum(systems, 'battery_power_w') ?? sum(batteries, 'power_w', 'battery_power_w'),
    soc: avg(systems.map((d) => num(d.latest?.metrics.soc_pct))) ?? avg(batteries.map((b) => num(b.latest?.metrics.soc_pct))),
    /** Every reading is delayed: the values are the last known ones. */
    allStale: all.length > 0 && !anyFresh,
    /** Installations left out of the totals because all their readings are delayed. */
    excludedInstallations: anyFresh ? installations.size - freshInstallations.size : 0,
  }
}

export function freshness(o: SolarOverview | undefined): { tone: 'good' | 'warning' | 'neutral'; label: string } {
  if (!o || o.source === 'none' || !o.updatedAt) return { tone: 'neutral', label: translate('solar.fresh.none') }
  return o.stale ? { tone: 'warning', label: translate('solar.fresh.delayed') } : { tone: 'good', label: translate('solar.fresh.live') }
}

/**
 * SolarBMS sign convention, from the one semantic mapping (semantics.ts;
 * still an assumption until SolarBMS confirms it). Energy history and the
 * card hints read it here; the Energy Flow uses flowState.ts.
 */
export const SOLAR_SIGN = {
  gridImportPositive: SOLARBMS_SEMANTICS.grid.positive === 'import',
  batteryChargingPositive: SOLARBMS_SEMANTICS.battery.positive === 'charging',
}
const IDLE_W = SOLARBMS_SEMANTICS.idleW

export function gridHint(w?: number) {
  if (w == null) return undefined
  if (Math.abs(w) <= IDLE_W) return translate('solar.hints.idle')
  return translate((w > 0) === SOLAR_SIGN.gridImportPositive ? 'solar.hints.importing' : 'solar.hints.exporting')
}

export function batteryHint(w?: number) {
  if (w == null) return undefined
  if (Math.abs(w) <= IDLE_W) return translate('solar.hints.idle')
  return translate((w > 0) === SOLAR_SIGN.batteryChargingPositive ? 'solar.hints.charging' : 'solar.hints.discharging')
}

export function metricCardProps(key: string, v: MetricValue | undefined, unit?: string) {
  const f = formatMetric(key, v, unit)
  return { value: f.value, unit: f.unit }
}

export function statusTone(status?: string): Tone {
  const s = (status ?? '').toLowerCase()
  if (!s) return 'neutral'
  if (/(fault|error|alarm|protect|fail|offline)/.test(s)) return 'critical'
  if (/(warn|standby|idle|wait)/.test(s)) return 'warning'
  if (/(normal|ok|online|run|charg|discharg|active|on)/.test(s)) return 'good'
  return 'info'
}
