/**
 * Calendar maths for energy history, in the site's own time zone: which local
 * days, months and years a range covers, and where they start and end in UTC
 * (DST days are 23 or 25 hours long). Pure functions, no I/O.
 */

export type EnergyRange = '30d' | '1y' | '10y';
export type Resolution = 'day' | 'month' | 'year';

export const RESOLUTION: Record<EnergyRange, Resolution> = {
  '30d': 'day',
  '1y': 'month',
  '10y': 'year',
};

/** Anchor = the last bucket of the range: a day, a month or a year. */
export const ANCHOR_FORMAT: Record<EnergyRange, RegExp> = {
  '30d': /^\d{4}-\d{2}-\d{2}$/,
  '1y': /^\d{4}-\d{2}$/,
  '10y': /^\d{4}$/,
};

const BUCKETS: Record<EnergyRange, number> = { '30d': 30, '1y': 12, '10y': 10 };

/** The site's IANA zone, or UTC when missing/invalid (MongoDB needs a valid one). */
export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(0);
    return tz;
  } catch {
    return 'UTC';
  }
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function parts(date: Date, tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  const p = Object.fromEntries(
    f.formatToParts(date).map((x) => [x.type, x.value]),
  );
  return {
    y: +p.year,
    m: +p.month,
    d: +p.day,
    h: +p.hour % 24,
    min: +p.minute,
    s: +p.second,
  };
}

/** Local calendar day of an instant, `YYYY-MM-DD`. */
export function localDay(date: Date, tz: string): string {
  const p = parts(date, tz);
  return ymd(p.y, p.m, p.d);
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
export const ymd = (y: number, m: number, d: number) =>
  `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

/** Offset of `tz` from UTC at `date`, in ms (Berlin summer: +7 200 000). */
function offsetMs(date: Date, tz: string): number {
  const p = parts(date, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** UTC instant of local midnight of `day` (`YYYY-MM-DD`) in `tz`. */
export function localMidnight(day: string, tz: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetMs(new Date(guess), tz);
  // Second pass for days whose offset changes around midnight (DST).
  t = guess - offsetMs(new Date(t), tz);
  return new Date(t);
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export interface Bucket {
  /** `YYYY-MM-DD`, `YYYY-MM` or `YYYY`. */
  key: string;
  /** Local days inside the bucket, first to last. */
  days: string[];
  start: Date;
  end: Date;
}

function bucketOf(key: string, res: Resolution, tz: string): Bucket {
  let first: string;
  let next: string;
  if (res === 'day') {
    first = key;
    next = addDays(key, 1);
  } else if (res === 'month') {
    const [y, m] = key.split('-').map(Number);
    first = ymd(y, m, 1);
    next = m === 12 ? ymd(y + 1, 1, 1) : ymd(y, m + 1, 1);
  } else {
    const y = Number(key);
    first = ymd(y, 1, 1);
    next = ymd(y + 1, 1, 1);
  }
  const days: string[] = [];
  for (let d = first; d < next; d = addDays(d, 1)) days.push(d);
  return {
    key,
    days,
    start: localMidnight(first, tz),
    end: localMidnight(next, tz),
  };
}

/** Current bucket key (today / this month / this year) in `tz`. */
export function currentKey(range: EnergyRange, tz: string, now: Date): string {
  const day = localDay(now, tz);
  return range === '30d'
    ? day
    : range === '1y'
    ? day.slice(0, 7)
    : day.slice(0, 4);
}

/** `key` moved by `n` buckets. */
export function shiftKey(key: string, res: Resolution, n: number): string {
  if (res === 'day') return addDays(key, n);
  if (res === 'month') {
    const [y, m] = key.split('-').map(Number);
    const i = y * 12 + (m - 1) + n;
    return `${pad(Math.floor(i / 12), 4)}-${pad((i % 12) + 1)}`;
  }
  return pad(Number(key) + n, 4);
}

export interface RangePlan {
  range: EnergyRange;
  resolution: Resolution;
  timezone: string;
  anchor: string;
  buckets: Bucket[];
  /** Anchor of the previous / next range of the same length (null: would be in the future). */
  previousAnchor: string;
  nextAnchor: string | null;
}

/** Buckets of a range ending at `anchor` (default: the current day/month/year). */
export function planRange(
  range: EnergyRange,
  anchor: string | undefined,
  tz: string,
  now: Date,
): RangePlan {
  const res = RESOLUTION[range];
  const current = currentKey(range, tz, now);
  // Never plan into the future.
  const last = anchor && anchor < current ? anchor : current;
  const n = BUCKETS[range];
  const buckets: Bucket[] = [];
  for (let i = n - 1; i >= 0; i--)
    buckets.push(bucketOf(shiftKey(last, res, -i), res, tz));
  const next = shiftKey(last, res, n);
  return {
    range,
    resolution: res,
    timezone: tz,
    anchor: last,
    buckets,
    previousAnchor: shiftKey(last, res, -n),
    nextAnchor: last >= current ? null : next < current ? next : current,
  };
}

/** Is `key` a real calendar value of that format (rejects 2026-02-30, 2026-13)? */
export function validAnchor(range: EnergyRange, key: string): boolean {
  if (!ANCHOR_FORMAT[range].test(key)) return false;
  const [y, m = 1, d = 1] = key.split('-').map(Number);
  if (y < 2000 || y > 2100 || m < 1 || m > 12) return false;
  return addDays(ymd(y, m, d), 0) === ymd(y, m, d);
}
