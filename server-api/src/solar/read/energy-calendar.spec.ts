import {
  localDay,
  localMidnight,
  planRange,
  safeTimeZone,
  shiftKey,
  validAnchor,
} from './energy-calendar';

const H = 3600_000;

describe('energy calendar', () => {
  it('finds local midnight in UTC, including DST changes', () => {
    expect(localMidnight('2026-09-30', 'Europe/Berlin').toISOString()).toBe(
      '2026-09-29T22:00:00.000Z',
    );
    expect(localMidnight('2026-01-15', 'Europe/Berlin').toISOString()).toBe(
      '2026-01-14T23:00:00.000Z',
    );
    expect(localMidnight('2026-09-30', 'UTC').toISOString()).toBe(
      '2026-09-30T00:00:00.000Z',
    );
    expect(localMidnight('2026-09-30', 'America/New_York').toISOString()).toBe(
      '2026-09-30T04:00:00.000Z',
    );
    // Berlin 2026: summer time starts 29 March, ends 25 October.
    const len = (d: string, next: string) =>
      (localMidnight(next, 'Europe/Berlin').getTime() -
        localMidnight(d, 'Europe/Berlin').getTime()) /
      H;
    expect(len('2026-03-29', '2026-03-30')).toBe(23);
    expect(len('2026-10-25', '2026-10-26')).toBe(25);
    expect(len('2026-06-01', '2026-06-02')).toBe(24);
  });

  it('assigns instants to the local day', () => {
    // 23:30 UTC on 29 Sep is already 30 Sep in Berlin, still 29 Sep in UTC.
    expect(localDay(new Date('2026-09-29T23:30:00Z'), 'Europe/Berlin')).toBe(
      '2026-09-30',
    );
    expect(localDay(new Date('2026-09-29T23:30:00Z'), 'UTC')).toBe(
      '2026-09-29',
    );
    expect(localDay(new Date('2026-12-31T23:30:00Z'), 'Europe/Berlin')).toBe(
      '2027-01-01',
    );
  });

  it('plans 30 days, 12 months and 10 years ending now, never in the future', () => {
    const now = new Date('2026-09-30T10:00:00Z');
    const d = planRange('30d', undefined, 'Europe/Berlin', now);
    expect(d.buckets).toHaveLength(30);
    expect(d.buckets[29].key).toBe('2026-09-30');
    expect(d.buckets[0].key).toBe('2026-09-01');
    expect(d.nextAnchor).toBeNull();
    expect(d.previousAnchor).toBe('2026-08-31');

    const m = planRange('1y', undefined, 'Europe/Berlin', now);
    expect(m.buckets.map((b) => b.key)).toEqual([
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
    expect(m.buckets[4].days).toHaveLength(28); // Feb 2026
    expect(m.buckets[4].start.toISOString()).toBe('2026-01-31T23:00:00.000Z');

    const y = planRange('10y', undefined, 'Europe/Berlin', now);
    expect(y.buckets.map((b) => b.key)[0]).toBe('2017');
    expect(y.buckets[9].key).toBe('2026');
    expect(y.buckets[9].days).toHaveLength(365);
    expect(y.buckets.find((b) => b.key === '2024').days).toHaveLength(366);

    expect(planRange('30d', '2027-01-01', 'UTC', now).anchor).toBe(
      '2026-09-30',
    );
  });

  it('navigates back and forward without passing the current period', () => {
    const now = new Date('2026-09-30T10:00:00Z');
    const back = planRange('1y', '2025-09', 'UTC', now);
    expect(back.buckets[11].key).toBe('2025-09');
    expect(back.nextAnchor).toBe('2026-09');
    expect(planRange('1y', '2024-03', 'UTC', now).nextAnchor).toBe('2025-03');
    expect(shiftKey('2026-01', 'month', -1)).toBe('2025-12');
    expect(shiftKey('2026-12', 'month', 1)).toBe('2027-01');
  });

  it('validates anchors and time zones', () => {
    expect(validAnchor('30d', '2026-02-28')).toBe(true);
    expect(validAnchor('30d', '2026-02-30')).toBe(false);
    expect(validAnchor('1y', '2026-13')).toBe(false);
    expect(validAnchor('1y', '2026-09')).toBe(true);
    expect(validAnchor('10y', '26')).toBe(false);
    expect(validAnchor('10y', '2026')).toBe(true);
    expect(safeTimeZone('Europe/Berlin')).toBe('Europe/Berlin');
    expect(safeTimeZone('Mars/Olympus')).toBe('UTC');
    expect(safeTimeZone(null)).toBe('UTC');
  });
});
