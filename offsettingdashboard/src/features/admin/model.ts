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

// ── Site time zones ────────────────────────────────────────────────────────

/** Is `tz` a zone this browser knows (Intl), e.g. `Europe/Berlin`? The API checks it again. */
export function knownTimeZone(tz: string | null | undefined): boolean {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * Zones the IANA database renamed, which browsers' zone lists (ICU) still give
 * under the old name: the selector offers the current name (both work).
 */
const RENAMED: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Europe/Kiev': 'Europe/Kyiv',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Rangoon': 'Asia/Yangon',
  'America/Godthab': 'America/Nuuk',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Pacific/Enderbury': 'Pacific/Kanton',
  'Pacific/Truk': 'Pacific/Chuuk',
  'Pacific/Ponape': 'Pacific/Pohnpei',
}

/** IANA zone names for the selector, from the browser's zone data; `UTC` first, the site's current value kept. */
export function timeZoneOptions(current?: string | null): string[] {
  const list = (Intl as unknown as { supportedValuesOf?: (k: 'timeZone') => string[] }).supportedValuesOf?.('timeZone') ?? []
  const current_ = (z: string) => (RENAMED[z] && knownTimeZone(RENAMED[z]) ? RENAMED[z] : z)
  const names = new Set(['UTC', ...list.filter((z) => z.includes('/')).map(current_), ...(current && knownTimeZone(current) ? [current] : [])])
  return [...names].sort((a, b) => (a === 'UTC' ? -1 : b === 'UTC' ? 1 : a.localeCompare(b)))
}

/** Current UTC offset of a zone: "UTC+02:00", "UTC+05:30", "UTC". */
export function utcOffset(tz: string, at = new Date()): string {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? ''
    // ICU versions differ for zero: "GMT" or "GMT+00:00".
    return name.replace(/^GMT/, 'UTC').replace(/^UTC[+-]00:?00$/, 'UTC')
  } catch {
    return ''
  }
}
