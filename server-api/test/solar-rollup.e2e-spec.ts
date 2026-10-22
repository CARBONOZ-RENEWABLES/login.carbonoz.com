/**
 * Hourly rollups on the real MongoDB: catch-up over old history, late
 * (back-filled) samples, and history ranges up to a year served from them.
 */
import { randomBytes } from 'crypto';
import { SolarRollupService } from '../src/solar/read/solar-rollup.service';
import { startApi, TestApi } from './support/app';
import { adminToken, call, db, provision, signup } from './support/http';

const H = 3600_000;
const DAY = 24 * H;
const oid = () => randomBytes(12).toString('hex');

let t: TestApi;
const prisma = db();
let admin: string;

beforeAll(async () => {
  // The test drives the passes itself.
  t = await startApi({ SOLAR_ROLLUP_ENABLED: 'false' });
  admin = await adminToken(t.api);
});
afterAll(async () => {
  await prisma.$disconnect();
  await t.close();
});

interface History {
  bucketSeconds: number;
  series: Array<{
    deviceId: string;
    points: Array<{
      t: number;
      avg: number;
      min: number;
      max: number;
      n: number;
    }>;
  }>;
}

describe('hourly rollups and long history', () => {
  // Real clock: the late-sample check compares with insertion times.
  const now = new Date();
  // Whole hours, so each hour holds exactly its two samples.
  const start = Math.floor((now.getTime() - 400 * DAY) / H) * H;
  let owner: Awaited<ReturnType<typeof signup>>;
  let siteId: string;
  let installationId: string;
  const rollup = () => t.app.get(SolarRollupService);

  const sample = (ts: number, pv: number) => ({
    siteId,
    installationId,
    ingestId: oid(),
    deviceKind: 'SYSTEM' as const,
    deviceExternalId: 'sys',
    ts: new Date(ts),
    metrics: { pv_power_w: pv, status: 'ok' },
  });

  beforeAll(async () => {
    owner = await signup(t.api, 'rollup');
    const p = await provision(t.api, admin, owner.user.id);
    siteId = p.site.id;
    installationId = p.installation.id;
    await prisma.site.update({
      where: { id: siteId },
      data: { timezone: 'Europe/Berlin' },
    });
    // 400 days, two samples per hour: 1000 W and 3000 W (avg 2000, min 1000, max 3000).
    const rows = [];
    for (let h = start; h < now.getTime() - H; h += H)
      rows.push(sample(h + 60_000, 1000), sample(h + 1_800_000, 3000));
    for (let i = 0; i < rows.length; i += 5000)
      await prisma.solarSample.createMany({ data: rows.slice(i, i + 5000) });
  });

  const history = (from: number, to: number) =>
    call(
      t.api,
      'GET',
      `/solar/sites/${siteId}/history?metric=pv_power_w&kind=SYSTEM&from=${new Date(
        from,
      ).toISOString()}&to=${new Date(to).toISOString()}`,
      { token: owner.token },
    );

  it('catches up over all history, a day per pass, then idles', async () => {
    let passes = 0;
    // Every pass returns 1 s while behind, 5 min once caught up.
    while ((await rollup().tick()) === 1000 && passes < 1000) passes++;
    expect(passes).toBeGreaterThan(300);
    const docs = await prisma.solarRollupHour.count({ where: { siteId } });
    expect(docs).toBeGreaterThanOrEqual(400 * 24 - 2);
    const one = await prisma.solarRollupHour.findFirst({
      where: { siteId },
      orderBy: { hour: 'asc' },
    });
    expect(one?.metrics).toEqual({
      pv_power_w: { sum: 4000, n: 2, min: 1000, max: 3000 },
    }); // text values are not rolled up
  });

  it('serves a year of history from the rollups (daily points)', async () => {
    const r = await history(now.getTime() - 365 * DAY, now.getTime());
    expect(r.status).toBe(200);
    const h = r.data.data as History;
    expect(h.bucketSeconds).toBe(86400);
    const pts = h.series[0].points;
    expect(pts.length).toBeGreaterThanOrEqual(365);
    expect(pts[10]).toMatchObject({ avg: 2000, min: 1000, max: 3000, n: 48 });
  });

  it('a 30-day range also comes from the rollups (3 h buckets); over a year is refused', async () => {
    const h = (await history(now.getTime() - 30 * DAY, now.getTime())).data
      .data as History;
    expect(h.bucketSeconds).toBe(3 * 3600);
    expect(h.series[0].points[5]).toMatchObject({ avg: 2000, n: 6 });
    expect(
      (await history(now.getTime() - 400 * DAY, now.getTime())).status,
    ).toBe(400);
  });

  it('rebuilds an old hour when a late sample arrives (outbox delivered days later)', async () => {
    const hour = Math.floor((now.getTime() - 100 * DAY) / H) * H;
    await prisma.solarSample.create({ data: sample(hour + 2_400_000, 8000) });
    // The first pass after the insert sees it (inserted after the last scan).
    await rollup().tick(new Date());
    const doc = await prisma.solarRollupHour.findFirst({
      where: { siteId, hour: new Date(hour) },
    });
    expect(doc?.metrics).toEqual({
      pv_power_w: { sum: 12000, n: 3, min: 1000, max: 8000 },
    });
  });
});

describe('energy calendar: site or profile time zone', () => {
  it('tz=site uses the site zone even when the viewer has a profile zone; both are reported', async () => {
    const owner = await signup(t.api, 'tzsite');
    const p = await provision(t.api, admin, owner.user.id);
    await prisma.site.update({
      where: { id: p.site.id },
      data: { timezone: 'Indian/Mauritius' },
    });
    await prisma.userInformation.create({
      data: {
        userId: owner.user.id,
        firstName: 'T',
        customerTimezone: 'Europe/Berlin',
      },
    });
    const get = (q: string) =>
      call(t.api, 'GET', `/solar/sites/${p.site.id}/energy${q}`, {
        token: owner.token,
      });
    const auto = (await get('')).data.data;
    expect(auto).toMatchObject({
      timezone: 'Europe/Berlin',
      timezoneSource: 'profile',
      siteTimezone: 'Indian/Mauritius',
      profileTimezone: 'Europe/Berlin',
    });
    const site = (await get('?tz=site')).data.data;
    expect(site).toMatchObject({
      timezone: 'Indian/Mauritius',
      timezoneSource: 'site',
      profileTimezone: 'Europe/Berlin',
    });
    expect((await get('?tz=moon')).status).toBe(400);
  });
});
