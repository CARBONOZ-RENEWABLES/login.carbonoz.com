/**
 * Outage drills against real processes: Redis and MongoDB are stopped and
 * restarted. Nothing accepted may be lost, acknowledged early, duplicated or
 * left stuck; a bad message must not block other installations.
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
  redis,
  signup,
  sleep,
  sso,
  tag,
  until,
} from './support/http';
import {
  killMongo,
  readState,
  startMongo,
  startRedis,
  stopRedis,
  writeState,
} from './support/stack';

const FAST = {
  SOLAR_RECLAIM_IDLE_MS: '1500',
  SOLAR_MAX_DELIVERIES: '3',
  // Fail fast while MongoDB is down instead of Prisma's 30 s server selection.
  DATABASE_URL: `${
    readState().databaseUrl
  }&serverSelectionTimeoutMS=3000&connectTimeoutMS=3000`,
};

let t: TestApi;
const prisma = db();
let admin: string;
let owner: Awaited<ReturnType<typeof signup>>;
let p: Awaited<ReturnType<typeof provision>>;
const st = readState();

const pending = async () => {
  const r = await redis();
  const n = Number(
    (
      (await r.sendCommand([
        'XPENDING',
        'solar:ingest',
        'solar-store',
      ])) as unknown[]
    )[0],
  );
  await r.quit();
  return n;
};

afterAll(async () => {
  // Leave the stack running for other files.
  if (
    !(await redis()
      .then(async (c) => (await c.quit(), true))
      .catch(() => false))
  )
    await startRedis(st);
  await prisma.$disconnect();
  await t?.close();
});

describe('Redis', () => {
  it('the API starts and serves non-Redis routes while Redis is down; the worker connects later', async () => {
    stopRedis(st);
    await sleep(500);
    const started = Date.now();
    t = await startApi(FAST);
    expect(Date.now() - started).toBeLessThan(15_000);
    expect((await call(t.api, 'GET', '/auth/config')).status).toBe(200);
    admin = await adminToken(t.api); // legacy login needs no Redis
    expect((await call(t.api, 'GET', '/sites', { token: admin })).status).toBe(
      200,
    );
    await startRedis(st);
    owner = await signup(t.api, 'outage');
    p = await provision(t.api, admin, owner.user.id);
    const m = reading();
    const r = await until(
      () => ingest(t.api, p.key, m),
      (x) => x.status === 202,
      30_000,
      500,
    );
    expect(r.status).toBe(202);
    expect((await processed(prisma, m.messageId, 30_000))?.status).toBe(
      'PROCESSED',
    );
  });

  it('fails fast with 503 while Redis is down at runtime and recovers without losing data', async () => {
    const session = (await sso(t.api, { email: `rd-${tag()}@example.test` }))
      .session;
    stopRedis(st);
    await sleep(800);
    const down = await ingest(t.api, p.key, reading());
    expect(down.status).toBe(503);
    expect(down.ms).toBeLessThan(3000);
    const ses = await call(t.api, 'GET', '/auth/session', { cookie: session });
    expect(ses.status).toBe(503);
    expect(ses.ms).toBeLessThan(3000);
    expect((await call(t.api, 'GET', '/sites', { token: admin })).status).toBe(
      200,
    );
    await startRedis(st);
    const m = reading();
    const back = await until(
      () => ingest(t.api, p.key, m),
      (x) => x.status === 202,
      30_000,
      500,
    );
    expect(back.status).toBe(202);
    await processed(prisma, m.messageId, 30_000);
    expect(
      (await call(t.api, 'GET', '/auth/session', { cookie: session })).status,
    ).toBe(200); // AOF kept the session
    await until(pending, (n) => n === 0, 15_000);
  });
});

describe('bad messages', () => {
  it('stores messages with field names MongoDB rejects, keeping the original text', async () => {
    const id = `nul-${tag()}`;
    const raw = `{"messageId":"${id}","measurements":{"pvPower":7},"bad\\u0000key":1,"$where":2,"a.b":3}`;
    expect(
      (await call(t.api, 'POST', '/ingest/solarbms', { token: p.key, raw }))
        .status,
    ).toBe(202);
    const row = await processed(prisma, id);
    expect(row.status).toBe('PROCESSED');
    expect(row.rawText).toBe(raw);
    const after = reading();
    await ingest(t.api, p.key, after);
    expect((await processed(prisma, after.messageId)).status).toBe('PROCESSED');
    await until(pending, (n) => n === 0, 15_000);
  });

  it('dead-letters a permanently failing message after bounded retries; others keep flowing', async () => {
    const r = await redis();
    const bad = `perm-${tag()}`;
    const streamId = String(
      await r.xAdd('solar:ingest', '*', {
        installationId: 'not-an-objectid',
        siteId: 'x',
        messageId: bad,
        receivedAt: new Date().toISOString(),
        payload: '{}',
      }),
    );
    const good = reading();
    await ingest(t.api, p.key, good);
    expect((await processed(prisma, good.messageId)).status).toBe('PROCESSED');
    const dl = await until(
      () => prisma.solarDeadLetter.findUnique({ where: { streamId } }),
      (x) => !!x,
      30_000,
      500,
    );
    expect(dl.deliveries).toBeGreaterThanOrEqual(3);
    expect(dl.rawText).toBe('{}');
    await until(pending, (n) => n === 0, 15_000);
    const list = await call(t.api, 'GET', '/admin/solar/dead-letters', {
      token: admin,
    });
    expect(list.data.data.stored.some((x) => x.streamId === streamId)).toBe(
      true,
    );
    await r.quit();
  });

  it('requeues a dead letter onto the stream', async () => {
    const m = reading();
    const dl = await prisma.solarDeadLetter.create({
      data: {
        streamId: `manual-${tag()}`,
        installationId: p.installation.id,
        siteId: p.site.id,
        messageId: m.messageId,
        receivedAt: new Date(),
        rawText: JSON.stringify(m),
        deliveries: 3,
      },
    });
    expect(
      (
        await call(
          t.api,
          'POST',
          `/admin/solar/dead-letters/${dl.id}/requeue`,
          { token: admin },
        )
      ).status,
    ).toBe(200);
    expect((await processed(prisma, m.messageId)).status).toBe('PROCESSED');
    expect(
      await prisma.solarDeadLetter.findUnique({ where: { id: dl.id } }),
    ).toBeNull();
  });
});

describe('MongoDB', () => {
  it('keeps queued messages pending (never dead-letters) while MongoDB is down, then stores them', async () => {
    // Warm the credential cache: known devices keep sending during the outage.
    const warm = reading();
    await ingest(t.api, p.key, warm);
    await processed(prisma, warm.messageId);
    await killMongo(st);
    await sleep(500);
    const during = reading();
    const r = await ingest(t.api, p.key, during);
    expect(r.status).toBe(202); // buffered in Redis
    await sleep(9000); // > maxDeliveries × reclaim idle
    expect(await pending()).toBeGreaterThanOrEqual(1);
    const rc = await redis();
    expect(await rc.xLen('solar:ingest:dead')).toBe(0);
    await rc.quit();
    await startMongo(st);
    writeState(st);
    expect((await processed(prisma, during.messageId, 90_000))?.status).toBe(
      'PROCESSED',
    );
    expect(
      await prisma.solarDeadLetter.count({
        where: { messageId: during.messageId },
      }),
    ).toBe(0);
    await until(pending, (n) => n === 0, 30_000);
  });
});

describe('concurrency', () => {
  it('a held lock stops a second worker from processing the same entry', async () => {
    const r = await redis();
    const m = reading();
    const id = `${Date.now() + 5000}-0`;
    await r.set(`solar:lock:${id}`, 'other-worker', { PX: 60_000 });
    await r.xAdd('solar:ingest', id, {
      installationId: p.installation.id,
      siteId: p.site.id,
      messageId: m.messageId,
      receivedAt: new Date().toISOString(),
      payload: JSON.stringify(m),
    });
    await sleep(4000);
    expect(
      await prisma.solarIngest.count({ where: { messageId: m.messageId } }),
    ).toBe(0);
    await r.del(`solar:lock:${id}`);
    await processed(prisma, m.messageId, 20_000);
    const ingestRow = await prisma.solarIngest.findFirst({
      where: { messageId: m.messageId },
    });
    // One SYSTEM + one BATTERY + one BMS sample: processed exactly once.
    expect(
      await prisma.solarSample.count({ where: { ingestId: ingestRow.id } }),
    ).toBe(3);
    await r.quit();
  });

  it('two workers share the stream without duplicating samples', async () => {
    const t2 = await startApi(FAST);
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) {
      const m = reading();
      ids.push(m.messageId);
      await ingest(t.api, p.key, m);
    }
    for (const id of ids) await processed(prisma, id, 30_000);
    const rows = await prisma.solarIngest.findMany({
      where: { messageId: { in: ids } },
      select: { id: true },
    });
    expect(rows).toHaveLength(30);
    const samples = await prisma.solarSample.count({
      where: { ingestId: { in: rows.map((x) => x.id) } },
    });
    expect(samples).toBe(90);
    await t2.close();
  });
});
