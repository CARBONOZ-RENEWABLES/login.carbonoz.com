/**
 * Felix's ingest stream → Carbonoz, end to end on the test stack.
 * SYNTHETIC TEST DATA ONLY (schema from the ingest guide, 29 Sep 2026).
 *
 * The test plays the ingest API: it XADDs deliveries to a test stream in the
 * stack's Redis. The bridge reads it like production would (XREAD only) and
 * the data must come out of the normal Carbonoz API.
 */
import { randomBytes } from 'crypto';
import { killMongo, readState, startMongo, writeState } from './support/stack';
import { startApi, TestApi } from './support/app';
import {
  adminToken,
  call,
  db,
  provision,
  redis,
  signup,
  until,
} from './support/http';

const tag = randomBytes(4).toString('hex');
const STREAM = `ingest:readings:e2e:${tag}`;
const SITE = `e2e-pi-${tag}`;
const prisma = db();
let t: TestApi;
let admin: string;
let r: Awaited<ReturnType<typeof redis>>;

const start = () =>
  startApi({
    INGEST_BRIDGE_ENABLED: 'true',
    INGEST_REDIS_URL: readState().redisUrl,
    INGEST_STREAM_KEY: STREAM,
    INGEST_BRIDGE_BLOCK_MS: '300',
  });

beforeAll(async () => {
  t = await start();
  admin = await adminToken(t.api);
  r = await redis();
});
afterAll(async () => {
  await r.quit();
  await prisma.$disconnect();
  await t.close();
});

/** One delivery as the ingest API stores it (field layout: JSON in `payload`). */
const deliver = (
  site: string,
  readings: { ts: string; metrics: Record<string, number> }[],
) =>
  r.xAdd(STREAM, '*', {
    payload: JSON.stringify({ site, readings }),
    client_id: 'raspberry-solarblick',
  });
const minutesAgo = (m: number) =>
  new Date(Math.floor((Date.now() - m * 60_000) / 1000) * 1000)
    .toISOString()
    .replace('.000Z', 'Z');

let owner: Awaited<ReturnType<typeof signup>>;
let firstBatch: { ts: string; metrics: Record<string, number> }[] = [];
let p: Awaited<ReturnType<typeof provision>>;
const samples = () =>
  prisma.solarSample.count({ where: { installationId: p.installation.id } });
const cursor = () =>
  prisma.solarIngestCursor
    .findUnique({ where: { stream: STREAM } })
    .then((c) => c?.lastId);

describe('ingest bridge', () => {
  beforeAll(async () => {
    owner = await signup(t.api, 'bridge');
    p = await provision(t.api, admin, owner.user.id, { systemId: SITE });
  });

  it('turns a delivery into normal Carbonoz data: samples at the reading times, inverters, overview, energy', async () => {
    const readings = [3, 2, 1].map((m, i) => ({
      ts: minutesAgo(m),
      metrics: {
        pv_w: 3000 + i,
        load_w: 1000,
        grid_w: -500,
        battery_w: 1500,
        soc_pct: 60 + i,
        wr1_pv_w: 1600,
        wr2_pv_w: 1400 + i,
        future_metric_x: 42,
      },
    }));
    firstBatch = readings;
    const id = await deliver(SITE, readings);
    await until(cursor, (c) => c === id, 15_000);
    await until(samples, (n) => n >= 9, 15_000); // 3 × (SYSTEM + 2 inverters)
    const sys = await prisma.solarSample.findMany({
      where: { installationId: p.installation.id, deviceKind: 'SYSTEM' },
      orderBy: { ts: 'asc' },
    });
    expect(sys.map((s) => s.ts.toISOString().replace('.000Z', 'Z'))).toEqual(
      readings.map((x) => x.ts),
    );
    expect(sys[2].metrics).toMatchObject({
      pv_power_w: 3002,
      load_power_w: 1000,
      grid_power_w: -500,
      battery_power_w: 1500,
      soc_pct: 62,
      future_metric_x: 42,
    });

    const o = await call(t.api, 'GET', `/solar/sites/${p.site.id}/overview`, {
      token: owner.token,
    });
    expect(o.status).toBe(200);
    expect(o.data.data.stale).toBe(false);
    const invs = o.data.data.devices
      .filter((d: { kind: string }) => d.kind === 'INVERTER')
      .map((d: { externalId: string }) => d.externalId)
      .sort();
    expect(invs).toEqual(['inverter-1', 'inverter-2']);

    const e = await call(
      t.api,
      'GET',
      `/solar/sites/${p.site.id}/energy?range=30d`,
      { token: owner.token },
    );
    expect(e.status).toBe(200);
    expect(
      e.data.data.buckets.some(
        (b: { pvKwh: number | null }) => (b.pvKwh ?? 0) > 0,
      ),
    ).toBe(true);

    // The raw message keeps where it came from.
    const raw = await prisma.solarIngest.findFirst({
      where: { installationId: p.installation.id },
    });
    expect(JSON.stringify(raw?.payload)).toContain(id);
  });

  it('a re-sent batch (new stream entry, same readings) is stored once', async () => {
    const before = await samples();
    // Exactly the readings of the first delivery, in a new stream entry.
    const readings = firstBatch;
    const id = await deliver(SITE, readings);
    await until(cursor, (c) => c === id, 15_000);
    await new Promise((res) => setTimeout(res, 1500));
    expect(await samples()).toBe(before);
  });

  it('an unknown site becomes a dead letter and the stream keeps flowing', async () => {
    const bad = await deliver(`unknown-${tag}`, [
      { ts: minutesAgo(1), metrics: { pv_w: 1 } },
    ]);
    const good = await deliver(SITE, [
      { ts: minutesAgo(0.5), metrics: { pv_w: 2500 } },
    ]);
    await until(cursor, (c) => c === good, 15_000);
    const dl = await prisma.solarDeadLetter.findUnique({
      where: { streamId: `${STREAM}/${bad}` },
    });
    expect(dl?.error).toBe(`no installation with systemId "unknown-${tag}"`);
  });

  it('reports position and backlog to admins only', async () => {
    const h = await call(t.api, 'GET', '/admin/solar/health', { token: admin });
    expect(h.status).toBe(200);
    expect(h.data.data.ingestBridge).toMatchObject({
      enabled: true,
      connected: true,
      stream: STREAM,
      cursor: await cursor(),
      upToDate: true,
    });
    expect(
      (await call(t.api, 'GET', '/admin/solar/health', { token: owner.token }))
        .status,
    ).toBe(403);
  });

  it('keeps site isolation: another customer cannot see the bridged site', async () => {
    const stranger = await signup(t.api, 'bridge-stranger');
    expect(
      (
        await call(t.api, 'GET', `/solar/sites/${p.site.id}/overview`, {
          token: stranger.token,
        })
      ).status,
    ).toBe(404);
  });

  it('after a restart it resumes from its cursor without re-storing anything', async () => {
    await t.close();
    const before = await samples();
    const id = await deliver(SITE, [
      { ts: minutesAgo(0.2), metrics: { pv_w: 2400, load_w: 900 } },
    ]);
    t = await start();
    await until(cursor, (c) => c === id, 20_000);
    await until(samples, (n) => n === before + 1, 10_000);
    await new Promise((res) => setTimeout(res, 1000));
    expect(await samples()).toBe(before + 1);
  });
});

describe('ingest bridge — failure modes on real Redis and MongoDB', () => {
  const site = (n: string) => `${SITE}-${n}`;
  const countFor = (installationId: string) =>
    prisma.solarSample.count({ where: { installationId } });

  it('MongoDB outage: the entry waits, then is stored exactly once when MongoDB is back', async () => {
    const pr = await provision(t.api, admin, owner.user.id, {
      systemId: site('mongo'),
    });
    const st = readState();
    await killMongo(st);
    const id = await deliver(site('mongo'), [
      { ts: minutesAgo(1), metrics: { pv_w: 1234 } },
    ]);
    await new Promise((res) => setTimeout(res, 3000));
    await startMongo(st);
    writeState(st);
    await until(cursor, (c) => c === id, 60_000);
    await until(
      () => countFor(pr.installation.id),
      (n) => n === 1,
      20_000,
    );
    await new Promise((res) => setTimeout(res, 1500));
    expect(await countFor(pr.installation.id)).toBe(1);
  });

  it('stream trimmed past the position while the bridge was down: gap recorded, later entries processed', async () => {
    const pr = await provision(t.api, admin, owner.user.id, {
      systemId: site('trim'),
    });
    const before = await cursor();
    await t.close();
    await deliver(site('trim'), [{ ts: minutesAgo(2), metrics: { pv_w: 1 } }]);
    const last = await deliver(site('trim'), [
      { ts: minutesAgo(1), metrics: { pv_w: 2 } },
    ]);
    // Test stream only: trim to the newest entry (what MAXLEN does on a full stream).
    await r.xTrim(STREAM, 'MAXLEN', 1);
    t = await start();
    await until(cursor, (c) => c === last, 20_000);
    const gap = await prisma.solarDeadLetter.findUnique({
      where: { streamId: `${STREAM}/gap/${before}..${last}` },
    });
    expect(gap?.error).toMatch(/never processed/);
    expect(await countFor(pr.installation.id)).toBe(1);
  });

  it('a systemId shared by two installations (legacy data) is refused, not routed to either', async () => {
    const other = await signup(t.api, 'bridge-other');
    const a = await provision(t.api, admin, owner.user.id, {
      systemId: site('dup'),
    });
    const b = await provision(t.api, admin, other.user.id);
    // The admin API now refuses a second installation with this systemId; data
    // written before that rule existed can still contain one.
    await prisma.installation.update({
      where: { id: b.installation.id },
      data: { externalSystemId: site('dup') },
    });
    const id = await deliver(site('dup'), [
      { ts: minutesAgo(1), metrics: { pv_w: 5 } },
    ]);
    await until(cursor, (c) => c === id, 15_000);
    const dl = await prisma.solarDeadLetter.findUnique({
      where: { streamId: `${STREAM}/${id}` },
    });
    expect(dl?.error).toMatch(/more than one installation/);
    expect(await countFor(a.installation.id)).toBe(0);
    expect(await countFor(b.installation.id)).toBe(0);
  });

  it('admin replay: register the missing installation, replay the dead letter, readings stored once', async () => {
    const id = await deliver(site('late'), [
      { ts: minutesAgo(1), metrics: { pv_w: 7, load_w: 3 } },
    ]);
    await until(cursor, (c) => c === id, 15_000);
    const dl = await prisma.solarDeadLetter.findUnique({
      where: { streamId: `${STREAM}/${id}` },
    });
    expect(dl?.error).toMatch(/no installation/);
    const pr = await provision(t.api, admin, owner.user.id, {
      systemId: site('late'),
    });
    const path = `/admin/solar/ingest-bridge/dead-letters/${dl?.id}/replay`;
    expect(
      (await call(t.api, 'POST', path, { token: owner.token })).status,
    ).toBe(403);
    // The bridge caches "unknown" for a minute; replay must still find it.
    const res = await call(t.api, 'POST', path, { token: admin });
    expect([res.status, res.data.data]).toEqual([200, { replayed: true }]);
    expect(await countFor(pr.installation.id)).toBe(1);
    expect(
      await prisma.solarDeadLetter.findUnique({ where: { id: dl?.id } }),
    ).toBeNull();
  });

  it('group mode: reads with the consumer group, acknowledges after storing, nothing pending', async () => {
    const GSTREAM = `${STREAM}:group`;
    // The Redis admin's part (Felix): create the group. The bridge never does.
    await r.sendCommand([
      'XGROUP',
      'CREATE',
      GSTREAM,
      'carbonoz-bridge',
      '0',
      'MKSTREAM',
    ]);
    const g = await startApi({
      INGEST_BRIDGE_ENABLED: 'true',
      INGEST_REDIS_URL: readState().redisUrl,
      INGEST_STREAM_KEY: GSTREAM,
      INGEST_BRIDGE_MODE: 'group',
      INGEST_CONSUMER: `e2e-${tag}`,
      INGEST_BRIDGE_BLOCK_MS: '300',
    });
    try {
      const pr = await provision(g.api, admin, owner.user.id, {
        systemId: site('group'),
      });
      await r.xAdd(GSTREAM, '*', {
        payload: JSON.stringify({
          site: site('group'),
          readings: [{ ts: minutesAgo(1), metrics: { pv_w: 900 } }],
        }),
      });
      await until(
        () => countFor(pr.installation.id),
        (n) => n === 1,
        20_000,
      );
      const pending = async () =>
        Number(
          (
            (await r.sendCommand([
              'XPENDING',
              GSTREAM,
              'carbonoz-bridge',
            ])) as unknown[]
          )[0],
        );
      await until(pending, (n) => n === 0, 10_000);
      const h = await call(g.api, 'GET', '/admin/solar/health', {
        token: admin,
      });
      expect(h.data.data.ingestBridge).toMatchObject({
        mode: 'group',
        group: 'carbonoz-bridge',
        connected: true,
        groupPending: 0,
        upToDate: true,
      });
    } finally {
      await g.close();
    }
  });
});
