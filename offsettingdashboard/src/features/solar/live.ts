/**
 * Realtime SolarBMS state of a site: GET /solar/sites/:id/live (server-sent
 * events), read with fetch so the app's normal credentials apply (Bearer
 * header in password mode, session cookie in Keycloak mode — EventSource can
 * do neither header). One connection per site, shared by every component
 * that shows it (dashboard card and Energy Flow page), kept open briefly
 * after the last one unmounts so moving between them doesn't reconnect.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { API_CREDENTIALS, authHeaders } from '../../lib/auth/session'
import type { SolarDevice, SolarOverview } from './api'
import { CONNECTION_TIMEOUT_MS, Connection, DELAYED_AFTER_MS, liveStatus, LiveStatus, sendInterval } from './flowState'

// Same base as RTK Query (lib/api/api.ts): VITE_API_URL + /v1.
const API_V1 = `${import.meta.env.VITE_API_URL}/v1`

export interface LiveDevice {
  installationId: string
  kind: SolarDevice['kind']
  externalId: string
  ts: string
  metrics: Record<string, number | string | boolean>
  status?: string
}

export interface LiveSnapshot {
  /** Latest SYSTEM/INVERTER/BATTERY readings; null until the first snapshot. */
  devices: LiveDevice[] | null
  connection: Connection
  /** Server clock − client clock (ms), from the last frame. */
  clockOffsetMs: number
  /** Client time of the last frame of any kind. */
  lastFrameAt: number | null
  /** Times of the newest SYSTEM reading seen in snapshots, for the send interval. */
  readingTimes: number[]
  /** False when the server said its live state can't be read. */
  available: boolean
}

type Listener = () => void
interface Entry {
  state: LiveSnapshot
  listeners: Set<Listener>
  abort?: AbortController
  closeTimer?: ReturnType<typeof setTimeout>
  watchdog?: ReturnType<typeof setInterval>
  retry?: ReturnType<typeof setTimeout>
  attempt: number
  stopped: boolean
}

const entries = new Map<string, Entry>()
const BACKOFF_MS = [1000, 2000, 5000, 10000, 30000]
const KEEP_OPEN_MS = 10_000
const INITIAL: LiveSnapshot = { devices: null, connection: 'connecting', clockOffsetMs: 0, lastFrameAt: null, readingTimes: [], available: true }

function set(e: Entry, patch: Partial<LiveSnapshot>) {
  e.state = { ...e.state, ...patch }
  e.listeners.forEach((l) => l())
}

function newestSystemTs(devices: LiveDevice[]) {
  const t = devices.filter((d) => d.kind === 'SYSTEM').map((d) => Date.parse(d.ts))
  return t.length ? Math.max(...t) : null
}

/** One frame from the stream. Exported for tests. */
export function applyFrame(e: Pick<Entry, 'state'> & { listeners: Set<Listener> }, type: string, data: { serverTime?: string; devices?: LiveDevice[]; available?: boolean }) {
  const now = Date.now()
  const patch: Partial<LiveSnapshot> = { connection: 'open', lastFrameAt: now, available: data.available !== false }
  if (data.serverTime) patch.clockOffsetMs = Date.parse(data.serverTime) - now
  if (type === 'snapshot' && data.devices) {
    patch.devices = data.devices
    patch.available = true
    const ts = newestSystemTs(data.devices)
    if (ts != null && !e.state.readingTimes.includes(ts)) patch.readingTimes = [...e.state.readingTimes, ts].slice(-6)
  }
  set(e as Entry, patch)
}

async function run(siteId: string, e: Entry) {
  const ac = new AbortController()
  e.abort = ac
  try {
    const res = await fetch(`${API_V1}/solar/sites/${siteId}/live`, { headers: authHeaders({ Accept: 'text/event-stream' }), credentials: API_CREDENTIALS, signal: ac.signal, cache: 'no-store' })
    if (!res.ok || !res.body) throw new Error(`live stream ${res.status}`)
    e.attempt = 0
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let i: number
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i)
        buf = buf.slice(i + 2)
        const type = /^event: ?(.*)$/m.exec(block)?.[1] ?? 'message'
        const data = block
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.replace(/^data: ?/, ''))
          .join('\n')
        if (data) applyFrame(e, type, JSON.parse(data))
      }
    }
    // The server ends streams after 10 minutes: reconnect at once.
    if (!e.stopped) return schedule(siteId, e, 0)
  } catch {
    if (e.stopped) return
    set(e, { connection: 'lost' })
    schedule(siteId, e, BACKOFF_MS[Math.min(e.attempt++, BACKOFF_MS.length - 1)])
  }
}

function schedule(siteId: string, e: Entry, ms: number) {
  clearTimeout(e.retry)
  e.retry = setTimeout(() => !e.stopped && run(siteId, e), ms)
}

function open(siteId: string): Entry {
  let e = entries.get(siteId)
  if (e) {
    clearTimeout(e.closeTimer)
    return e
  }
  e = { state: INITIAL, listeners: new Set(), attempt: 0, stopped: false }
  entries.set(siteId, e)
  const entry = e
  // No frame for a while (the server sends one per second): the connection is gone.
  entry.watchdog = setInterval(() => {
    if (entry.state.connection === 'open' && entry.state.lastFrameAt != null && Date.now() - entry.state.lastFrameAt > CONNECTION_TIMEOUT_MS) {
      set(entry, { connection: 'lost' })
      entry.abort?.abort()
      schedule(siteId, entry, BACKOFF_MS[0])
    }
  }, 1000)
  run(siteId, entry)
  return entry
}

function close(siteId: string, e: Entry) {
  e.closeTimer = setTimeout(() => {
    if (e.listeners.size) return
    e.stopped = true
    e.abort?.abort()
    clearInterval(e.watchdog)
    clearTimeout(e.retry)
    entries.delete(siteId)
  }, KEEP_OPEN_MS)
}

function useLiveSelect<T>(siteId: string | undefined, select: (s: LiveSnapshot) => T): T {
  const subscribe = useMemo(
    () => (l: Listener) => {
      if (!siteId) return () => undefined
      const e = open(siteId)
      e.listeners.add(l)
      return () => {
        e.listeners.delete(l)
        if (!e.listeners.size) close(siteId, e)
      }
    },
    [siteId],
  )
  return useSyncExternalStore(subscribe, () => select(siteId ? entries.get(siteId)?.state ?? INITIAL : INITIAL))
}

const whole = (s: LiveSnapshot) => s
const devicesOf = (s: LiveSnapshot) => s.devices

/** Full live state of a site: changes with every frame (≈ 1 s). */
export const useLive = (siteId: string | undefined) => useLiveSelect(siteId, whole)

/** Only the live readings: changes when a new SolarBMS reading arrives, not on heartbeats. */
export const useLiveDevices = (siteId: string | undefined) => useLiveSelect(siteId, devicesOf)

/** Live / delayed / offline for the newest reading, re-evaluated every second. */
export function useLiveStatus(siteId: string | undefined, readingAt: number | null): LiveStatus {
  const live = useLive(siteId)
  const now = useNow(1000)
  return liveStatus({ readingAt, now: serverNow(live, now), connection: live.connection, intervalMs: liveInterval(live) })
}

/** Re-renders every `ms` (for "updated 3 s ago" and the live/delayed switch). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

/** Server-clock "now" for a live snapshot. */
export const serverNow = (live: LiveSnapshot, now = Date.now()) => now + live.clockOffsetMs

/** Observed SolarBMS send interval (ms), null until two readings arrived. */
export const liveInterval = (live: LiveSnapshot) => sendInterval(live.readingTimes)

/**
 * The overview with every device's latest reading replaced by a newer live
 * one, so all views (cards, compact flow, Energy Flow page) show the same
 * state. Staleness is re-evaluated on the server clock.
 */
export function withLive(o: SolarOverview, live: LiveDevice[] | null, now = Date.now()): SolarOverview {
  if (!live?.length) return o
  const byKey = new Map(live.map((d) => [`${d.installationId}|${d.kind}|${d.externalId}`, d]))
  let newest = o.updatedAt ? Date.parse(o.updatedAt) : 0
  const devices = o.devices.map((d) => {
    const l = byKey.get(`${d.installationId}|${d.kind}|${d.externalId}`)
    if (!l || (d.latest && Date.parse(d.latest.ts) >= Date.parse(l.ts))) return d
    newest = Math.max(newest, Date.parse(l.ts))
    return { ...d, latest: { ...d.latest, ts: l.ts, status: l.status, metrics: l.metrics, cells: d.latest?.cells, stale: now - Date.parse(l.ts) > DELAYED_AFTER_MS } }
  })
  const updatedAt = newest ? new Date(newest).toISOString() : o.updatedAt
  return { ...o, devices, updatedAt, source: 'live', stale: now - newest > DELAYED_AFTER_MS }
}

/** Tests: close every stream at once. */
export function resetLiveForTests() {
  for (const e of entries.values()) {
    e.stopped = true
    e.abort?.abort()
    clearInterval(e.watchdog)
    clearTimeout(e.retry)
    clearTimeout(e.closeTimer)
  }
  entries.clear()
}
