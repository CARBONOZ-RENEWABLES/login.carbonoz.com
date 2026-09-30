/**
 * Admin panel API: provisioning Customer → Site → Installation → credential,
 * credential rotation/revocation, installation deactivation, and SolarBMS
 * ingestion monitoring (stats, raw ingests, reprocess, devices, events,
 * metric catalogue). Every route is ADMIN-only on the server.
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
  tag,
  until,
} from './support/http';

/** A well-formed ObjectId that matches no document. */
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

const get = (path: string, token = admin) =>
  call(t.api, 'GET', path, { token });
const post = (path: string, body?: unknown, token = admin) =>
  call(t.api, 'POST', path, { token, body });
const patch = (path: string, body: unknown, token = admin) =>
  call(t.api, 'PATCH', path, { token, body });

const ADMIN_ROUTES: [string, string][] = [
  ['GET', '/admin/customers'],
  ['GET', `/admin/customers/${oid()}`],
  ['PATCH', `/admin/customers/${oid()}`],
  ['POST', '/admin/customers'],
  ['GET', '/admin/sites'],
  ['GET', '/admin/installations'],
  ['PATCH', `/admin/installations/${oid()}`],
  ['GET', '/admin/credentials'],
  ['POST', `/admin/credentials/${oid()}/rotate`],
  ['GET', '/admin/solar/health'],
  ['GET', '/admin/solar/installations'],
  ['GET', '/admin/solar/ingests'],
  ['GET', '/admin/solar/devices'],
  ['GET', '/admin/solar/events'],
  ['GET', '/admin/solar/metrics'],
];

describe('access', () => {
  it('rejects anonymous callers (401) and customers (403) on every admin route', async () => {
    const user = await signup(t.api, 'nonadmin');
    for (const [method, path] of ADMIN_ROUTES) {
      expect([
        method,
        path,
        (
          await call(t.api, method, path, {
            body: method === 'GET' ? undefined : {},
          })
        ).status,
      ]).toEqual([method, path, 401]);
      expect([
        method,
        path,
        (
          await call(t.api, method, path, {
            token: user.token,
            body: method === 'GET' ? undefined : {},
          })
        ).status,
      ]).toEqual([method, path, 403]);
    }
  });

  it('rejects machine credentials on admin routes', async () => {
    const owner = await signup(t.api, 'machine-admin');
    const p = await provision(t.api, admin, owner.user.id);
    expect((await get('/admin/customers', p.key)).status).toBe(401);
  });

  it('rejects operator-shaped query values', async () => {
    expect((await get('/admin/solar/ingests?status[$ne]=x')).status).toBe(400);
    expect((await get('/admin/sites?customerId[$gt]=')).status).toBe(400);
    expect((await get('/admin/solar/ingests?size=5000')).status).toBe(400);
  });
});

describe('customers, members, sites', () => {
  it('creates, lists with counts, edits and shows a customer', async () => {
    const owner = await signup(t.api, 'owner');
    const name = `Acme ${tag()}`;
    const c = await post('/admin/customers', {
      name,
      type: 'COMPANY',
      ownerUserId: owner.user.id,
    });
    expect(c.status).toBe(201);
    const id = c.data.data.id;

    const site = await post(`/admin/customers/${id}/sites`, {
      name: 'Roof',
      timezone: 'Europe/Berlin',
    });
    expect(site.status).toBe(201);

    const list = await get(`/admin/customers?q=${encodeURIComponent(name)}`);
    expect(list.status).toBe(200);
    expect(list.data.data).toHaveLength(1);
    expect(list.data.data[0]).toMatchObject({
      id,
      memberCount: 1,
      siteCount: 1,
      installationCount: 0,
      status: 'empty',
      lastActivityAt: null,
    });
    // Regex metacharacters in search are literal.
    expect((await get('/admin/customers?q=.*')).data.data).toEqual([]);

    expect(
      (await patch(`/admin/customers/${id}`, { name: `${name} GmbH` })).status,
    ).toBe(200);
    const detail = await get(`/admin/customers/${id}`);
    expect(detail.data.data.name).toBe(`${name} GmbH`);
    expect(detail.data.data.members[0]).toMatchObject({
      role: 'OWNER',
      user: { id: owner.user.id, email: owner.email },
    });
    expect(detail.data.data.sites[0]).toMatchObject({
      name: 'Roof',
      status: 'empty',
    });
    expect((await get(`/admin/customers/${oid()}`)).status).toBe(404);
  });

  it('adds and removes members; the member sees the site only while a member', async () => {
    const owner = await signup(t.api, 'mowner');
    const viewer = await signup(t.api, 'mviewer');
    const p = await provision(t.api, admin, owner.user.id);

    const add = await post(`/admin/customers/${p.customer.id}/members`, {
      email: viewer.email.toUpperCase(),
      role: 'VIEWER',
    });
    expect(add.status).toBe(201);
    const sites = await get('/sites', viewer.token);
    expect(sites.data.data.map((s: { id: string }) => s.id)).toContain(
      p.site.id,
    );

    const removed = await call(
      t.api,
      'DELETE',
      `/admin/customers/${p.customer.id}/members/${viewer.user.id}`,
      { token: admin },
    );
    expect(removed.status).toBe(200);
    expect(
      (await get(`/solar/sites/${p.site.id}/overview`, viewer.token)).status,
    ).toBe(404);
  });

  it('lists all sites with customer, installation count and live status', async () => {
    const owner = await signup(t.api, 'sites');
    const p = await provision(t.api, admin, owner.user.id);
    const before = await get(`/admin/sites?customerId=${p.customer.id}`);
    expect(before.data.data).toHaveLength(1);
    expect(before.data.data[0]).toMatchObject({
      id: p.site.id,
      customer: { id: p.customer.id },
      installationCount: 1,
      status: 'never',
    });

    const m = reading();
    await ingest(t.api, p.key, m);
    await processed(prisma, m.messageId);
    const after = await get(`/admin/sites?customerId=${p.customer.id}`);
    expect(after.data.data[0].status).toBe('online');
    expect(after.data.data[0].lastSeenAt).toBeTruthy();
  });
});

describe('installations and machine credentials', () => {
  it('lists installations with credentials (no secrets) and device counts', async () => {
    const owner = await signup(t.api, 'inst');
    const p = await provision(t.api, admin, owner.user.id, {
      systemId: `sys-${tag()}`,
    });
    const m = reading();
    await ingest(t.api, p.key, m);
    await processed(prisma, m.messageId);

    const r = await get(`/admin/installations?siteId=${p.site.id}`);
    expect(r.status).toBe(200);
    const row = r.data.data[0];
    expect(row).toMatchObject({
      id: p.installation.id,
      kind: 'SOLARBMS',
      status: 'online',
      activeCredentials: 1,
      site: { id: p.site.id, customer: { id: p.customer.id } },
    });
    expect(row.deviceCount).toBeGreaterThanOrEqual(3); // system, battery, BMS
    expect(JSON.stringify(r.data)).not.toMatch(/secretHash|apiKey/);

    const creds = await get(
      `/admin/credentials?installationId=${p.installation.id}`,
    );
    expect(creds.data.data).toHaveLength(1);
    expect(creds.data.data[0]).toMatchObject({
      id: p.credentialId,
      status: 'active',
      type: 'API_KEY',
    });
    expect(creds.data.data[0].lastUsedAt).toBeTruthy();
    expect(JSON.stringify(creds.data)).not.toMatch(/secretHash|apiKey/);
  });

  it('rotates an API key: new key works, old key stops at once; Keycloak clients rotate in Keycloak', async () => {
    const owner = await signup(t.api, 'rotate');
    const p = await provision(t.api, admin, owner.user.id);
    expect((await ingest(t.api, p.key, reading())).status).toBe(202);

    const rot = await post(`/admin/credentials/${p.credentialId}/rotate`);
    expect(rot.status).toBe(201);
    expect(rot.data.data.apiKey).toMatch(/^czk\./);
    expect(rot.data.data.revokedCredentialId).toBe(p.credentialId);
    expect((await ingest(t.api, p.key, reading())).status).toBe(401);
    expect((await ingest(t.api, rot.data.data.apiKey, reading())).status).toBe(
      202,
    );

    // The rotated-away credential can't be rotated again.
    expect(
      (await post(`/admin/credentials/${p.credentialId}/rotate`)).status,
    ).toBe(400);
    const list = await get(
      `/admin/credentials?installationId=${p.installation.id}&status=revoked`,
    );
    expect(list.data.data.map((c: { id: string }) => c.id)).toEqual([
      p.credentialId,
    ]);

    const kc = await post(
      `/admin/installations/${p.installation.id}/credentials`,
      {
        type: 'KEYCLOAK_CLIENT',
        clientId: `pi-${tag()}`,
      },
    );
    expect(
      (await post(`/admin/credentials/${kc.data.data.id}/rotate`)).status,
    ).toBe(400);
  });

  it('rotates reliably right after the Pi used the key (no write-conflict 500)', async () => {
    const owner = await signup(t.api, 'rotate-race');
    const p = await provision(t.api, admin, owner.user.id);
    let credentialId = p.credentialId;
    let key = p.key;
    for (let i = 0; i < 25; i++) {
      // Using the key updates lastUsedAt on the credential row in the background.
      expect((await ingest(t.api, key, reading())).status).toBe(202);
      const rot = await post(`/admin/credentials/${credentialId}/rotate`);
      expect([i, rot.status]).toEqual([i, 201]);
      credentialId = rot.data.data.id;
      key = rot.data.data.apiKey;
    }
  });

  it('revokes a credential', async () => {
    const owner = await signup(t.api, 'revoke');
    const p = await provision(t.api, admin, owner.user.id);
    expect((await ingest(t.api, p.key, reading())).status).toBe(202);
    await call(t.api, 'DELETE', `/admin/credentials/${p.credentialId}`, {
      token: admin,
    });
    expect((await ingest(t.api, p.key, reading())).status).toBe(401);
    const c = await get(
      `/admin/credentials?installationId=${p.installation.id}`,
    );
    expect(c.data.data[0].status).toBe('revoked');
  });

  it('deactivating an installation blocks its credentials immediately; changing systemId rebinds', async () => {
    const owner = await signup(t.api, 'deact');
    const p = await provision(t.api, admin, owner.user.id, {
      systemId: 'pi-old',
    });
    expect(
      (await ingest(t.api, p.key, reading({ systemId: 'pi-old' }))).status,
    ).toBe(202);

    expect(
      (
        await patch(`/admin/installations/${p.installation.id}`, {
          active: false,
        })
      ).status,
    ).toBe(200);
    expect(
      (await ingest(t.api, p.key, reading({ systemId: 'pi-old' }))).status,
    ).toBe(401);
    const list = await get(`/admin/installations?siteId=${p.site.id}`);
    expect(list.data.data[0].status).toBe('inactive');

    await patch(`/admin/installations/${p.installation.id}`, {
      active: true,
      externalSystemId: 'pi-new',
    });
    expect(
      (await ingest(t.api, p.key, reading({ systemId: 'pi-old' }))).status,
    ).toBe(409);
    expect(
      (await ingest(t.api, p.key, reading({ systemId: 'pi-new' }))).status,
    ).toBe(202);
    expect(
      (
        await patch(`/admin/installations/${p.installation.id}`, {
          active: 'no',
        })
      ).status,
    ).toBe(400);
  });
});

describe('SolarBMS ingestion monitoring', () => {
  it('reports per-installation traffic, duplicates, devices, cells and latest status', async () => {
    const owner = await signup(t.api, 'stats');
    const p = await provision(t.api, admin, owner.user.id, {
      systemId: `st-${tag()}`,
    });
    const a = reading();
    const b = reading();
    await ingest(t.api, p.key, a);
    await ingest(t.api, p.key, b);
    await ingest(t.api, p.key, a); // duplicate
    await processed(prisma, a.messageId);
    await processed(prisma, b.messageId);

    const r = await until(
      () => get(`/admin/solar/installations?siteId=${p.site.id}`),
      (x) => x.data.data?.[0]?.last24h.processed === 2,
    );
    const s = r.data.data[0];
    expect(s).toMatchObject({
      installation: { id: p.installation.id, status: 'online' },
      site: { id: p.site.id },
      customer: { id: p.customer.id },
      last24h: { received: 2, processed: 2, failed: 0 },
      accepted: 2,
      duplicates: 1,
      failedTotal: 0,
      queued: 0,
      cells: 2,
      activeAlarms: 0,
      latest: { status: 'PROCESSED' },
    });
    expect(s.devices).toMatchObject({ SYSTEM: 1, BATTERY: 1, BMS: 1 });
    expect(s.lastReceivedAt).toBeTruthy();
    expect(s.lastProcessedAt).toBeTruthy();
  });

  it('lists raw ingests with filters and pagination, and shows one with its payload', async () => {
    const owner = await signup(t.api, 'ingests');
    const p = await provision(t.api, admin, owner.user.id);
    const msgs = [reading(), reading(), reading()];
    for (const m of msgs) await ingest(t.api, p.key, m);
    for (const m of msgs) await processed(prisma, m.messageId);

    const page0 = await get(
      `/admin/solar/ingests?installationId=${p.installation.id}&size=2`,
    );
    expect(page0.data.data).toMatchObject({ total: 3, page: 0, size: 2 });
    expect(page0.data.data.items).toHaveLength(2);
    expect(page0.data.data.items[0].payload).toBeUndefined();
    const page1 = await get(
      `/admin/solar/ingests?installationId=${p.installation.id}&size=2&page=1`,
    );
    expect(page1.data.data.items).toHaveLength(1);

    const one = await get(`/admin/solar/ingests?q=${msgs[1].messageId}`);
    expect(
      one.data.data.items.map((i: { messageId: string }) => i.messageId),
    ).toEqual([msgs[1].messageId]);

    const detail = await get(
      `/admin/solar/ingests/${one.data.data.items[0].id}`,
    );
    expect(detail.data.data).toMatchObject({
      messageId: msgs[1].messageId,
      status: 'PROCESSED',
      installation: { id: p.installation.id, site: { id: p.site.id } },
    });
    expect(detail.data.data.payload.measurements.pvPower).toBe(1000);
    expect((await get(`/admin/solar/ingests/${oid()}`)).status).toBe(404);
  });

  it('shows a failed ingest with its reason and reprocesses it once the cause is fixed', async () => {
    const owner = await signup(t.api, 'failed');
    const p = await provision(t.api, admin, owner.user.id);
    // Stored for an installation that doesn't exist: deriving it fails.
    const row = await prisma.solarIngest.create({
      data: {
        installationId: oid(),
        siteId: p.site.id,
        messageId: `broken-${tag()}`,
        payload: reading(),
      },
    });
    const first = await post(`/admin/solar/ingests/${row.id}/reprocess`);
    expect(first.status).toBe(200);
    expect(first.data.data.status).toBe('FAILED');
    expect(first.data.data.error).toBeTruthy();

    const failed = await get(
      `/admin/solar/ingests?siteId=${p.site.id}&status=FAILED`,
    );
    expect(failed.data.data.items.map((i: { id: string }) => i.id)).toEqual([
      row.id,
    ]);

    await prisma.solarIngest.update({
      where: { id: row.id },
      data: { installationId: p.installation.id },
    });
    const second = await post(`/admin/solar/ingests/${row.id}/reprocess`);
    expect(second.data.data).toMatchObject({ status: 'PROCESSED' });
    expect(
      await prisma.solarSample.count({ where: { ingestId: row.id } }),
    ).toBeGreaterThan(0);
  });

  it('keeps active alarms through a reprocess and still clears them later', async () => {
    const owner = await signup(t.api, 'alarms');
    const p = await provision(t.api, admin, owner.user.id);
    const withAlarms = reading({
      alarms: [
        { code: 'GRID_LOSS', message: 'Grid lost', severity: 'critical' },
      ],
      batteries: [
        {
          id: 'battery-1',
          soc: 50,
          bms: {
            id: 'bms-1',
            alarms: [
              {
                code: 'CELL_OVERVOLT',
                message: 'Cell over voltage',
                severity: 'warning',
              },
            ],
            cells: [{ id: 1, voltage: 3.3 }],
          },
        },
      ],
    });
    await ingest(t.api, p.key, withAlarms);
    const row = await processed(prisma, withAlarms.messageId);
    const active = async () =>
      (
        await get(`/admin/solar/events?siteId=${p.site.id}&active=true`)
      ).data.data
        .map((e: { code: string }) => e.code)
        .sort();
    expect(await active()).toEqual(['cell_overvolt', 'grid_loss']);

    expect(
      (await post(`/admin/solar/ingests/${row.id}/reprocess`)).data.data.status,
    ).toBe('PROCESSED');
    expect(await active()).toEqual(['cell_overvolt', 'grid_loss']);
    expect(
      (await get(`/admin/solar/installations?siteId=${p.site.id}`)).data.data[0]
        .activeAlarms,
    ).toBe(2);

    const cleared = reading({
      timestamp: new Date(Date.now() + 1000).toISOString(),
    });
    await ingest(t.api, p.key, cleared);
    await processed(prisma, cleared.messageId);
    expect(await active()).toEqual([]);
    const all = (await get(`/admin/solar/events?siteId=${p.site.id}`)).data
      .data;
    expect(all.map((e: { code: string }) => e.code).sort()).toEqual([
      'cell_overvolt',
      'grid_loss',
    ]);
  });

  it('reports pipeline health', async () => {
    const r = await get('/admin/solar/health');
    expect(r.status).toBe(200);
    expect(r.data.data).toMatchObject({
      mongo: { ok: true },
      redis: { ok: true },
      worker: { enabled: true, consumerGroup: 'solar-store' },
      stream: { key: 'solar:ingest' },
    });
    expect(typeof r.data.data.stream.length).toBe('number');
    expect(typeof r.data.data.ingests24h.PROCESSED).toBe('number');
    expect(r.data.data.installations.total).toBeGreaterThan(0);
  });
});

describe('dynamic data through the admin views', () => {
  it('catalogues new metrics as they appear, handles changing cell counts and missing sections', async () => {
    const owner = await signup(t.api, 'dyn');
    const p = await provision(t.api, admin, owner.user.id);
    const cells = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        voltage: 3.3 + i / 1000,
      }));

    const first = reading({
      batteries: [
        { id: 'battery-1', soc: 55, bms: { id: 'bms-1', cells: cells(16) } },
      ],
    });
    await ingest(t.api, p.key, first);
    await processed(prisma, first.messageId);
    const before = await get(`/admin/solar/metrics?siteId=${p.site.id}`);
    const keys = (r: typeof before) =>
      r.data.data.map(
        (m: { deviceKind: string; key: string }) => `${m.deviceKind}:${m.key}`,
      );
    expect(keys(before)).toContain('SYSTEM:pv_power_w');
    expect(keys(before)).not.toContain('SYSTEM:future_metric');

    // Later message: a metric Carbonoz has never seen, nested values, 24 cells.
    const second = reading({
      measurements: {
        pvPower: 900,
        future_metric: 123,
        inverter: { heatsinkTemp: 41.5 },
      },
      batteries: [
        { id: 'battery-1', soc: 56, bms: { id: 'bms-1', cells: cells(24) } },
      ],
    });
    await ingest(t.api, p.key, second);
    await processed(prisma, second.messageId);
    const after = await get(`/admin/solar/metrics?siteId=${p.site.id}`);
    expect(keys(after)).toContain('SYSTEM:future_metric');
    const fm = after.data.data.find(
      (m: { key: string }) => m.key === 'future_metric',
    );
    expect(fm).toMatchObject({ valueType: 'number' });
    expect(fm.firstSeenAt).toBeTruthy();
    expect(
      (await get(`/admin/solar/metrics?siteId=${p.site.id}&q=future`)).data
        .data,
    ).toHaveLength(1);

    const stats = await get(`/admin/solar/installations?siteId=${p.site.id}`);
    expect(stats.data.data[0].cells).toBe(24);
    const cellsNow = await get(`/solar/sites/${p.site.id}/cells`, owner.token);
    expect(cellsNow.data.data).toHaveLength(24);

    // A message without batteries (optional section missing) still processes.
    const bare = {
      messageId: `bare-${tag()}`,
      timestamp: new Date().toISOString(),
      measurements: { pvPower: 10 },
    };
    expect((await ingest(t.api, p.key, bare)).status).toBe(202);
    expect((await processed(prisma, bare.messageId))?.status).toBe('PROCESSED');

    const devices = await get(
      `/admin/solar/devices?siteId=${p.site.id}&kind=BMS`,
    );
    expect(devices.data.data).toHaveLength(1);
    expect(devices.data.data[0]).toMatchObject({
      externalId: 'bms-1',
      stale: false,
    });

    const events = await get(`/admin/solar/events?siteId=${p.site.id}`);
    expect(Array.isArray(events.data.data)).toBe(true);
  });
});
