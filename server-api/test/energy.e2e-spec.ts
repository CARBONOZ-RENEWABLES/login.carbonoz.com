/**
 * Energy history (GET /solar/sites/:siteId/energy): daily, monthly and yearly
 * kWh integrated from SYSTEM power readings, in the site's time zone.
 */
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

const TZ = 'Europe/Berlin';
const H = 3600_000;
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

async function site() {
  const owner = await signup(t.api, 'energy');
  const p = await provision(t.api, admin, owner.user.id);
  await prisma.site.update({
    where: { id: p.site.id },
    data: { timezone: TZ },
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
  const energy = async (q: string, token = owner.token) =>
    call(t.api, 'GET', `/solar/sites/${p.site.id}/energy${q}`, { token });
  return { owner, p, samples, energy };
}

/** Local wall-clock time in Berlin on `day` → UTC instant. */
const at = (day: string, hour: number, minute = 0) =>
  new Date(localMidnight(day, TZ).getTime() + hour * H + minute * 60_000);

const bucket = (
  r: { data: { data: { buckets: { key: string }[] } } },
  key: string,
) => r.data.data.buckets.find((b) => b.key === key) as Record<string, unknown>;

describe('daily energy (30 days)', () => {
  it('integrates hourly average power into kWh, per signed part, ignoring duplicates', async () => {
    const s = await site();
    const day = localDay(new Date(Date.now() - 5 * 24 * H), TZ);
    const hour1 = {
      pv_power_w: 1000,
      load_power_w: 400,
      grid_power_w: 100,
      battery_power_w: 500,
    };
    const hour2 = {
      pv_power_w: 1000,
      load_power_w: 400,
      grid_power_w: -200,
      battery_power_w: -300,
    };
    await s.samples([
      { at: at(day, 10, 0), metrics: hour1 },
      { at: at(day, 10, 30), metrics: hour1 },
      { at: at(day, 10, 30), metrics: hour1 }, // duplicate reading
      { at: at(day, 11, 0), metrics: hour2 },
      { at: at(day, 11, 45), metrics: hour2 },
    ]);
    const r = await s.energy('?range=30d');
    expect(r.status).toBe(200);
    expect(r.data.data).toMatchObject({
      range: '30d',
      resolution: 'day',
      timezone: TZ,
      method: 'hourly-average-power',
      sources: {
        device: 'SYSTEM',
        pv: 'pv_power_w',
        load: 'load_power_w',
        grid: 'grid_power_w',
        battery: 'battery_power_w',
      },
    });
    expect(r.data.data.buckets).toHaveLength(30);
    expect(bucket(r, day)).toMatchObject({
      pvKwh: 2,
      loadKwh: 0.8,
      gridPositiveKwh: 0.1,
      gridNegativeKwh: 0.2,
      batteryPositiveKwh: 0.5,
      batteryNegativeKwh: 0.3,
      partial: true, // data started inside this day
    });
    // A day after the first reading without any reading: missing, not zero.
    const empty = bucket(r, addDays(day, 1));
    expect(empty).toMatchObject({
      pvKwh: null,
      loadKwh: null,
      gridPositiveKwh: null,
      batteryPositiveKwh: null,
      completeness: 0,
      partial: false,
    });
    expect(empty.expectedHours).toBeGreaterThanOrEqual(23);
    // Before the first reading nothing is expected.
    expect(bucket(r, addDays(day, -1))).toMatchObject({
      pvKwh: null,
      completeness: null,
      expectedHours: 0,
    });
  });

  it('assigns readings to the local day of the site (Berlin midnight, not UTC)', async () => {
    const s = await site();
    const day = localDay(new Date(Date.now() - 8 * 24 * H), TZ);
    const prev = addDays(day, -1);
    await s.samples([
      // 23:30 Berlin on the previous day = 21:30/22:30 UTC.
      { at: at(prev, 23, 30), metrics: { pv_power_w: 1000 } },
      // 00:30 Berlin = still the previous day in UTC.
      { at: at(day, 0, 30), metrics: { pv_power_w: 3000 } },
    ]);
    const r = await s.energy('?range=30d');
    expect(bucket(r, prev).pvKwh).toBe(1);
    expect(bucket(r, day).pvKwh).toBe(3);
  });

  it('keeps missing metrics missing and never uses unknown metrics as energy', async () => {
    const s = await site();
    const day = localDay(new Date(Date.now() - 4 * 24 * H), TZ);
    const other = addDays(day, 1);
    await s.samples([
      { at: at(day, 12), metrics: { pv_power_w: 2000 } },
      // Energy-looking fields with no confirmed meaning are stored, not interpreted.
      {
        at: at(other, 12),
        metrics: {
          pv_energy_today_kwh: 99,
          future_metric: 5,
          consumption_kwh: 7,
        },
      },
    ]);
    const r = await s.energy('?range=30d');
    expect(bucket(r, day)).toMatchObject({
      pvKwh: 2,
      loadKwh: null,
      gridPositiveKwh: null,
      batteryPositiveKwh: null,
    });
    expect(bucket(r, other)).toMatchObject({
      pvKwh: null,
      loadKwh: null,
      gridPositiveKwh: null,
      batteryPositiveKwh: null,
    });
  });

  it('refreshes cached days when older readings arrive later (Pi backfill)', async () => {
    const s = await site();
    const day = localDay(new Date(Date.now() - 6 * 24 * H), TZ);
    await s.samples([{ at: at(day, 9), metrics: { pv_power_w: 1000 } }]);
    expect(bucket(await s.energy('?range=30d'), day).pvKwh).toBe(1);
    expect(
      await prisma.solarEnergyDay.count({
        where: { siteId: s.p.site.id, day },
      }),
    ).toBe(1);

    // Backfilled through the real ingestion path, for another hour of that day.
    const m = reading({
      timestamp: at(day, 13).toISOString(),
      measurements: { pvPower: 4000 },
      batteries: [],
    });
    expect((await ingest(t.api, s.p.key, m)).status).toBe(202);
    expect((await processed(prisma, m.messageId))?.status).toBe('PROCESSED');
    expect(bucket(await s.energy('?range=30d'), day).pvKwh).toBe(5);
  });

  it('navigates to earlier 30-day ranges and validates parameters', async () => {
    const s = await site();
    const r = await s.energy('?range=30d');
    expect(r.data.data.nextAnchor).toBeNull();
    const back = await s.energy(
      `?range=30d&anchor=${r.data.data.previousAnchor}`,
    );
    expect(back.status).toBe(200);
    expect(back.data.data.buckets[29].key).toBe(r.data.data.previousAnchor);
    expect(back.data.data.nextAnchor).toBe(r.data.data.anchor);
    expect((await s.energy('?range=30d&anchor=2026-02-30')).status).toBe(400);
    expect((await s.energy('?range=1y&anchor=2026-09-01')).status).toBe(400);
    expect((await s.energy('?range=5y')).status).toBe(400);
    expect((await s.energy('?range=30d&anchor[$gt]=x')).status).toBe(400);
  });
});

describe('monthly (1 year) and yearly (10 years)', () => {
  it('sums days into calendar months at the local month boundary', async () => {
    const s = await site();
    const [y, m] = localDay(new Date(), TZ).split('-').map(Number);
    const i = y * 12 + (m - 1) - 2; // two months ago
    const first = ymd(Math.floor(i / 12), (i % 12) + 1, 1);
    const lastOfPrev = addDays(first, -1);
    await s.samples([
      {
        at: at(first, 0, 30),
        metrics: { pv_power_w: 2000, load_power_w: 1000 },
      },
      { at: at(first, 14), metrics: { pv_power_w: 3000, load_power_w: 500 } },
      { at: at(lastOfPrev, 23, 30), metrics: { pv_power_w: 1000 } },
    ]);
    const r = await s.energy('?range=1y');
    expect(r.data.data.resolution).toBe('month');
    expect(r.data.data.buckets).toHaveLength(12);
    expect(bucket(r, first.slice(0, 7))).toMatchObject({
      pvKwh: 5,
      loadKwh: 1.5,
    });
    expect(bucket(r, lastOfPrev.slice(0, 7))).toMatchObject({
      pvKwh: 1,
      loadKwh: null,
    });
    // Monthly totals equal the sum of the daily ones.
    const daily = await s.energy(`?range=30d&anchor=${addDays(first, 29)}`);
    const sum = daily.data.data.buckets
      .filter((b: { key: string }) => b.key.startsWith(first.slice(0, 7)))
      .reduce(
        (a: number, b: { pvKwh: number | null }) => a + (b.pvKwh ?? 0),
        0,
      );
    expect(sum).toBe(5);
  });

  it('sums into calendar years at local New Year and leaves years without data empty', async () => {
    const s = await site();
    const year = Number(localDay(new Date(), TZ).slice(0, 4));
    const newYear = ymd(year, 1, 1);
    const eve = ymd(year - 1, 12, 31);
    await s.samples([
      {
        at: at(eve, 23, 30),
        metrics: { pv_power_w: 1000, battery_power_w: 800 },
      },
      {
        at: at(newYear, 0, 30),
        metrics: { pv_power_w: 2500, battery_power_w: -400 },
      },
    ]);
    const r = await s.energy('?range=10y');
    expect(r.data.data.resolution).toBe('year');
    expect(r.data.data.buckets.map((b: { key: string }) => b.key)).toHaveLength(
      10,
    );
    expect(bucket(r, String(year - 1))).toMatchObject({
      pvKwh: 1,
      batteryPositiveKwh: 0.8,
      batteryNegativeKwh: 0,
    });
    expect(bucket(r, String(year))).toMatchObject({
      pvKwh: 2.5,
      batteryPositiveKwh: 0,
      batteryNegativeKwh: 0.4,
    });
    expect(bucket(r, String(year - 5))).toMatchObject({
      pvKwh: null,
      completeness: null,
    });
    expect(bucket(r, String(year)).partial).toBe(true);
  });
});

describe('authorization', () => {
  it("returns 404 for another customer's site and 401 without a session", async () => {
    const s = await site();
    const stranger = await signup(t.api, 'stranger');
    expect((await s.energy('?range=30d', stranger.token)).status).toBe(404);
    expect(
      (await call(t.api, 'GET', `/solar/sites/${s.p.site.id}/energy`)).status,
    ).toBe(401);
    expect((await s.energy('?range=30d', s.p.key)).status).toBe(401); // machine credential
    expect((await s.energy('?range=30d', admin)).status).toBe(200);
  });

  it('returns empty buckets for a site without data', async () => {
    const s = await site();
    const r = await s.energy('?range=1y');
    expect(r.status).toBe(200);
    expect(r.data.data.firstDataAt).toBeNull();
    expect(
      r.data.data.buckets.every(
        (b: { pvKwh: unknown; completeness: unknown }) =>
          b.pvKwh === null && b.completeness === null,
      ),
    ).toBe(true);
  });
});
