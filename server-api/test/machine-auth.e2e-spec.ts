/**
 * Machine authentication for /ingest/solarbms: Carbonoz API keys and Keycloak
 * client-credentials tokens from the separate machine realm. A machine can
 * only write for its own installation and never reaches customer endpoints.
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
import { readState } from './support/stack';

let t: TestApi;
const prisma = db();
let admin: string;

const KC = () => `${readState().kcUrl}/realms/machines`;
const mint = async (o: Record<string, unknown>) =>
  (
    await (
      await fetch(`${KC()}/_mint`, { method: 'POST', body: JSON.stringify(o) })
    ).json()
  ).token as string;
const clientCredentials = async () =>
  (
    await (
      await fetch(`${KC()}/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials&client_id=solarbms-pi-kc&client_secret=machine-secret',
      })
    ).json()
  ).access_token as string;

beforeAll(async () => {
  t = await startApi();
  admin = await adminToken(t.api);
});
afterAll(async () => {
  await prisma.$disconnect();
  await t.close();
});

describe('API keys', () => {
  it('accepts a valid key and rejects missing, wrong and revoked ones', async () => {
    const owner = await signup(t.api, 'k');
    const p = await provision(t.api, admin, owner.user.id);
    expect((await ingest(t.api, p.key, reading())).status).toBe(202);
    expect(
      (await call(t.api, 'POST', '/ingest/solarbms', { body: reading() }))
        .status,
    ).toBe(401);
    expect(
      (await ingest(t.api, p.key.slice(0, -4) + 'abcd', reading())).status,
    ).toBe(401);
    expect((await ingest(t.api, 'czk.nope.nope', reading())).status).toBe(401);
    await call(t.api, 'DELETE', `/admin/credentials/${p.credentialId}`, {
      token: admin,
    });
    expect((await ingest(t.api, p.key, reading())).status).toBe(401);
  });

  it('binds a credential to its own installation and systemId', async () => {
    const owner = await signup(t.api, 'bind');
    const a = await provision(t.api, admin, owner.user.id, {
      systemId: 'sys-a',
    });
    const b = await provision(t.api, admin, owner.user.id, {
      systemId: 'sys-b',
    });
    expect(
      (await ingest(t.api, a.key, reading({ systemId: 'sys-b' }))).status,
    ).toBe(409);
    const m = reading({ systemId: 'sys-a' });
    expect((await ingest(t.api, a.key, m)).status).toBe(202);
    await processed(prisma, m.messageId);
    const stored = await prisma.solarIngest.findFirst({
      where: { messageId: m.messageId },
    });
    expect(stored.installationId).toBe(a.installation.id);
    expect(stored.siteId).toBe(a.site.id);
    expect(
      await prisma.solarSample.count({
        where: { installationId: b.installation.id },
      }),
    ).toBe(0);
  });
});

describe('Keycloak client credentials (machine realm)', () => {
  let p: Awaited<ReturnType<typeof provision>>;
  beforeAll(async () => {
    await prisma.machineCredential.deleteMany({
      where: { clientId: 'solarbms-pi-kc' },
    });
    const owner = await signup(t.api, 'kc');
    p = await provision(t.api, admin, owner.user.id, { systemId: 'kc-sys' });
    const r = await call(
      t.api,
      'POST',
      `/admin/installations/${p.installation.id}/credentials`,
      {
        token: admin,
        body: { type: 'KEYCLOAK_CLIENT', clientId: 'solarbms-pi-kc' },
      },
    );
    expect(r.status).toBe(201);
  });

  it('accepts a valid client-credentials token', async () => {
    expect(
      (
        await ingest(
          t.api,
          await clientCredentials(),
          reading({ systemId: 'kc-sys' }),
        )
      ).status,
    ).toBe(202);
  });

  it.each([
    ['wrong audience', { clientId: 'solarbms-pi-kc', aud: 'account' }],
    [
      'missing ingest role',
      { clientId: 'solarbms-pi-kc', roles: ['offline_access'] },
    ],
    [
      'expired',
      { clientId: 'solarbms-pi-kc', exp: Math.floor(Date.now() / 1000) - 60 },
    ],
    [
      'wrong issuer (customer realm)',
      { clientId: 'solarbms-pi-kc', realm: 'customers' },
    ],
    ['unregistered client', { clientId: `stranger-${tag()}` }],
  ])('rejects a token with %s', async (_, o) => {
    expect(
      (await ingest(t.api, await mint(o), reading({ systemId: 'kc-sys' })))
        .status,
    ).toBe(401);
  });

  it('rejects unsigned (alg=none) tokens', async () => {
    const b64 = (o: object) =>
      Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
      iss: KC(),
      aud: 'carbonoz-ingest',
      azp: 'solarbms-pi-kc',
      exp: 9999999999,
      realm_access: { roles: ['solarbms-ingest'] },
    })}.`;
    expect((await ingest(t.api, unsigned, reading())).status).toBe(401);
  });

  it('keeps machines and humans apart', async () => {
    const machine = await clientCredentials();
    expect(
      (await call(t.api, 'GET', '/sites', { token: machine })).status,
    ).toBe(401);
    expect(
      (await call(t.api, 'GET', '/auth/session', { token: machine })).status,
    ).toBe(401);
    const human = await signup(t.api, 'human');
    expect((await ingest(t.api, human.token, reading())).status).toBe(401);
  });

  it('revocation applies to still-valid tokens', async () => {
    const token = await clientCredentials();
    expect(
      (await ingest(t.api, token, reading({ systemId: 'kc-sys' }))).status,
    ).toBe(202);
    const cred = await prisma.machineCredential.findUnique({
      where: { clientId: 'solarbms-pi-kc' },
    });
    await call(t.api, 'DELETE', `/admin/credentials/${cred.id}`, {
      token: admin,
    });
    expect(
      (await ingest(t.api, token, reading({ systemId: 'kc-sys' }))).status,
    ).toBe(401);
    void p;
  });
});
