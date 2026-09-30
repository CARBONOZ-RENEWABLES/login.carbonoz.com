/**
 * Energy history time zones. Buckets follow the SITE's time zone (the physical
 * installation), never the server's or the viewer's. The whole API runs with a
 * server clock in America/New_York here, so anything that silently used the
 * server zone would move readings to another day and fail.
 */
process.env.TZ = 'America/New_York';

import { randomBytes } from 'crypto';
import {
  addDays,
  localDay,
  localMidnight,
  ymd,
} from '../src/solar/read/energy-calendar';
import { startApi, TestApi } from './support/app';
import {
  adminToken,
  call,
  db,
  ingest,
  processed,
  provision,
  reading,
  signup,
} from './support/http';

const H = 3600_000;
const MIN = 60_000;
const oid = () => randomBytes(12).toString('hex');

let t: TestApi;
const prisma = db();
let admin: string;

beforeAll(async () => {
  t = await startApi();
  admin = await adminToken(t.api);
});
afterAll(async () => {
  await prisma.$disconnect();
  await t.close();
});

async function site(tz: string) {
  const owner = await signup(t.api, 'tz');
  const p = await provision(t.api, admin, owner.user.id);
  await prisma.site.update({
    where: { id: p.site.id },
    data: { timezone: tz },
  });
  await prisma.installation.update({
    where: { id: p.installation.id },
    data: { lastSeenAt: new Date() },
  });
  const samples = async (
    rows: { at: Date; metrics: Record<string, unknown> }[],
  ) =>
    prisma.solarSample.createMany({
      data: rows.map((r) => ({
        siteId: p.site.id,
        installationId: p.installation.id,
        ingestId: oid(),
        deviceKind: 'SYSTEM' as const,
        deviceExternalId: 'sys',
        ts: r.at,
        metrics: r.metrics as object,
      })),
    });
  const energy = async (q: string) => {
    const r = await call(t.api, 'GET', `/solar/sites/${p.site.id}/energy${q}`, {
      token: owner.token,
    });
    expect(r.status).toBe(200);
    return r.data.data as { timezone: string; buckets: Bucket[] };
  };
  return { p, samples, energy };
}
interface Bucket {
  key: string;
  start: string;
  end: string;
  pvKwh: number | null;
  expectedHours: number;
  completeness: number | null;
}
const find = (r: { buckets: Bucket[] }, key: string) =>
  r.buckets.find((b) => b.key === key) as Bucket;

/** Wall-clock time on `day` in `tz` → UTC instant (via local midnight, so DST days work). */
const wall = (tz: string, day: string, hour: number, minute = 0) =>
  new Date(localMidnight(day, tz).getTime() + hour * H + minute * MIN);

/** Constant power every `stepMin` minutes over [from, to). */
const constant = (from: Date, to: Date, w: number, stepMin = 10) => {
  const out: { at: Date; metrics: Record<string, unknown> }[] = [];
  for (let x = from.getTime(); x < to.getTime(); x += stepMin * MIN)
    out.push({ at: new Date(x), metrics: { pv_power_w: w } });
  return out;
};

const ZONES = ['Europe/Berlin', 'Africa/Kigali', 'UTC', 'America/New_York'];

describe.each(ZONES)('site in %s (server clock in New York)', (tz) => {
  it('splits days at local midnight: readings 1 min before / after', async () => {
    const s = await site(tz);
    const day = localDay(new Date(Date.now() - 8 * 24 * H), tz);
    const prev = addDays(day, -1);
    await s.samples([
      { at: wall(tz, prev, 23, 59), metrics: { pv_power_w: 1000 } },
      { at: wall(tz, day, 0, 1), metrics: { pv_power_w: 3000 } },
    ]);
    const r = await s.energy('?range=30d');
    expect(r.timezone).toBe(tz);
    expect(find(r, prev).pvKwh).toBe(1);
    expect(find(r, day).pvKwh).toBe(3);
    // Bucket start/end are the site's midnights, as unambiguous UTC instants.
    expect(find(r, day).start).toBe(localMidnight(day, tz).toISOString());
    expect(find(r, day).end).toBe(
      localMidnight(addDays(day, 1), tz).toISOString(),
    );
  });

  it('splits months and years at the local boundary', async () => {
    const s = await site(tz);
    const [y, m] = localDay(new Date(), tz).split('-').map(Number);
    const i = y * 12 + (m - 1) - 2;
    const first = ymd(Math.floor(i / 12), (i % 12) + 1, 1);
    const lastOfPrev = addDays(first, -1);
    const newYear = ymd(y, 1, 1);
    const eve = ymd(y - 1, 12, 31);
    await s.samples([
      { at: wall(tz, lastOfPrev, 23, 59), metrics: { pv_power_w: 1000 } },
      { at: wall(tz, first, 0, 1), metrics: { pv_power_w: 2000 } },
      { at: wall(tz, eve, 23, 59), metrics: { pv_power_w: 4000 } },
      { at: wall(tz, newYear, 0, 1), metrics: { pv_power_w: 8000 } },
    ]);
    // Days either side of the month boundary.
    const days = await s.energy(`?range=30d&anchor=${first}`);
    expect(find(days, lastOfPrev).pvKwh).toBe(1);
    expect(find(days, first).pvKwh).toBe(2);
    // Months (when the previous month isn't New Year's Eve's December, the two are distinct).
    const months = await s.energy(`?range=1y&anchor=${first.slice(0, 7)}`);
    expect(find(months, first.slice(0, 7)).pvKwh).toBe(
      first === newYear ? 2 + 8 : 2,
    );
    const prevMonth = find(months, lastOfPrev.slice(0, 7));
    expect(prevMonth.pvKwh).toBe(lastOfPrev === eve ? 1 + 4 : 1);
    // Years.
    const years = await s.energy('?range=10y');
    expect(find(years, String(y - 1)).pvKwh).toBe(
      4 + (lastOfPrev.startsWith(String(y - 1)) ? 1 : 0),
    );
    expect(find(years, String(y)).pvKwh).toBe(
      8 + 2 + (lastOfPrev.startsWith(String(y)) ? 1 : 0),
    );
  });
});

describe('DST days follow the site zone rules', () => {
  // Past DST changes (the API never plans into the future).
  const CASES: [string, string, number][] = [
    ['Europe/Berlin', '2026-03-29', 23], // spring forward
    ['Europe/Berlin', '2025-10-26', 25], // fall back
    ['America/New_York', '2026-03-08', 23],
    ['America/New_York', '2025-11-02', 25],
    ['Africa/Kigali', '2026-03-29', 24], // no DST
    ['UTC', '2025-10-26', 24],
  ];
  it.each(CASES)(
    '%s %s has %d hours, and 1 kW all day = that many kWh',
    async (tz, day, hours) => {
      const s = await site(tz);
      const from = localMidnight(day, tz);
      const to = localMidnight(addDays(day, 1), tz);
      expect((to.getTime() - from.getTime()) / H).toBe(hours);
      // 1 kW for the whole local day, plus neighbours that must not bleed in.
      await s.samples([
        ...constant(from, to, 1000),
        {
          at: new Date(from.getTime() - 5 * MIN),
          metrics: { pv_power_w: 7000 },
        },
        { at: new Date(to.getTime() + 5 * MIN), metrics: { pv_power_w: 9000 } },
      ]);
      const r = await s.energy(`?range=30d&anchor=${addDays(day, 1)}`);
      expect(find(r, day)).toMatchObject({
        pvKwh: hours,
        expectedHours: hours,
        completeness: 1,
      });
      expect(find(r, addDays(day, -1)).pvKwh).toBe(7);
      expect(find(r, addDays(day, 1)).pvKwh).toBe(9);
    },
  );
});

describe('the same readings in different site zones', () => {
  it('re-buckets by the site zone only; the total over whole days is unchanged', async () => {
    // One fixed UTC instant: 22:30 UTC on a past day.
    const base = localDay(new Date(Date.now() - 10 * 24 * H), 'UTC');
    const instant = new Date(`${base}T22:30:00Z`);
    const expected: Record<string, string> = {
      'Europe/Berlin': addDays(base, 1), // 00:30 CEST (or 23:30 CET)
      'Africa/Kigali': addDays(base, 1), // 00:30 CAT
      UTC: base,
      'America/New_York': base, // 18:30 EDT
    };
    for (const tz of ZONES) {
      const s = await site(tz);
      await s.samples([{ at: instant, metrics: { pv_power_w: 1000 } }]);
      const r = await s.energy('?range=30d');
      const day = localDay(instant, tz);
      if (tz !== 'Europe/Berlin') expect(day).toBe(expected[tz]);
      expect(find(r, day).pvKwh).toBe(1);
      expect(r.buckets.reduce((a, b) => a + (b.pvKwh ?? 0), 0)).toBe(1);
    }
  });
});

describe('half-hour offset zones', () => {
  it('Asia/Kolkata (+05:30): an hour straddling local midnight is split correctly', async () => {
    const tz = 'Asia/Kolkata';
    const s = await site(tz);
    const day = localDay(new Date(Date.now() - 6 * 24 * H), tz);
    const prev = addDays(day, -1);
    // 1 kW from 23:00 to 01:00 local: 1 kWh on each day.
    await s.samples(constant(wall(tz, prev, 23), wall(tz, day, 1), 1000));
    const r = await s.energy('?range=30d');
    expect(find(r, prev).pvKwh).toBe(1);
    expect(find(r, day).pvKwh).toBe(1);
  });
});

describe('SolarBMS timestamps through the real ingestion path', () => {
  it('Z, +02:00 and epoch seconds for the same instant land in the same site day', async () => {
    const s = await site('Europe/Berlin');
    const day = localDay(new Date(Date.now() - 3 * 24 * H), 'Europe/Berlin');
    const instant = wall('Europe/Berlin', day, 0, 20); // 00:20 Berlin = previous day in UTC
    // Berlin's UTC offset that day, in minutes (+120 in summer).
    const berlinOffsetMin =
      (localMidnight(day, 'Europe/Berlin').getTime() -
        Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10))) /
      -MIN;
    const sign = berlinOffsetMin >= 0 ? '+' : '-';
    const hh = String(Math.floor(Math.abs(berlinOffsetMin) / 60)).padStart(
      2,
      '0',
    );
    const local = new Date(instant.getTime() + berlinOffsetMin * MIN)
      .toISOString()
      .slice(0, 19);
    const stamps = [
      instant.toISOString(),
      `${local}${sign}${hh}:00`,
      Math.floor(instant.getTime() / 1000),
    ];
    for (const [i, timestamp] of stamps.entries()) {
      const m = reading({
        timestamp: i === 2 ? timestamp : String(timestamp),
        measurements: { pvPower: 1000 },
        batteries: [],
      });
      expect((await ingest(t.api, s.p.key, m)).status).toBe(202);
      expect((await processed(prisma, m.messageId))?.status).toBe('PROCESSED');
    }
    const stored = await prisma.solarSample.findMany({
      where: { siteId: s.p.site.id, deviceKind: 'SYSTEM' },
      select: { ts: true },
    });
    expect(stored.map((x) => x.ts.toISOString())).toEqual([
      instant.toISOString(),
      instant.toISOString(),
      instant.toISOString(),
    ]);
    expect(find(await s.energy('?range=30d'), day).pvKwh).toBe(1);
  });

  it('a timestamp without UTC offset does not depend on the server zone: read as UTC and flagged', async () => {
    const s = await site('Europe/Berlin');
    const day = localDay(new Date(Date.now() - 3 * 24 * H), 'UTC');
    const m = reading({
      timestamp: `${day}T10:00:00`,
      measurements: { pvPower: 1000 },
      batteries: [],
    });
    expect((await ingest(t.api, s.p.key, m)).status).toBe(202);
    const done = await processed(prisma, m.messageId);
    expect(done?.status).toBe('PROCESSED');
    expect(done?.error ?? '').toMatch(/no UTC offset/);
    const stored = await prisma.solarSample.findFirst({
      where: { siteId: s.p.site.id, deviceKind: 'SYSTEM' },
    });
    // The server runs in New York; a server-zone parse would give 14:00Z.
    expect(stored?.ts.toISOString()).toBe(`${day}T10:00:00.000Z`);
  });
});
