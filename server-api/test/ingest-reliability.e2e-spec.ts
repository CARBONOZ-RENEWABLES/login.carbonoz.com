/**
 * Store reliability on the real test MongoDB (SYNTHETIC TEST DATA ONLY):
 * a transient database error during normalization is retried, not recorded
 * as FAILED and acknowledged; concurrent processing of one reading (bridge
 * retry, pm2 reload, replay, admin reprocess) never doubles its samples.
 */
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { SolarStoreService } from '../src/solar/store/solar-store.service';
import { startApi, TestApi } from './support/app';
import {
  adminToken,
  call,
  db,
  provision,
  reading,
  signup,
  tag,
} from './support/http';

const prisma = db();
let t: TestApi;
let store: SolarStoreService;
let appPrisma: PrismaService;
let target: { installationId: string; siteId: string };

beforeAll(async () => {
  t = await startApi();
  store = t.app.get(SolarStoreService);
  appPrisma = t.app.get(PrismaService);
  const admin = await adminToken(t.api);
  const owner = await signup(t.api, 'reliab');
  const p = await provision(t.api, admin, owner.user.id);
  target = { installationId: p.installation.id, siteId: p.site.id };
});
afterAll(async () => {
  await prisma.$disconnect();
  await t.close();
});

const message = () => {
  const m = reading();
  return {
    ...target,
    messageId: String(m.messageId),
    receivedAt: new Date().toISOString(),
    payload: JSON.stringify(m),
  };
};
const samplesOf = (messageId: string) =>
  prisma.solarIngest
    .findUnique({
      where: {
        installationId_messageId: {
          installationId: target.installationId,
          messageId,
        },
      },
    })
    .then((i) =>
      i ? prisma.solarSample.count({ where: { ingestId: i.id } }) : -1,
    );

describe('transient MongoDB failure during normalization', () => {
  it('is retried (not FAILED, not acknowledged); the retry stores exactly one set of samples', async () => {
    const m = message();
    const outage = new Prisma.PrismaClientKnownRequestError(
      "Can't reach database server",
      { code: 'P1001', clientVersion: 'test' },
    );
    const spy = jest
      .spyOn(appPrisma.solarSample, 'createMany')
      .mockRejectedValueOnce(outage);
    try {
      const first = await store.processStreamMessage(m);
      expect(first).toMatchObject({ stored: false, transient: true });
      const row = await prisma.solarIngest.findFirst({
        where: { messageId: m.messageId },
      });
      expect(row.status).toBe('QUEUED'); // not FAILED
      expect(row.leaseOwner ?? null).toBeNull(); // lease released

      const retry = await store.processStreamMessage(m);
      expect(retry).toEqual({ stored: true });
    } finally {
      spy.mockRestore();
    }
    const n = await samplesOf(m.messageId);
    expect(n).toBeGreaterThan(0);
    // Running it again changes nothing.
    expect(await store.processStreamMessage(m)).toEqual({ stored: true });
    expect(await samplesOf(m.messageId)).toBe(n);
  });

  it('a permanent error is still recorded as FAILED with the raw payload kept', async () => {
    const m = message();
    const spy = jest
      .spyOn(appPrisma.solarSample, 'createMany')
      .mockRejectedValueOnce(new Error('Invalid value for metrics'));
    try {
      expect(await store.processStreamMessage(m)).toEqual({ stored: true });
    } finally {
      spy.mockRestore();
    }
    const row = await prisma.solarIngest.findFirst({
      where: { messageId: m.messageId },
    });
    expect(row.status).toBe('FAILED');
    expect(row.payload).toBeTruthy();
  });

  it('a main-Redis error in the live view does not fail the durable store', async () => {
    const m = message();
    const raw = (
      store as unknown as { redis: { raw: Record<string, unknown> } }
    ).redis.raw as { expire: () => Promise<unknown> };
    const spy = jest
      .spyOn(raw, 'expire')
      .mockRejectedValueOnce(new Error('connection closed'));
    try {
      expect(await store.processStreamMessage(m)).toEqual({ stored: true });
    } finally {
      spy.mockRestore();
    }
    const row = await prisma.solarIngest.findFirst({
      where: { messageId: m.messageId },
    });
    expect(row.status).toBe('PROCESSED');
  });

  it('a main-Redis outage in alarm state is retried, then stored once', async () => {
    const m = message();
    const raw = (
      store as unknown as { redis: { raw: Record<string, unknown> } }
    ).redis.raw as { hmGet: () => Promise<unknown> };
    const spy = jest
      .spyOn(raw, 'hmGet')
      .mockRejectedValueOnce(new Error('connection closed'));
    try {
      expect(await store.processStreamMessage(m)).toMatchObject({
        stored: false,
        transient: true,
      });
    } finally {
      spy.mockRestore();
    }
    expect(await store.processStreamMessage(m)).toEqual({ stored: true });
    const row = await prisma.solarIngest.findFirst({
      where: { messageId: m.messageId },
    });
    expect(row.status).toBe('PROCESSED');
  });
});

describe('concurrent processing of one reading', () => {
  it('stores one set of samples when the same message is processed in parallel', async () => {
    const m = message();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => store.processStreamMessage(m)),
    );
    // Some callers are told to retry (lease held); none stores twice.
    expect(results.some((r) => r.stored)).toBe(true);
    for (const r of results.filter((x) => !x.stored))
      expect(r.transient).toBe(true);
    const settled = await store.processStreamMessage(m);
    expect(settled).toEqual({ stored: true });
    const ingest = await prisma.solarIngest.findFirst({
      where: { messageId: m.messageId },
    });
    const once = await prisma.solarSample.count({
      where: { ingestId: ingest.id },
    });
    // A single derive of this reading writes exactly this many samples.
    await store.derive(ingest.id);
    expect(
      await prisma.solarSample.count({ where: { ingestId: ingest.id } }),
    ).toBe(once);
  });

  it('admin reprocess while a lease is held answers 409 and writes nothing', async () => {
    const m = message();
    expect(await store.processStreamMessage(m)).toEqual({ stored: true });
    const ingest = await prisma.solarIngest.findFirst({
      where: { messageId: m.messageId },
    });
    const before = await prisma.solarSample.count({
      where: { ingestId: ingest.id },
    });
    await prisma.solarIngest.update({
      where: { id: ingest.id },
      data: {
        leaseOwner: `other-${tag()}`,
        leaseUntil: new Date(Date.now() + 60_000),
      },
    });
    const admin = await adminToken(t.api);
    const r = await call(
      t.api,
      'POST',
      `/admin/solar/ingests/${ingest.id}/reprocess`,
      {
        token: admin,
      },
    );
    expect(r.status).toBe(409);
    expect(
      await prisma.solarSample.count({ where: { ingestId: ingest.id } }),
    ).toBe(before);

    // An expired lease (crashed process) is taken over.
    await prisma.solarIngest.update({
      where: { id: ingest.id },
      data: { leaseUntil: new Date(Date.now() - 1000) },
    });
    const ok = await call(
      t.api,
      'POST',
      `/admin/solar/ingests/${ingest.id}/reprocess`,
      {
        token: admin,
      },
    );
    expect(ok.status).toBe(200);
    expect(
      await prisma.solarSample.count({ where: { ingestId: ingest.id } }),
    ).toBe(before);
  });
});
