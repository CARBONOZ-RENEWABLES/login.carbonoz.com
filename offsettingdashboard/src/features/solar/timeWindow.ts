import type { RangeId } from '../../services/energyFlow'

/** Chart time windows: rolling ranges, a calendar day, up to a year. */
export type WindowPreset = '1h' | '6h' | '24h' | 'today' | '7d' | '30d' | '1y'
export const WINDOW_PRESETS: WindowPreset[] = ['1h', '6h', '24h', 'today', '7d', '30d', '1y']

/** `offset` steps back by whole windows: today + offset 1 = yesterday, 7d + offset 1 = the week before. */
export interface TimeWindow {
  preset: WindowPreset
  offset: number
}

const H = 3600e3
const LENGTH: Record<WindowPreset, number> = { '1h': H, '6h': 6 * H, '24h': 24 * H, today: 24 * H, '7d': 7 * 24 * H, '30d': 30 * 24 * H, '1y': 365 * 24 * H }
/** Zoom order, shortest first ('today' zooms like 24h). */
const ZOOM: WindowPreset[] = ['1h', '6h', '24h', '7d', '30d', '1y']

const startOfDay = (ms: number) => {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Start and end of a window (local calendar for `today`); never in the future. */
export function windowBounds(w: TimeWindow, now = Date.now()): { from: number; to: number } {
  if (w.preset === 'today') {
    const d = new Date(startOfDay(now))
    d.setDate(d.getDate() - w.offset)
    const from = d.getTime()
    const next = new Date(from)
    next.setDate(next.getDate() + 1) // 23 or 25 h on DST days
    return { from, to: Math.min(next.getTime(), now) }
  }
  const to = now - w.offset * LENGTH[w.preset]
  return { from: to - LENGTH[w.preset], to }
}

/** Axis/tooltip formatting of the existing chart. */
export function axisRange(p: WindowPreset): RangeId {
  return p === 'today' ? '24h' : p
}

export const canGoForward = (w: TimeWindow) => w.offset > 0

export function step(w: TimeWindow, dir: -1 | 1): TimeWindow {
  return { ...w, offset: Math.max(0, w.offset - dir) }
}

/** Shorter or longer window that ends where the current one ends. */
export function zoom(w: TimeWindow, dir: 'in' | 'out', now = Date.now()): TimeWindow | null {
  const i = ZOOM.indexOf(w.preset === 'today' ? '24h' : w.preset)
  const next = ZOOM[dir === 'in' ? i - 1 : i + 1]
  if (!next) return null
  const end = windowBounds(w, now).to
  return { preset: next, offset: Math.max(0, Math.round((now - end) / LENGTH[next])) }
}
