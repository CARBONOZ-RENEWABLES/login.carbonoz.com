import { describe, expect, it, vi } from 'vitest'
import { knownTimeZone, timeZoneOptions, utcOffset } from './model'

describe('site time zone selector', () => {
  const list = timeZoneOptions()
  it('lists IANA names with UTC first, including the current names of renamed zones', () => {
    expect(list[0]).toBe('UTC')
    for (const tz of ['Europe/Berlin', 'Africa/Kigali', 'America/New_York', 'Asia/Kolkata', 'Europe/Kyiv']) expect(list).toContain(tz)
    expect(list).not.toContain('Asia/Calcutta')
    expect(list.every((z) => z === 'UTC' || z.includes('/'))).toBe(true)
    expect(new Set(list).size).toBe(list.length)
  })
  it("keeps a site's current value, even an old alias", () => {
    expect(timeZoneOptions('Asia/Calcutta')).toContain('Asia/Calcutta')
    expect(timeZoneOptions('Not/AZone')).not.toContain('Not/AZone')
  })
  it('shows offsets and recognises invalid names', () => {
    const summer = new Date('2026-07-01T12:00:00Z')
    expect(utcOffset('Europe/Berlin', summer)).toBe('UTC+02:00')
    expect(utcOffset('Asia/Kolkata', summer)).toBe('UTC+05:30')
    expect(utcOffset('America/New_York', summer)).toBe('UTC-04:00')
    expect(utcOffset('UTC', summer)).toBe('UTC')
    expect(knownTimeZone('Europe/Berlinn')).toBe(false)
    expect(knownTimeZone(null)).toBe(false)
  })
  it('reads zero offsets the same whatever the ICU version says ("GMT" or "GMT+00:00")', () => {
    for (const icu of ['GMT', 'GMT+00:00', 'GMT-00:00']) {
      const spy = vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockReturnValue([{ type: 'timeZoneName', value: icu }])
      expect(utcOffset('UTC')).toBe('UTC')
      spy.mockRestore()
    }
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockReturnValue([{ type: 'timeZoneName', value: 'GMT+05:30' }])
    expect(utcOffset('Asia/Kolkata')).toBe('UTC+05:30')
    spy.mockRestore()
  })
})
