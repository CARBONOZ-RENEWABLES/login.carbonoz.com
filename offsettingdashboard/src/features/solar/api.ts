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

interface Envelope<T> {
  data: T
}

/** Everything goes through the Carbonoz API; the browser never talks to Redis, MongoDB or the Raspberry Pi. */
const solarApi = baseAPI.injectEndpoints({
  endpoints: (b) => ({
    getSites: b.query<Envelope<SiteSummary[]>, void>({ query: () => '/sites' }),
    getSolarOverview: b.query<Envelope<SolarOverview>, string>({ query: (siteId) => `/solar/sites/${siteId}/overview` }),
    getSolarHistory: b.query<Envelope<HistoryResult>, { siteId: string; metric: string; kind: DeviceKind; deviceId?: string; from: string; to: string }>({
      query: ({ siteId, ...q }) => ({ url: `/solar/sites/${siteId}/history`, params: Object.fromEntries(Object.entries(q).filter(([, v]) => v != null)) }),
    }),
    getSolarEvents: b.query<Envelope<SolarEvent[]>, { siteId: string; active?: boolean; limit?: number }>({
      query: ({ siteId, ...q }) => ({ url: `/solar/sites/${siteId}/events`, params: Object.fromEntries(Object.entries(q).filter(([, v]) => v != null)) }),
    }),
    getSolarForecast: b.query<Envelope<Forecast | null>, string>({ query: (siteId) => `/solar/sites/${siteId}/forecast` }),
  }),
})

export const { useGetSitesQuery, useGetSolarOverviewQuery, useGetSolarHistoryQuery, useGetSolarEventsQuery, useGetSolarForecastQuery } = solarApi
