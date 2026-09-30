/**
 * LEGACY_AUTH_ENABLED=false (cut-over mode): no password flow and no legacy
 * bearer JWT reaches the API; Keycloak sessions and machine credentials keep
 * working.
 */
import { JwtService } from '@nestjs/jwt';
import { startApi, TestApi } from './support/app';
import {
  call,
  csrf,
  db,
  ingest,
  provision,
  reading,
  sso,
  tag,
} from './support/http';

let t: TestApi;
const prisma = db();

beforeAll(async () => {
  t = await startApi({ LEGACY_AUTH_ENABLED: 'false' });
});
afterAll(async () => {
  await prisma.$disconnect();
  await t.close();
});

it('closes every password / legacy-token route with 410', async () => {
  const body = {
    email: `x-${tag()}@example.test`,
    password: 'Passw0rd!',
    role: 'USER',
  };
  for (const [method, path] of [
    ['POST', '/auth/login'],
    ['POST', '/auth/sign-up'],
    ['POST', '/auth/forgot-password'],
    ['POST', '/auth/verify-user'],
    ['POST', '/auth/verify-user-email'],
  ] as const) {
    expect(
      (await call(t.api, method, path, { body: { ...body, token: 'x' } }))
        .status,
    ).toBe(410);
  }
});

it('rejects legacy bearer JWTs (which never expire) everywhere', async () => {
  const admin = await prisma.user.findFirst({
    where: { email: 'admin@carbonoz.test' },
  });
  const token = new JwtService().sign(
    { id: admin.id, role: admin.role, email: admin.email },
    { secret: 'e2e-jwt-secret' },
  );
  for (const path of [
    '/sites',
    '/user/infos',
    '/admin/customers',
    '/auth/session',
  ]) {
    expect((await call(t.api, 'GET', path, { token })).status).toBe(401);
  }
});

it('keeps Keycloak sessions and machine ingestion working', async () => {
  const r = await sso(t.api, { email: `cut-${tag()}@example.test` });
  expect(
    (await call(t.api, 'GET', '/auth/session', { cookie: r.session })).status,
  ).toBe(200);
  expect(
    (await call(t.api, 'GET', '/sites', { cookie: r.session })).status,
  ).toBe(200);

  // Provision through an SSO admin session (legacy admin login is closed).
  const admin = await prisma.user.findFirst({
    where: { email: 'admin@carbonoz.test' },
  });
  const kcAdmin = await sso(t.api, {
    email: 'admin@carbonoz.test',
    sub: `kc-admin-${tag()}`,
  });
  const who = await call(t.api, 'GET', '/auth/session', {
    cookie: kcAdmin.session,
  });
  expect(who.data.data.user.id).toBe(admin.id);
  const post = (p: string, b: unknown) =>
    call(t.api, 'POST', p, { cookie: kcAdmin.session, headers: csrf, body: b });
  const cust = (
    await post('/admin/customers', {
      name: `C ${tag()}`,
      ownerUserId: who.data.data.user.id,
    })
  ).data.data;
  const site = (await post(`/admin/customers/${cust.id}/sites`, { name: 'S' }))
    .data.data;
  const inst = (
    await post(`/admin/sites/${site.id}/installations`, { name: 'Pi' })
  ).data.data;
  const key = (
    await post(`/admin/installations/${inst.id}/credentials`, {
      type: 'API_KEY',
    })
  ).data.data.apiKey;
  expect((await ingest(t.api, key, reading())).status).toBe(202);
  void provision; // helper uses legacy admin login, not available in this mode
});
