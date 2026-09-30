import { baseAPI } from '../../lib/api/api'
import type { DeviceKind, MetricValue, SolarEvent } from '../solar/api'

/** Admin panel API: every call goes to the Carbonoz API, which enforces ADMIN on the server. */

export type LiveStatus = 'online' | 'offline' | 'never' | 'inactive'
export type SiteStatus = LiveStatus | 'empty'
export type CustomerType = 'INDIVIDUAL' | 'COMPANY'
export type MemberRole = 'OWNER' | 'ADMIN' | 'VIEWER'
export type CredentialType = 'API_KEY' | 'KEYCLOAK_CLIENT'
export type CredentialStatus = 'active' | 'revoked'
export type IngestStatus = 'QUEUED' | 'PROCESSED' | 'FAILED'

export interface MemberUser {
  id: string
  email: string | null
  activeStatus: boolean
  role: string
  firstName: string | null
  lastName: string | null
}

export interface Member {
  id: string
  customerId: string
  userId: string
  role: MemberRole
  createdAt: string
  user: MemberUser
}

export interface CustomerRow {
  id: string
  name: string
  type: CustomerType
  createdAt: string
  members: Member[]
  sites: { id: string; name: string }[]
  memberCount: number
  siteCount: number
  installationCount: number
  lastActivityAt: string | null
  status: SiteStatus
}

export interface InstallationLite {
  id: string
  name: string
  kind: string
  active: boolean
  lastSeenAt: string | null
  externalSystemId?: string | null
  status: LiveStatus
}

export interface SiteDetail {
  id: string
  customerId: string
  name: string
  address?: string | null
  country?: string | null
  timezone?: string | null
  latitude?: number | null
  longitude?: number | null
  createdAt: string
  installations: InstallationLite[]
  status: SiteStatus
  lastSeenAt: string | null
}

export interface CustomerDetail extends Omit<CustomerRow, 'sites' | 'memberCount' | 'siteCount' | 'installationCount' | 'lastActivityAt' | 'status'> {
  sites: SiteDetail[]
}

export interface SiteRow extends Omit<SiteDetail, 'installations'> {
  customer: { id: string; name: string }
  installationCount: number
  installations: InstallationLite[]
}

export interface Credential {
  id: string
  installationId: string
  type: CredentialType
  clientId: string
  active: boolean
  label?: string | null
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export interface CredentialRow extends Credential {
  status: CredentialStatus
  installation: {
    id: string
    name: string
    active: boolean
    externalSystemId?: string | null
    site: { id: string; name: string; customer: { id: string; name: string } }
  }
}

export interface InstallationRow {
  id: string
  siteId: string
  kind: string
  name: string
  externalSystemId?: string | null
  active: boolean
  lastSeenAt: string | null
  createdAt: string
  site: { id: string; name: string; customer: { id: string; name: string } }
  machineCredentials: Credential[]
  status: LiveStatus
  deviceCount: number
  activeCredentials: number
  credentialLastUsedAt: string | null
}

/** Response of issue/rotate: the only time the API key is visible. */
export interface IssuedCredential {
  id: string
  type: CredentialType
  clientId: string
  apiKey?: string
  revokedCredentialId?: string
}

export interface SolarHealth {
  checkedAt: string
  mongo: { ok: boolean; latencyMs: number | null }
  redis: { ok: boolean }
  worker: { enabled: boolean; consumerGroup: string | null; consumers: number | null; lag: number | null }
  stream: { key: string; length: number | null; pending: number | null }
  deadLetters: { stored: number | null; redisFallback: number | null }
  ingests24h: Record<IngestStatus, number>
  lastReceivedAt: string | null
  installations: { total: number; online: number; offline: number; never: number; inactive: number }
  staleAfterSeconds: number
}

export interface IngestSummary {
  id: string
  installationId: string
  siteId: string
  messageId: string
  schemaVersion?: string | null
  sourceTimestamp?: string | null
  receivedAt: string
  processedAt?: string | null
  status: IngestStatus
  error?: string | null
}

export interface IngestDetail extends IngestSummary {
  payload: unknown
  rawText?: string | null
  installation: { id: string; name: string; externalSystemId?: string | null; site: { id: string; name: string } } | null
}

export interface InstallationStats {
  installation: { id: string; name: string; kind: string; active: boolean; externalSystemId?: string | null; lastSeenAt: string | null; status: LiveStatus }
  site: { id: string; name: string }
  customer: { id: string; name: string }
  lastReceivedAt: string | null
  lastProcessedAt: string | null
  latest: IngestSummary | null
  last24h: { received: number; processed: number; failed: number }
  failedTotal: number
  queued: number
  accepted: number | null
  duplicates: number | null
  devices: Record<DeviceKind, number>
  cells: number
  activeAlarms: number | null
}

export interface DeadLetter {
  id: string
  streamId: string
  installationId?: string | null
  siteId?: string | null
  messageId?: string | null
  receivedAt?: string | null
  rawText: string
  error?: string | null
  deliveries: number
  createdAt: string
}

export interface AdminDevice {
  id: string
  siteId: string
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
  stale: boolean
}

export interface CatalogueMetric {
  id: string
  siteId: string
  deviceKind: DeviceKind
  key: string
  unit?: string | null
  valueType: 'number' | 'string' | 'boolean'
  firstSeenAt: string
  lastSeenAt: string
}

export type AdminEvent = SolarEvent & { siteId: string; installationId: string }

interface Envelope<T> {
  data: T
}

/** Drops empty filters so they don't become `?x=` in the URL. */
const params = (q: object) => Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== ''))

const TENANCY = 'Admin-Tenancy' as const
const SOLAR = 'Admin-Solar' as const

const adminApi = baseAPI.injectEndpoints({
  endpoints: (b) => ({
    // ── Customers, members, sites ──────────────────────────────────────────
    getAdminCustomers: b.query<Envelope<CustomerRow[]>, { q?: string }>({
      query: (q) => ({ url: '/admin/customers', params: params(q) }),
      providesTags: [TENANCY],
    }),
    getAdminCustomer: b.query<Envelope<CustomerDetail>, string>({
      query: (id) => `/admin/customers/${id}`,
      providesTags: [TENANCY],
    }),
    createCustomer: b.mutation<Envelope<{ id: string; name: string }>, { name: string; type: CustomerType }>({
      query: (body) => ({ url: '/admin/customers', method: 'POST', body }),
      invalidatesTags: [TENANCY],
    }),
    updateCustomer: b.mutation<Envelope<unknown>, { id: string; name?: string; type?: CustomerType }>({
      query: ({ id, ...body }) => ({ url: `/admin/customers/${id}`, method: 'PATCH', body }),
      invalidatesTags: [TENANCY],
    }),
    addMember: b.mutation<Envelope<Member>, { customerId: string; email: string; role: MemberRole }>({
      query: ({ customerId, ...body }) => ({ url: `/admin/customers/${customerId}/members`, method: 'POST', body }),
      invalidatesTags: [TENANCY],
    }),
    removeMember: b.mutation<Envelope<null>, { customerId: string; userId: string }>({
      query: ({ customerId, userId }) => ({ url: `/admin/customers/${customerId}/members/${userId}`, method: 'DELETE' }),
      invalidatesTags: [TENANCY],
    }),
    getAdminSites: b.query<Envelope<SiteRow[]>, { q?: string; customerId?: string }>({
      query: (q) => ({ url: '/admin/sites', params: params(q) }),
      providesTags: [TENANCY],
    }),
    createSite: b.mutation<Envelope<{ id: string }>, { customerId: string; name: string; address?: string; country?: string; timezone: string }>({
      query: ({ customerId, ...body }) => ({ url: `/admin/customers/${customerId}/sites`, method: 'POST', body }),
      invalidatesTags: [TENANCY],
    }),
    // The time zone sets the calendar of the energy history: refetch that site's Solar data too.
    updateSiteTimeZone: b.mutation<Envelope<SiteDetail>, { siteId: string; timezone: string }>({
      query: ({ siteId, timezone }) => ({ url: `/admin/sites/${siteId}`, method: 'PATCH', body: { timezone } }),
      invalidatesTags: (_r, _e, { siteId }) => [TENANCY, { type: 'Solar-Site', id: siteId }, { type: 'Solar-Site', id: 'LIST' }],
    }),

    // ── Installations and machine credentials ──────────────────────────────
    getAdminInstallations: b.query<Envelope<InstallationRow[]>, { q?: string; siteId?: string; customerId?: string }>({
      query: (q) => ({ url: '/admin/installations', params: params(q) }),
      providesTags: [TENANCY],
    }),
    createInstallation: b.mutation<Envelope<{ id: string }>, { siteId: string; name: string; externalSystemId?: string }>({
      query: ({ siteId, ...body }) => ({ url: `/admin/sites/${siteId}/installations`, method: 'POST', body: { ...body, kind: 'SOLARBMS' } }),
      invalidatesTags: [TENANCY, SOLAR],
    }),
    updateInstallation: b.mutation<Envelope<unknown>, { id: string; name?: string; externalSystemId?: string; active?: boolean }>({
      query: ({ id, ...body }) => ({ url: `/admin/installations/${id}`, method: 'PATCH', body }),
      invalidatesTags: [TENANCY, SOLAR],
    }),
    getAdminCredentials: b.query<Envelope<CredentialRow[]>, { installationId?: string; status?: CredentialStatus; q?: string }>({
      query: (q) => ({ url: '/admin/credentials', params: params(q) }),
      providesTags: [TENANCY],
    }),
    issueCredential: b.mutation<Envelope<IssuedCredential>, { installationId: string; type: CredentialType; clientId?: string; label?: string }>({
      query: ({ installationId, ...body }) => ({ url: `/admin/installations/${installationId}/credentials`, method: 'POST', body }),
      invalidatesTags: [TENANCY],
    }),
    rotateCredential: b.mutation<Envelope<IssuedCredential>, { id: string }>({
      query: ({ id }) => ({ url: `/admin/credentials/${id}/rotate`, method: 'POST' }),
      invalidatesTags: [TENANCY],
    }),
    revokeCredential: b.mutation<Envelope<null>, { id: string }>({
      query: ({ id }) => ({ url: `/admin/credentials/${id}`, method: 'DELETE' }),
      invalidatesTags: [TENANCY],
    }),

    // ── SolarBMS ingestion and data ────────────────────────────────────────
    getSolarHealth: b.query<Envelope<SolarHealth>, void>({ query: () => '/admin/solar/health', providesTags: [SOLAR] }),
    getInstallationStats: b.query<Envelope<InstallationStats[]>, { siteId?: string; customerId?: string }>({
      query: (q) => ({ url: '/admin/solar/installations', params: params(q) }),
      providesTags: [SOLAR],
    }),
    getIngests: b.query<Envelope<{ items: IngestSummary[]; total: number; page: number; size: number }>, { status?: IngestStatus; installationId?: string; siteId?: string; q?: string; page: number; size: number }>({
      query: (q) => ({ url: '/admin/solar/ingests', params: params(q) }),
      providesTags: [SOLAR],
    }),
    getIngest: b.query<Envelope<IngestDetail>, string>({ query: (id) => `/admin/solar/ingests/${id}`, providesTags: [SOLAR] }),
    reprocessIngest: b.mutation<Envelope<{ id: string; status: IngestStatus; error?: string | null }>, { id: string }>({
      query: ({ id }) => ({ url: `/admin/solar/ingests/${id}/reprocess`, method: 'POST' }),
      invalidatesTags: [SOLAR],
    }),
    getDeadLetters: b.query<Envelope<{ stored: DeadLetter[]; redisFallback: unknown[] }>, void>({ query: () => '/admin/solar/dead-letters', providesTags: [SOLAR] }),
    requeueDeadLetter: b.mutation<Envelope<{ streamId: string }>, { id: string }>({
      query: ({ id }) => ({ url: `/admin/solar/dead-letters/${id}/requeue`, method: 'POST' }),
      invalidatesTags: [SOLAR],
    }),
    getAdminDevices: b.query<Envelope<AdminDevice[]>, { siteId?: string; installationId?: string; kind?: DeviceKind }>({
      query: (q) => ({ url: '/admin/solar/devices', params: params(q) }),
      providesTags: [SOLAR],
    }),
    getAdminEvents: b.query<Envelope<AdminEvent[]>, { siteId?: string; installationId?: string; severity?: SolarEvent['severity']; active?: boolean; limit?: number }>({
      query: (q) => ({ url: '/admin/solar/events', params: params(q) }),
      providesTags: [SOLAR],
    }),
    getAdminMetrics: b.query<Envelope<CatalogueMetric[]>, { siteId?: string; kind?: DeviceKind; q?: string }>({
      query: (q) => ({ url: '/admin/solar/metrics', params: params(q) }),
      providesTags: [SOLAR],
    }),
  }),
})

export const {
  useGetAdminCustomersQuery,
  useGetAdminCustomerQuery,
  useCreateCustomerMutation,
  useUpdateCustomerMutation,
  useAddMemberMutation,
  useRemoveMemberMutation,
  useGetAdminSitesQuery,
  useCreateSiteMutation,
  useUpdateSiteTimeZoneMutation,
  useGetAdminInstallationsQuery,
  useCreateInstallationMutation,
  useUpdateInstallationMutation,
  useGetAdminCredentialsQuery,
  useIssueCredentialMutation,
  useRotateCredentialMutation,
  useRevokeCredentialMutation,
  useGetSolarHealthQuery,
  useGetInstallationStatsQuery,
  useGetIngestsQuery,
  useGetIngestQuery,
  useReprocessIngestMutation,
  useGetDeadLettersQuery,
  useRequeueDeadLetterMutation,
  useGetAdminDevicesQuery,
  useGetAdminEventsQuery,
  useGetAdminMetricsQuery,
} = adminApi
