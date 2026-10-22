import { baseAPI } from '../../lib/api/api'

export type DeviceKind = 'SYSTEM' | 'INVERTER' | 'BATTERY' | 'BMS'
export type MetricValue = number | string | boolean

export interface SiteSummary {
  id: string
  name: string
  timezone?: string | null
  customer: { id: string; name: string }
  installations: { id: string; name: string; kind: string; active: boolean; lastSeenAt?: string | null }[]
}

export interface Cell {
  id: string
  voltage: number | null
  temperature?: number
  balancing?: boolean
  ts?: string
  /** Any other per-cell value the BMS reports (cell_resistance, balancing_current…). */
  [extra: string]: MetricValue | null | undefined
}

export interface SolarDevice {
  installationId: string
  kind: DeviceKind
  externalId: string
  parentExternalId?: string | null
  name?: string | null
  manufacturer?: string | null
  model?: string | null
  attributes?: Record<string, MetricValue> | null
  firstSeenAt: string
  lastSeenAt: string
  /** `stale`: this device's newest reading is older than the live threshold. */
  latest: { ts: string; stale: boolean; status?: string; metrics: Record<string, MetricValue>; cells?: Cell[] } | null
}

export interface MetricDef {
  deviceKind: DeviceKind
  key: string
  unit?: string | null
  valueType: 'number' | 'string' | 'boolean'
}

export interface SolarOverview {
  site: { id: string; name: string; timezone?: string | null }
  updatedAt: string | null
  source: 'live' | 'archive' | 'none'
  stale: boolean
  activeAlarms: number
  hasForecast: boolean
  metrics: MetricDef[]
  devices: SolarDevice[]
}

export interface HistoryResult {
  metric: string
  kind: DeviceKind
  unit: string | null
  from: string
  to: string
  bucketSeconds: number
  series: { installationId: string; deviceId: string; points: { t: number; avg: number; min: number; max: number }[] }[]
}

export interface SolarEvent {
  id: string
  ts: string
  severity: 'INFO' | 'WARNING' | 'ALARM' | 'CRITICAL'
  code?: string | null
  message: string
  active: boolean
  deviceKind?: DeviceKind | null
  deviceExternalId?: string | null
}

export interface Forecast {
  generatedAt: string
  source?: string | null
  points: Array<{ ts: string } & Record<string, MetricValue>>
}

/** Per-cell drift statistics over a range (GET …/cells/drift). */
export interface CellDriftStats {
  id: string
  n: number
  /** mV from the pack average (+ = above). */
  meanDevMv: number
  maxDevMv: number
  minDevMv: number
  /** Of the moments the pack was unbalanced (spread ≥ thresholds.extremeMinSpreadMv), the share 0..1 as highest / lowest cell. */
  highShare: number
  lowShare: number
  /** 0..1 of samples at least thresholds.outlierMv from the pack average. */
  outlierShare: number
  trendMvPerDay: number | null
}

export interface PackDrift {
  installationId: string
  bmsId: string
  samples: number
  /** Samples in which the pack spread reached thresholds.extremeMinSpreadMv. */
  unbalancedSamples: number
  /** Per bucket: pack spread, each cell's average mV from the pack average, and its furthest excursion (peaks). */
  buckets: Array<{ t: number; spreadMv: number; spreadMaxMv: number; cells: Record<string, number>; peaks: Record<string, number> }>
  cells: CellDriftStats[]
}

export interface CellDrift {
  from: string
  to: string
  bucketSeconds: number
  sampling: number
  thresholds: { extremeMinSpreadMv: number; outlierMv: number }
  packs: PackDrift[]
}

/** Weather for the site's location and PV predicted from it (GET …/weather). */
export interface WeatherHour {
  t: number
  temperatureC: number | null
  cloudCoverPct: number | null
  windSpeedKmh: number | null
  irradianceWm2: number | null
  precipitationMm: number | null
  /** Measured PV (mean W of the hour), up to now. */
  pvW: number | null
  /** Predicted PV (mean W of the hour). */
  predictedW: number | null
}
export interface DayPv {
  generatedKwh: number | null
  predictedKwh: number | null
  remainingKwh: number | null
}
export type SiteWeather =
  | { available: false; reason: 'disabled' | 'no_location' | 'unavailable' }
  | {
      available: true
      source: string
      timezone: string
      location: { latitude: number; longitude: number }
      calibration: { factor: number; hours: number } | null
      now: string
      hourly: WeatherHour[]
      days: { yesterday: DayPv; today: DayPv; tomorrow: DayPv }
    }

export type EnergyRange = '30d' | '1y' | '10y'
/** Calendar of the energy buckets: the site's time zone or the viewer's own. */
export type EnergyTz = 'site' | 'profile'

/** One day, month or year of energy; `null` = no reading of that metric (not zero). */
export interface EnergyBucket {
  key: string
  start: string
  end: string
  partial: boolean
  expectedHours: number
  completeness: number | null
  pvKwh: number | null
  loadKwh: number | null
  /** Energy while grid_power_w was positive / negative (sign convention mapped in the adapter). */
  gridPositiveKwh: number | null
  gridNegativeKwh: number | null
  batteryPositiveKwh: number | null
  batteryNegativeKwh: number | null
}

export interface EnergyHistory {
  range: EnergyRange
  resolution: 'day' | 'month' | 'year'
  /** Calendar of the buckets: the viewer's profile time zone, else the site's, else UTC. */
  timezone: string
  timezoneSource?: 'profile' | 'site' | 'default'
  siteTimezone?: string | null
  /** The viewer's profile zone, also when the site's calendar is used. */
  profileTimezone?: string | null
  anchor: string
  previousAnchor: string
  nextAnchor: string | null
  firstDataAt: string | null
  installations: number
  sources: { device: 'SYSTEM'; pv: string; load: string; grid: string; battery: string }
  method: string
  buckets: EnergyBucket[]
}

interface Envelope<T> {
  data: T
}

/** Everything goes through the Carbonoz API; the browser never talks to Redis, MongoDB or the Raspberry Pi. */
export const solarApi = baseAPI.injectEndpoints({
  endpoints: (b) => ({
    // Tagged per site, so an admin change of the site (its time zone) refetches them.
    getSites: b.query<Envelope<SiteSummary[]>, void>({ query: () => '/sites', providesTags: [{ type: 'Solar-Site', id: 'LIST' }] }),
    getSolarOverview: b.query<Envelope<SolarOverview>, string>({ query: (siteId) => `/solar/sites/${siteId}/overview`, providesTags: (_r, _e, siteId) => [{ type: 'Solar-Site', id: siteId }] }),
    getSolarHistory: b.query<Envelope<HistoryResult>, { siteId: string; metric: string; kind: DeviceKind; deviceId?: string; from: string; to: string }>({
      query: ({ siteId, ...q }) => ({ url: `/solar/sites/${siteId}/history`, params: Object.fromEntries(Object.entries(q).filter(([, v]) => v != null)) }),
    }),
    getSolarEvents: b.query<Envelope<SolarEvent[]>, { siteId: string; active?: boolean; limit?: number }>({
      query: ({ siteId, ...q }) => ({ url: `/solar/sites/${siteId}/events`, params: Object.fromEntries(Object.entries(q).filter(([, v]) => v != null)) }),
    }),
    getSolarCellDrift: b.query<Envelope<CellDrift>, { siteId: string; from: string; to: string }>({
      query: ({ siteId, ...q }) => ({ url: `/solar/sites/${siteId}/cells/drift`, params: q }),
    }),
    getSolarWeather: b.query<Envelope<SiteWeather>, string>({ query: (siteId) => `/solar/sites/${siteId}/weather` }),
    getSolarForecast: b.query<Envelope<Forecast | null>, string>({ query: (siteId) => `/solar/sites/${siteId}/forecast` }),
    getSolarEnergy: b.query<Envelope<EnergyHistory>, { siteId: string; range: EnergyRange; anchor?: string; tz?: EnergyTz }>({
      query: ({ siteId, range, anchor, tz }) => ({ url: `/solar/sites/${siteId}/energy`, params: { range, ...(anchor && { anchor }), ...(tz && { tz }) } }),
      providesTags: (_r, _e, { siteId }) => [{ type: 'Solar-Site', id: siteId }],
    }),
  }),
})

export const { useGetSitesQuery, useGetSolarOverviewQuery, useGetSolarHistoryQuery, useGetSolarEventsQuery, useGetSolarForecastQuery, useGetSolarEnergyQuery, useGetSolarCellDriftQuery, useGetSolarWeatherQuery } = solarApi
