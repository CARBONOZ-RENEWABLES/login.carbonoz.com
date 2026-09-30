/**
 * Site time zone: validated on create, editable by ADMIN only, and a change
 * re-buckets energy history from the unchanged raw readings (cached days are
 * keyed by time zone, so nothing stale is served).
 */
import { randomBytes } from 'crypto';
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

const oid = () => randomBytes(12).toString('hex');

async function customer() {
  const owner = await signup(t.api, 'tzsite');
  const c = await call(t.api, 'POST', '/admin/customers', {
    token: admin,
    body: { name: `TZ ${oid()}`, type: 'COMPANY', ownerUserId: owner.user.id },
  });
  expect(c.status).toBe(201);
  return { owner, customerId: c.data.data.id as string };
}
const createSite = (customerId: string, body: Record<string, unknown>) =>
  call(t.api, 'POST', `/admin/customers/${customerId}/sites`, {
    token: admin,
    body: { name: 'Roof', ...body },
  });
const patchSite = (siteId: string, body: unknown, token = admin) =>
  call(t.api, 'PATCH', `/admin/sites/${siteId}`, { token, body });

describe('creating a site', () => {
  it.each([
    'Europe/Berlin',
    'Africa/Kigali',
    'Asia/Kolkata',
    'America/New_York',
    'UTC',
  ])('accepts %s and stores it as given', async (tz) => {
    const { customerId } = await customer();
    const r = await createSite(customerId, { timezone: tz });
    expect(r.status).toBe(201);
    expect(r.data.data.timezone).toBe(tz);
    const stored = await prisma.site.findUnique({
      where: { id: r.data.data.id },
    });
    expect(stored?.timezone).toBe(tz);
  });

  it.each([
    ['a typo', 'Europe/Berlinn'],
    ['an offset', '+02:00'],
    ['an abbreviation', 'CET'],
    ['a wrong spelling', 'europe/berlin'],
    ['an empty value', ''],
    ['a number', 2],
  ])('rejects %s (%s) with 400 and creates nothing', async (_what, tz) => {
    const { customerId } = await customer();
    const r = await createSite(customerId, { timezone: tz });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.data)).toMatch(/valid IANA time zone/);
    expect(await prisma.site.count({ where: { customerId } })).toBe(0);
  });

  it('requires a time zone (no silent UTC)', async () => {
    const { customerId } = await customer();
    const r = await createSite(customerId, {});
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.data)).toMatch(/valid IANA time zone/);
  });
});

describe('changing the time zone', () => {
  it('ADMIN changes Europe/Berlin → Africa/Kigali', async () => {
    const { customerId } = await customer();
    const site = (await createSite(customerId, { timezone: 'Europe/Berlin' }))
      .data.data;
    const r = await patchSite(site.id, { timezone: 'Africa/Kigali' });
    expect(r.status).toBe(200);
    expect(r.data.data.timezone).toBe('Africa/Kigali');
    expect(
      (await prisma.site.findUnique({ where: { id: site.id } }))?.timezone,
    ).toBe('Africa/Kigali');
  });

  it('rejects invalid zones with 400 and keeps the old value', async () => {
    const { customerId } = await customer();
    const site = (await createSite(customerId, { timezone: 'Europe/Berlin' }))
      .data.data;
    for (const tz of ['Europe/Berlinn', 'GMT+2', 'Berlin', '', null]) {
      const r = await patchSite(site.id, { timezone: tz });
      expect(r.status).toBe(400);
    }
    // Only the time zone is editable: other fields are ignored, a missing time zone is 400.
    expect((await patchSite(site.id, { name: 'Renamed' })).status).toBe(400);
    const stored = await prisma.site.findUnique({ where: { id: site.id } });
    expect(stored).toMatchObject({ timezone: 'Europe/Berlin', name: 'Roof' });
  });

  it('is ADMIN only: the site owner gets 403, no session 401, unknown site 404', async () => {
    const { owner, customerId } = await customer();
    const site = (await createSite(customerId, { timezone: 'Europe/Berlin' }))
      .data.data;
    expect(
      (await patchSite(site.id, { timezone: 'Africa/Kigali' }, owner.token))
        .status,
    ).toBe(403);
    expect(
      (
        await call(t.api, 'PATCH', `/admin/sites/${site.id}`, {
          body: { timezone: 'Africa/Kigali' },
        })
      ).status,
    ).toBe(401);
    expect((await patchSite(oid(), { timezone: 'Africa/Kigali' })).status).toBe(
      404,
    );
    expect(
      (await patchSite('not-an-id', { timezone: 'Africa/Kigali' })).status,
    ).toBe(404);
    expect(
      (await prisma.site.findUnique({ where: { id: site.id } }))?.timezone,
    ).toBe('Europe/Berlin');
  });
});

describe('energy history after a time zone change', () => {
  /** A provisioned site with an owner, readings and the energy endpoint. */
  async function withReadings() {
    const owner = await signup(t.api, 'tzenergy');
    const p = await provision(t.api, admin, owner.user.id);
    await prisma.installation.update({
      where: { id: p.installation.id },
      data: { lastSeenAt: new Date() },
    });
    const at = (iso: string, w: number) => ({
      siteId: p.site.id,
      installationId: p.installation.id,
      ingestId: oid(),
      deviceKind: 'SYSTEM' as const,
      deviceExternalId: 'sys',
      ts: new Date(iso),
      metrics: { pv_power_w: w },
    });
    await prisma.solarSample.createMany({
      data: [
        // Winter midnight: 22:30Z = 23:30 Berlin (15 Jan) = 00:30 Kigali (16 Jan).
        at('2026-01-15T22:30:00Z', 1000),
        // New Year: 22:30Z on 31 Dec = 23:30 Berlin (2025) = 04:00 Kolkata (2026).
        at('2025-12-31T22:30:00Z', 2000),
        // A month end: 23:30Z on 28 Feb = 00:30 Berlin (1 Mar) = 18:30 New York (28 Feb).
        at('2026-02-28T23:30:00Z', 4000),
      ],
    });
    // One reading through the real ingestion path, so a raw payload exists too.
    const m = reading({
      timestamp: '2026-01-20T12:00:00Z',
      measurements: { pvPower: 500 },
      batteries: [],
    });
    expect((await ingest(t.api, p.key, m)).status).toBe(202);
    expect((await processed(prisma, m.messageId))?.status).toBe('PROCESSED');
    const energy = async (q: string) => {
      const r = await call(
        t.api,
        'GET',
        `/solar/sites/${p.site.id}/energy${q}`,
        { token: owner.token },
      );
      expect(r.status).toBe(200);
      return r.data.data as {
        timezone: string;
        buckets: { key: string; pvKwh: number | null; expectedHours: number }[];
      };
    };
    const pv = (r: Awaited<ReturnType<typeof energy>>, key: string) =>
      r.buckets.find((b) => b.key === key)?.pvKwh ?? null;
    const raw = async () =>
      JSON.stringify([
        await prisma.solarSample.findMany({
          where: { siteId: p.site.id },
          orderBy: { id: 'asc' },
        }),
        await prisma.solarIngest.findMany({
          where: { installationId: p.installation.id },
          orderBy: { id: 'asc' },
          select: {
            id: true,
            payload: true,
            rawText: true,
            sourceTimestamp: true,
            receivedAt: true,
          },
        }),
      ]);
    return { p, energy, pv, raw };
  }

  it('re-buckets the same readings by the new zone; cached days of the old zone are not served', async () => {
    const s = await withReadings();
    const q = '?range=30d&anchor=2026-01-31';

    const berlin = await s.energy(q);
    expect(berlin.timezone).toBe('Europe/Berlin');
    expect(s.pv(berlin, '2026-01-15')).toBe(1);
    expect(s.pv(berlin, '2026-01-16')).toBeNull();
    // Settled days are now cached for Berlin.
    const cachedBerlin = await prisma.solarEnergyDay.count({
      where: { siteId: s.p.site.id, timezone: 'Europe/Berlin' },
    });
    expect(cachedBerlin).toBeGreaterThan(0);
    const before = await s.raw();

    expect(
      (await patchSite(s.p.site.id, { timezone: 'Africa/Kigali' })).status,
    ).toBe(200);
    const kigali = await s.energy(q);
    expect(kigali.timezone).toBe('Africa/Kigali');
    expect(s.pv(kigali, '2026-01-15')).toBeNull();
    expect(s.pv(kigali, '2026-01-16')).toBe(1);
    // New rows for Kigali; Berlin rows untouched (still right for Berlin).
    expect(
      await prisma.solarEnergyDay.count({
        where: { siteId: s.p.site.id, timezone: 'Africa/Kigali' },
      }),
    ).toBeGreaterThan(0);
    expect(
      await prisma.solarEnergyDay.count({
        where: { siteId: s.p.site.id, timezone: 'Europe/Berlin' },
      }),
    ).toBe(cachedBerlin);

    // Back to Berlin: the Berlin calendar again.
    expect(
      (await patchSite(s.p.site.id, { timezone: 'Europe/Berlin' })).status,
    ).toBe(200);
    const again = await s.energy(q);
    expect(s.pv(again, '2026-01-15')).toBe(1);
    expect(s.pv(again, '2026-01-16')).toBeNull();

    // Raw readings and payloads: byte for byte the same.
    expect(await s.raw()).toBe(before);
  });

  it('New Year and month boundaries move with the zone (Berlin → Asia/Kolkata +05:30)', async () => {
    const s = await withReadings();
    const years = await s.energy('?range=10y');
    expect(s.pv(years, '2025')).toBe(2);
    const months = await s.energy('?range=1y&anchor=2026-03');
    expect(s.pv(months, '2025-12')).toBe(2);
    expect(s.pv(months, '2026-03')).toBe(4);

    expect(
      (await patchSite(s.p.site.id, { timezone: 'Asia/Kolkata' })).status,
    ).toBe(200);
    const y2 = await s.energy('?range=10y');
    expect(s.pv(y2, '2025')).toBeNull();
    expect(s.pv(y2, '2026')).toBe(2 + 1 + 4 + 0.5);
    const m2 = await s.energy('?range=1y&anchor=2026-03');
    expect(s.pv(m2, '2025-12')).toBeNull();
    expect(s.pv(m2, '2026-01')).toBe(2 + 1 + 0.5);
    expect(s.pv(m2, '2026-03')).toBe(4);
  });

  it('month end and DST follow the new zone (Berlin → America/New_York)', async () => {
    const s = await withReadings();
    const berlin = await s.energy('?range=30d&anchor=2026-03-10');
    expect(s.pv(berlin, '2026-03-01')).toBe(4);
    expect(
      berlin.buckets.find((b) => b.key === '2026-03-08')?.expectedHours,
    ).toBe(24);

    expect(
      (await patchSite(s.p.site.id, { timezone: 'America/New_York' })).status,
    ).toBe(200);
    const ny = await s.energy('?range=30d&anchor=2026-03-10');
    expect(s.pv(ny, '2026-02-28')).toBe(4);
    expect(s.pv(ny, '2026-03-01')).toBeNull();
    // 8 March 2026 is New York's spring-forward day: 23 hours.
    expect(ny.buckets.find((b) => b.key === '2026-03-08')?.expectedHours).toBe(
      23,
    );
  });
});
