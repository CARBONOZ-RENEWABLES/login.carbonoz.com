/**
 * Users with single sign-on (KEYCLOAK_ENABLED, as in the test stack): people
 * are created in Keycloak; an admin can give them a customer before their
 * first sign-in, and that sign-in links to the prepared account.
 */
import { startApi, TestApi } from './support/app';
import { adminToken, call, db, sso, tag } from './support/http';

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

const post = async (path: string, body: unknown) =>
  call(t.api, 'POST', path, { token: admin, body });

describe('SSO users', () => {
  it('admin gives a customer to someone who has not signed in yet; their first Keycloak sign-in gets it', async () => {
    const email = `owner-${tag()}@example.test`;
    const customer = (
      await post('/admin/customers', { name: `C ${tag()}`, type: 'COMPANY' })
    ).data.data;
    const site = (
      await post(`/admin/customers/${customer.id}/sites`, {
        name: 'Roof',
        timezone: 'Indian/Mauritius',
      })
    ).data.data;

    const m = await post(`/admin/customers/${customer.id}/members`, {
      email: email.toUpperCase(),
      role: 'OWNER',
    });
    expect(m.status).toBe(201);
    const prepared = await prisma.user.findFirst({ where: { email } });
    expect(prepared).toMatchObject({ email, role: 'USER', password: null });

    // No password account: password login cannot use it.
    const pw = await call(t.api, 'POST', '/auth/login', {
      body: { email, password: 'anything-123' },
    });
    expect([401, 403]).toContain(pw.status);

    // First sign-in through Keycloak (verified e-mail) lands in the prepared account, with its site.
    const login = await sso(t.api, { email, sub: `kc-${tag()}` });
    const session = await call(t.api, 'GET', '/auth/session', {
      cookie: login.session,
    });
    expect(session.data.data.user.id).toBe(prepared!.id);
    const sites = await call(t.api, 'GET', '/sites', { cookie: login.session });
    expect(sites.data.data.map((s: { id: string }) => s.id)).toContain(site.id);
  });

  it('"Add user" prepares an account without a password and sends no password', async () => {
    const email = `added-${tag()}@example.test`;
    const r = await post('/admin/sign-users', { email });
    expect(r.status).toBe(201);
    expect(r.data.data).toMatchObject({ sso: true });
    expect(await prisma.user.findFirst({ where: { email } })).toMatchObject({
      password: null,
    });
    expect((await post('/admin/sign-users', { email })).status).toBe(409);
  });

  it('an unverified Keycloak e-mail does not get the prepared account', async () => {
    const email = `unverified-${tag()}@example.test`;
    const customer = (
      await post('/admin/customers', { name: `C ${tag()}`, type: 'COMPANY' })
    ).data.data;
    await post(`/admin/customers/${customer.id}/members`, { email });
    const login = await sso(t.api, { email, verified: false });
    expect(login.session).toBe('');
  });
});
