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

export type EnergyRange = '30d' | '1y' | '10y'

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
    getSolarForecast: b.query<Envelope<Forecast | null>, string>({ query: (siteId) => `/solar/sites/${siteId}/forecast` }),
    getSolarEnergy: b.query<Envelope<EnergyHistory>, { siteId: string; range: EnergyRange; anchor?: string }>({
      query: ({ siteId, range, anchor }) => ({ url: `/solar/sites/${siteId}/energy`, params: anchor ? { range, anchor } : { range } }),
      providesTags: (_r, _e, { siteId }) => [{ type: 'Solar-Site', id: siteId }],
    }),
  }),
})

export const { useGetSitesQuery, useGetSolarOverviewQuery, useGetSolarHistoryQuery, useGetSolarEventsQuery, useGetSolarForecastQuery, useGetSolarEnergyQuery } = solarApi
