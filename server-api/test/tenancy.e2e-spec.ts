/**
 * Tenant isolation: every Solar read is authorised server-side from
 * CustomerMember; ids from the client never grant access.
 */
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
  tag,
} from './support/http';

let t: TestApi;
const prisma = db();
let admin: string;
let owner: Awaited<ReturnType<typeof signup>>;
let outsider: Awaited<ReturnType<typeof signup>>;
let viewer: Awaited<ReturnType<typeof signup>>;
let a: Awaited<ReturnType<typeof provision>>;
let b: Awaited<ReturnType<typeof provision>>;

const ENDPOINTS = [
  'overview',
  'devices',
  'inverters',
  'batteries',
  'bms',
  'cells',
  'metrics',
  'history?metric=pv_power_w',
  'events',
  'forecast',
  'access',
];

beforeAll(async () => {
  t = await startApi();
  admin = await adminToken(t.api);
  owner = await signup(t.api, 'owner');
  outsider = await signup(t.api, 'outsider');
  viewer = await signup(t.api, 'viewer');
  a = await provision(t.api, admin, owner.user.id);
  b = await provision(t.api, admin, outsider.user.id);
  const m = reading();
  await ingest(t.api, a.key, m);
  await processed(prisma, m.messageId);
});
afterAll(async () => {
  await prisma.$disconnect();
  await t.close();
});

it('shows each user only their own sites', async () => {
  const mine = (await call(t.api, 'GET', '/sites', { token: owner.token })).data
    .data;
  expect(mine.map((s) => s.id)).toEqual([a.site.id]);
  const theirs = (await call(t.api, 'GET', '/sites', { token: outsider.token }))
    .data.data;
  expect(theirs.map((s) => s.id)).toEqual([b.site.id]);
});

it("returns 404 for another customer's site on every Solar endpoint", async () => {
  for (const p of ENDPOINTS) {
    const r = await call(t.api, 'GET', `/solar/sites/${a.site.id}/${p}`, {
      token: outsider.token,
    });
    expect([p, r.status]).toEqual([p, 404]);
  }
  expect(
    (await call(t.api, 'GET', `/sites/${a.site.id}`, { token: outsider.token }))
      .status,
  ).toBe(404);
});

it('rejects malformed and non-existent ids with 404 and operator injection with 400', async () => {
  expect(
    (
      await call(t.api, 'GET', '/solar/sites/not-an-id/overview', {
        token: owner.token,
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await call(t.api, 'GET', `/solar/sites/${'0'.repeat(24)}/overview`, {
        token: owner.token,
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await call(
        t.api,
        'GET',
        `/solar/sites/${a.site.id}/history?metric=pv_power_w&deviceId[$ne]=x`,
        { token: owner.token },
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await call(t.api, 'GET', `/solar/sites/${a.site.id}/cells?bmsId[$gt]=`, {
        token: owner.token,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await call(
        t.api,
        'GET',
        `/solar/sites/${a.site.id}/history?metric=${encodeURIComponent(
          'x.$where',
        )}`,
        { token: owner.token },
      )
    ).status,
  ).toBe(400);
});

it("never returns another installation's data through a device id", async () => {
  // Site B's device ids are identical ("battery-1"); querying them on site A returns only A's data.
  const m = reading({ measurements: { pvPower: 7777 } });
  await ingest(t.api, b.key, m);
  await processed(prisma, m.messageId);
  const h = (
    await call(
      t.api,
      'GET',
      `/solar/sites/${a.site.id}/history?metric=pv_power_w&deviceId=system`,
      { token: owner.token },
    )
  ).data.data;
  for (const s of h.series) expect(s.installationId).toBe(a.installation.id);
  const cells = (
    await call(t.api, 'GET', `/solar/sites/${a.site.id}/cells`, {
      token: owner.token,
    })
  ).data.data;
  expect(cells.every((c) => c.installationId === a.installation.id)).toBe(true);
  const metrics = (
    await call(t.api, 'GET', `/solar/sites/${a.site.id}/overview`, {
      token: owner.token,
    })
  ).data.data.devices;
  expect(metrics.every((d) => d.installationId === a.installation.id)).toBe(
    true,
  );
});

it('supports several users per customer; removal takes effect immediately', async () => {
  const add = await call(
    t.api,
    'POST',
    `/admin/customers/${a.customer.id}/members`,
    {
      token: admin,
      body: { email: viewer.email.toUpperCase(), role: 'VIEWER' },
    },
  );
  expect(add.status).toBe(201);
  expect(
    (
      await call(t.api, 'GET', `/solar/sites/${a.site.id}/overview`, {
        token: viewer.token,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await call(t.api, 'POST', `/admin/sites/${a.site.id}/installations`, {
        token: viewer.token,
        body: { name: 'x' },
      })
    ).status,
  ).toBe(403);
  await call(
    t.api,
    'DELETE',
    `/admin/customers/${a.customer.id}/members/${viewer.user.id}`,
    { token: admin },
  );
  expect(
    (
      await call(t.api, 'GET', `/solar/sites/${a.site.id}/overview`, {
        token: viewer.token,
      })
    ).status,
  ).toBe(404);
});

it('matches member emails exactly: a+b@ never selects aab@', async () => {
  const aab = await signup(t.api, 'aab');
  const r = await call(
    t.api,
    'POST',
    `/admin/customers/${a.customer.id}/members`,
    { token: admin, body: { email: aab.email.replace(/^aab/, 'a+b') } },
  );
  expect(r.status).toBe(404);
  expect(
    (
      await call(t.api, 'GET', `/solar/sites/${a.site.id}/overview`, {
        token: aab.token,
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await call(t.api, 'POST', `/admin/customers/${'0'.repeat(24)}/members`, {
        token: admin,
        body: { userId: aab.user.id },
      })
    ).status,
  ).toBe(404);
});

it('denies a disabled user even with a still-valid legacy token', async () => {
  await prisma.user.update({
    where: { id: owner.user.id },
    data: { activeStatus: false },
  });
  expect(
    (
      await call(t.api, 'GET', `/solar/sites/${a.site.id}/overview`, {
        token: owner.token,
      })
    ).status,
  ).toBe(404);
  expect(
    (await call(t.api, 'GET', '/sites', { token: owner.token })).data.data,
  ).toEqual([]);
  await prisma.user.update({
    where: { id: owner.user.id },
    data: { activeStatus: true },
  });
});

it('keeps provisioning admin-only', async () => {
  expect(
    (
      await call(t.api, 'POST', '/admin/customers', {
        token: owner.token,
        body: { name: 'x' },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await call(t.api, 'GET', `/admin/solar/sites/${a.site.id}/ingests`, {
        token: owner.token,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await call(t.api, 'GET', '/admin/solar/dead-letters', {
        token: owner.token,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await call(t.api, 'DELETE', `/admin/credentials/${'0'.repeat(24)}`, {
        token: admin,
      })
    ).status,
  ).toBe(404);
  void tag;
});
