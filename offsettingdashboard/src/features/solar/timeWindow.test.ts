import { describe, expect, it } from 'vitest'
import { canGoForward, step, windowBounds, zoom } from './timeWindow'

const H = 3600e3
// 22 Oct 2026, 15:41 local time.
const now = new Date(2026, 9, 22, 15, 41).getTime()

describe('chart time windows', () => {
  it('rolling windows end now; previous steps back a whole window', () => {
    expect(windowBounds({ preset: '24h', offset: 0 }, now)).toEqual({ from: now - 24 * H, to: now })
    expect(windowBounds({ preset: '7d', offset: 1 }, now)).toEqual({ from: now - 14 * 24 * H, to: now - 7 * 24 * H })
    expect(windowBounds({ preset: '1y', offset: 0 }, now).from).toBe(now - 365 * 24 * H)
  })

  it('today is the local calendar day up to now; offset 1 is yesterday (full day)', () => {
    expect(windowBounds({ preset: 'today', offset: 0 }, now)).toEqual({ from: new Date(2026, 9, 22).getTime(), to: now })
    expect(windowBounds({ preset: 'today', offset: 1 }, now)).toEqual({ from: new Date(2026, 9, 21).getTime(), to: new Date(2026, 9, 22).getTime() })
  })

  it('next never goes into the future', () => {
    const w = { preset: 'today' as const, offset: 0 }
    expect(canGoForward(w)).toBe(false)
    expect(step(w, 1)).toEqual(w)
    expect(step(step(w, -1), 1)).toEqual(w)
  })

  it('zoom keeps the end of the window and stops at 1h and 1y', () => {
    expect(zoom({ preset: '7d', offset: 0 }, 'in', now)).toEqual({ preset: '24h', offset: 0 })
    expect(zoom({ preset: 'today', offset: 1 }, 'out', now)).toEqual({ preset: '7d', offset: 0 })
    // A week that ended 7 days ago, zoomed in: the 24 h ending then.
    expect(zoom({ preset: '7d', offset: 1 }, 'in', now)).toEqual({ preset: '24h', offset: 7 })
    expect(zoom({ preset: '1h', offset: 0 }, 'in', now)).toBeNull()
    expect(zoom({ preset: '1y', offset: 0 }, 'out', now)).toBeNull()
  })
})
