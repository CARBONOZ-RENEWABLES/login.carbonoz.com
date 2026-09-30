import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import { sessionUser } from '../lib/auth/session'
import { LiveStatus } from '../services/energyFlow'

interface ShellState {
  /** Bumped by the header refresh button; pages re-fetch when it changes. */
  refreshKey: number
  refresh: () => void
  /** Device telemetry status, reported by the dashboard so the header can show it. */
  liveStatus: LiveStatus | null
  liveUpdatedAt: number | null
  setLive: (status: LiveStatus | null, updatedAt: number | null) => void
}

const Ctx = createContext<ShellState>({ refreshKey: 0, refresh: () => {}, liveStatus: null, liveUpdatedAt: null, setLive: () => {} })

export function ShellProvider({ children }: { children: ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [live, setLiveState] = useState<{ s: LiveStatus | null; t: number | null }>({ s: null, t: null })
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])
  const setLive = useCallback((s: LiveStatus | null, t: number | null) => setLiveState((p) => (p.s === s && p.t === t ? p : { s, t })), [])
  const value = useMemo(() => ({ refreshKey, refresh, liveStatus: live.s, liveUpdatedAt: live.t, setLive }), [refreshKey, refresh, live, setLive])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useShell = () => useContext(Ctx)

/** Reads the JWT's display claims (email, role) — no verification, UI only. */
export function tokenClaims(): { email?: string; role?: string } {
  try {
    const raw = localStorage.getItem('token')
    if (!raw) return sessionUser() ?? {}
    let token = raw
    try {
      token = JSON.parse(raw)
    } catch {
      /* stored unquoted */
    }
    const payload = token.split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return {}
  }
}

export function relativeTime(ts: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}
