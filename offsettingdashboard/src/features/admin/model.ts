import dayjs from 'dayjs'
import type { Tone } from '../../design'
import type { Credential, CredentialStatus, IngestStatus, SiteStatus } from './api'

/** Connectivity of an installation/site as a badge. */
export const LIVE_BADGE: Record<SiteStatus, { label: string; tone: Tone }> = {
  online: { label: 'Online', tone: 'good' },
  offline: { label: 'Offline', tone: 'warning' },
  never: { label: 'No data yet', tone: 'neutral' },
  inactive: { label: 'Deactivated', tone: 'neutral' },
  empty: { label: 'No installation', tone: 'neutral' },
}

export const CREDENTIAL_BADGE: Record<CredentialStatus, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'good' },
  revoked: { label: 'Revoked', tone: 'critical' },
}

export const INGEST_BADGE: Record<IngestStatus, { label: string; tone: Tone }> = {
  PROCESSED: { label: 'Processed', tone: 'good' },
  QUEUED: { label: 'Queued', tone: 'info' },
  FAILED: { label: 'Failed', tone: 'critical' },
}

export const CREDENTIAL_TYPE_LABEL = { API_KEY: 'Carbonoz API key', KEYCLOAK_CLIENT: 'Keycloak client' } as const

/** Same rule as the server: a credential works only while active and not revoked. */
export const credentialStatus = (c: Pick<Credential, 'active' | 'revokedAt'>): CredentialStatus => (c.active && !c.revokedAt ? 'active' : 'revoked')

export const formatDate = (iso: string | null | undefined, withTime = true) => (iso ? dayjs(iso).format(withTime ? 'DD MMM YYYY, HH:mm' : 'DD MMM YYYY') : '—')

/** "12 min ago" style; `—` when never. */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—'
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

/** `null` counters mean "unavailable" (e.g. Redis down), not zero. */
export const count = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString())

export function personName(u: { firstName?: string | null; lastName?: string | null }) {
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || '—'
}

/** Readable message from an RTK Query error (Nest: `{ message: string | string[] }`). */
export function apiError(e: unknown, fallback = 'Something went wrong'): string {
  const status = (e as { status?: number | string })?.status
  if (status === 403) return 'You need Carbonoz administrator rights for this.'
  const m = (e as { data?: { message?: string | string[] } })?.data?.message
  if (Array.isArray(m)) return m[0] ?? fallback
  if (typeof m === 'string' && m) return m
  return fallback
}

/** Pretty JSON for payload inspection; never throws. */
export function prettyJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2) ?? String(v)
  } catch {
    return String(v)
  }
}
