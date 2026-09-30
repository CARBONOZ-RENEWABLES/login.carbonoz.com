import { describe, expect, it } from 'vitest'
import { ago, apiError, count, credentialStatus, CREDENTIAL_BADGE, formatDate, INGEST_BADGE, LIVE_BADGE, personName, prettyJson } from './model'

describe('admin model', () => {
  it('matches the server rule for credential status', () => {
    expect(credentialStatus({ active: true, revokedAt: null })).toBe('active')
    expect(credentialStatus({ active: false, revokedAt: null })).toBe('revoked')
    expect(credentialStatus({ active: true, revokedAt: '2026-09-30T00:00:00Z' })).toBe('revoked')
  })

  it('has a label and tone for every status the API returns', () => {
    for (const s of ['online', 'offline', 'never', 'inactive', 'empty'] as const) expect(LIVE_BADGE[s].label).toBeTruthy()
    for (const s of ['PROCESSED', 'QUEUED', 'FAILED'] as const) expect(INGEST_BADGE[s].label).toBeTruthy()
    expect(CREDENTIAL_BADGE.revoked.tone).toBe('critical')
    expect(LIVE_BADGE.online.tone).toBe('good')
  })

  it('formats times and counts, and treats null counters as unavailable', () => {
    const now = Date.parse('2026-09-30T12:00:00Z')
    expect(ago(null)).toBe('—')
    expect(ago('2026-09-30T11:59:55Z', now)).toBe('just now')
    expect(ago('2026-09-30T11:50:00Z', now)).toBe('10 min ago')
    expect(ago('2026-09-28T12:00:00Z', now)).toBe('2d ago')
    expect(formatDate(null)).toBe('—')
    expect(formatDate('2026-09-30T12:00:00Z', false)).toMatch(/30 Sep 2026/)
    expect(count(null)).toBe('—')
    expect(count(0)).toBe('0')
    expect(count(1234)).toBe((1234).toLocaleString())
  })

  it('extracts API error messages', () => {
    expect(apiError({ data: { message: 'User not found' } })).toBe('User not found')
    expect(apiError({ data: { message: ['name must be a string'] } })).toBe('name must be a string')
    expect(apiError({ status: 403, data: { message: 'Forbidden resource' } })).toMatch(/administrator/)
    expect(apiError(undefined, 'fallback')).toBe('fallback')
  })

  it('shows names and payloads safely', () => {
    expect(personName({ firstName: 'Ada', lastName: 'Lovelace' })).toBe('Ada Lovelace')
    expect(personName({})).toBe('—')
    expect(prettyJson({ a: 1 })).toBe('{\n  "a": 1\n}')
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => prettyJson(circular)).not.toThrow()
  })
})
