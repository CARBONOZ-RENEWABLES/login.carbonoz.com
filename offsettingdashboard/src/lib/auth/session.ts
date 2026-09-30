/**
 * Browser side of authentication.
 *
 * - `legacy`   (default): today's flow — bearer JWT from /auth/login kept in localStorage.
 * - `keycloak` (VITE_AUTH_MODE=keycloak): sign-in happens on Keycloak; the API
 *   sets an HttpOnly session cookie and nothing auth-related is stored here.
 */
export type AuthMode = 'legacy' | 'keycloak'

export const AUTH_MODE: AuthMode = import.meta.env.VITE_AUTH_MODE === 'keycloak' ? 'keycloak' : 'legacy'
export const isSso = AUTH_MODE === 'keycloak'

const API_V1 = `${import.meta.env.VITE_API_URL}/v1`

/**
 * Cookies only matter for the SSO session. Legacy bearer mode keeps the
 * browser default, so an API on another origin with `Access-Control-Allow-Origin: *`
 * keeps working (credentialed requests to `*` are blocked by browsers).
 */
export const API_CREDENTIALS: RequestCredentials = isSso ? 'include' : 'same-origin'

/** Sent on every request; the API requires it for cookie-authenticated writes (CSRF). */
export const CSRF_HEADER = { 'x-carbonoz-csrf': '1' }

function legacyToken(): string | null {
  if (isSso) return null
  const raw = localStorage.getItem('token')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/** Headers for hand-written fetch() calls, matching what the RTK base query sends. */
export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = legacyToken()
  return { ...CSRF_HEADER, ...(token && { Authorization: `Bearer ${token}` }), ...extra }
}

/** Legacy flows hand back a JWT; in SSO mode the cookie is the only credential, so it is dropped. */
export function storeLegacyToken(token: string | undefined) {
  if (!isSso && token) localStorage.setItem('token', JSON.stringify(token))
}

export function hasLegacyToken(): boolean {
  return !!legacyToken()
}

/** Landing page for this host: solar.carbonoz.com opens the Solar dashboard. */
export const homePath = () => (window.location.hostname.startsWith('solar.') ? '/ds/solar' : '/ds')

/** Absolute so a login started on solar.carbonoz.com returns there (the API allow-lists origins). */
export function loginRedirect(returnTo = window.location.href) {
  if (isSso) {
    window.location.href = `${API_V1}/auth/oidc/login?returnTo=${encodeURIComponent(returnTo)}`
  } else {
    window.location.href = '/'
  }
}

export interface SessionUser {
  id: string
  email?: string
  role?: string
}

let cached: Promise<SessionUser | null> | null = null
let known: SessionUser | null = null

/** Current user from the server session (SSO mode). Cached for the page lifetime. */
export function fetchSession(force = false): Promise<SessionUser | null> {
  if (!cached || force) {
    cached = fetch(`${API_V1}/auth/session`, { credentials: API_CREDENTIALS, headers: authHeaders() })
      .then(async (r) => (r.ok ? ((await r.json()).data.user as SessionUser) : null))
      .catch(() => null)
      .then((u) => (known = u))
  }
  return cached
}

/** Last session user seen (synchronous, for display only). */
export const sessionUser = () => known

export async function logout() {
  localStorage.removeItem('token')
  let logoutUrl: string | null = null
  try {
    const r = await fetch(`${API_V1}/auth/logout`, { method: 'POST', credentials: API_CREDENTIALS, headers: authHeaders() })
    if (r.ok) logoutUrl = (await r.json()).data?.logoutUrl ?? null
  } catch {
    /* local state is cleared either way */
  }
  cached = null
  known = null
  // Ends the Keycloak session too, so the next visit asks for credentials again.
  window.location.href = logoutUrl ?? '/'
}
