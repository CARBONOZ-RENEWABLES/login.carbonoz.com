/**
 * Energy history follows the VIEWER's profile time zone (Customer Timezone,
 * UserInformation.customerTimezone) when it is valid, else the site's, else
 * UTC. Two users of one site can therefore see different day/month/year
 * buckets; readings (UTC instants) are never changed.
 */
import { randomBytes } from 'crypto';
import { startApi, TestApi } from './support/app';
import { adminToken, call, db, provision, signup } from './support/http';

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
interface Energy {
  timezone: string;
  timezoneSource: 'profile' | 'site' | 'default';
  siteTimezone: string | null;
  buckets: { key: string; pvKwh: number | null; expectedHours: number }[];
}

/** A Berlin site with readings, its owner and a second member. */
async function setup(siteTimezone: string | null = 'Europe/Berlin') {
  const owner = await signup(t.api, 'profiletz');
  const member = await signup(t.api, 'profiletz-member');
  const p = await provision(t.api, admin, owner.user.id);
  const add = await call(
    t.api,
    'POST',
    `/admin/customers/${p.customer.id}/members`,
    { token: admin, body: { email: member.email } },
  );
  expect(add.status).toBe(201);
  // Unset site zones only exist from before validation: written directly.
  await prisma.site.update({
    where: { id: p.site.id },
    data: { timezone: siteTimezone },
  });
  await prisma.installation.update({
    where: { id: p.installation.id },
    data: { lastSeenAt: new Date() },
  });
  const sample = (iso: string, w: number) => ({
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
      // 22:30Z on 15 Jan = 23:30 Berlin (15th) = 00:30 Kigali (16th) = 17:30 New York (15th).
      sample('2026-01-15T22:30:00Z', 1000),
      // 22:30Z on 31 Dec = 23:30 Berlin (2025) = 04:00 Kolkata (2026).
      sample('2025-12-31T22:30:00Z', 2000),
      // 23:30Z on 28 Feb = 00:30 Berlin (1 Mar) = 18:30 New York (28 Feb).
      sample('2026-02-28T23:30:00Z', 4000),
    ],
  });
  const profile = (userId: string, customerTimezone: string | null) =>
    prisma.userInformation.create({
      data: { userId, firstName: 'T', customerTimezone },
    });
  const energy = async (token: string, q: string) => {
    const r = await call(t.api, 'GET', `/solar/sites/${p.site.id}/energy${q}`, {
      token,
    });
    expect(r.status).toBe(200);
    return r.data.data as Energy;
  };
  const pv = (r: Energy, key: string) =>
    r.buckets.find((b) => b.key === key)?.pvKwh ?? null;
  return { p, owner, member, profile, energy, pv };
}
const JAN = '?range=30d&anchor=2026-01-31';

describe('which time zone the energy history uses', () => {
  it('no profile zone: the site zone (Europe/Berlin)', async () => {
    const s = await setup();
    const r = await s.energy(s.owner.token, JAN);
    expect(r).toMatchObject({
      timezone: 'Europe/Berlin',
      timezoneSource: 'site',
      siteTimezone: 'Europe/Berlin',
    });
    expect(s.pv(r, '2026-01-15')).toBe(1);
  });

  it('profile Africa/Kigali on a Berlin site: Kigali days', async () => {
    const s = await setup();
    await s.profile(s.owner.user.id, 'Africa/Kigali');
    const r = await s.energy(s.owner.token, JAN);
    expect(r).toMatchObject({
      timezone: 'Africa/Kigali',
      timezoneSource: 'profile',
      siteTimezone: 'Europe/Berlin',
    });
    expect(s.pv(r, '2026-01-15')).toBeNull();
    expect(s.pv(r, '2026-01-16')).toBe(1);
  });

  it('two users of the same site each get their own calendar, cached separately', async () => {
    const s = await setup();
    await s.profile(s.owner.user.id, 'Africa/Kigali');
    await s.profile(s.member.user.id, 'America/New_York');
    for (let round = 0; round < 2; round++) {
      // Second round comes from the per-zone day cache.
      const kigali = await s.energy(s.owner.token, JAN);
      const ny = await s.energy(s.member.token, JAN);
      expect(kigali.timezone).toBe('Africa/Kigali');
      expect(ny.timezone).toBe('America/New_York');
      expect(s.pv(kigali, '2026-01-16')).toBe(1);
      expect(s.pv(ny, '2026-01-15')).toBe(1);
      expect(s.pv(ny, '2026-01-16')).toBeNull();
    }
    const zones = await prisma.solarEnergyDay.groupBy({
      by: ['timezone'],
      where: { siteId: s.p.site.id },
      _count: true,
    });
    expect(zones.map((z) => z.timezone).sort()).toEqual([
      'Africa/Kigali',
      'America/New_York',
    ]);
  });

  it('changing the profile zone (PATCH /user/edit-user) changes the next response', async () => {
    const s = await setup();
    await s.profile(s.owner.user.id, 'Africa/Kigali');
    expect(s.pv(await s.energy(s.owner.token, JAN), '2026-01-16')).toBe(1);
    const edit = await call(t.api, 'PATCH', '/user/edit-user', {
      token: s.owner.token,
      body: { customerTimezone: 'Europe/Berlin' },
    });
    expect(edit.status).toBe(200);
    const r = await s.energy(s.owner.token, JAN);
    expect(r).toMatchObject({
      timezone: 'Europe/Berlin',
      timezoneSource: 'profile',
    });
    expect(s.pv(r, '2026-01-15')).toBe(1);
    expect(s.pv(r, '2026-01-16')).toBeNull();
  });

  it('New Year and month boundaries follow the profile zone (Asia/Kolkata, +05:30)', async () => {
    const s = await setup();
    await s.profile(s.owner.user.id, 'Asia/Kolkata');
    const years = await s.energy(s.owner.token, '?range=10y');
    expect(s.pv(years, '2025')).toBeNull();
    expect(s.pv(years, '2026')).toBe(2 + 1 + 4);
    const months = await s.energy(s.owner.token, '?range=1y&anchor=2026-03');
    expect(s.pv(months, '2025-12')).toBeNull();
    expect(s.pv(months, '2026-01')).toBe(3);
    expect(s.pv(months, '2026-03')).toBe(4);
    // The Berlin-profile-less member still sees Berlin boundaries.
    const berlin = await s.energy(s.member.token, '?range=10y');
    expect(s.pv(berlin, '2025')).toBe(2);
  });

  it('DST and month end follow the profile zone (America/New_York)', async () => {
    const s = await setup();
    await s.profile(s.owner.user.id, 'America/New_York');
    const r = await s.energy(s.owner.token, '?range=30d&anchor=2026-03-10');
    expect(s.pv(r, '2026-02-28')).toBe(4);
    expect(s.pv(r, '2026-03-01')).toBeNull();
    expect(r.buckets.find((b) => b.key === '2026-03-08')?.expectedHours).toBe(
      23,
    );
  });

  it.each(['Mars/Base', '+02:00', 'CET', 'europe/berlin', ''])(
    'an invalid profile zone (%p) is ignored, not repaired: the site zone is used',
    async (bad) => {
      const s = await setup();
      await s.profile(s.owner.user.id, bad);
      const r = await s.energy(s.owner.token, JAN);
      expect(r).toMatchObject({
        timezone: 'Europe/Berlin',
        timezoneSource: 'site',
      });
      const stored = await prisma.userInformation.findFirst({
        where: { userId: s.owner.user.id },
      });
      expect(stored?.customerTimezone).toBe(bad);
    },
  );

  it('profile GMT (in the profile list) is used as GMT', async () => {
    const s = await setup();
    await s.profile(s.owner.user.id, 'GMT');
    const r = await s.energy(s.owner.token, JAN);
    expect(r).toMatchObject({ timezone: 'GMT', timezoneSource: 'profile' });
    expect(s.pv(r, '2026-01-15')).toBe(1);
  });

  it('neither profile nor site zone: UTC, reported as the default', async () => {
    const s = await setup(null);
    const r = await s.energy(s.owner.token, JAN);
    expect(r).toMatchObject({
      timezone: 'UTC',
      timezoneSource: 'default',
      siteTimezone: null,
    });
  });

  it('an ADMIN without a profile zone sees the site zone', async () => {
    const s = await setup();
    await s.profile(s.owner.user.id, 'Africa/Kigali');
    const r = await s.energy(admin, JAN);
    expect(r).toMatchObject({
      timezone: 'Europe/Berlin',
      timezoneSource: 'site',
    });
  });

  it('readings are never changed by any of this', async () => {
    const s = await setup();
    const before = JSON.stringify(
      await prisma.solarSample.findMany({
        where: { siteId: s.p.site.id },
        orderBy: { id: 'asc' },
      }),
    );
    await s.profile(s.owner.user.id, 'Asia/Kolkata');
    await s.energy(s.owner.token, '?range=10y');
    await s.energy(s.member.token, '?range=10y');
    expect(
      JSON.stringify(
        await prisma.solarSample.findMany({
          where: { siteId: s.p.site.id },
          orderBy: { id: 'asc' },
        }),
      ),
    ).toBe(before);
  });
});
