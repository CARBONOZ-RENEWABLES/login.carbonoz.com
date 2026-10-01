/**
 * Realtime Energy Flow stream: GET /solar/sites/:siteId/live (server-sent
 * events) — snapshot of the latest SYSTEM/INVERTER/BATTERY readings from the
 * Redis live state, pushed within about a second of ingestion, heartbeats in
 * between, same site access rules as every other Solar route.
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

interface Ev {
  type: string;
  data: {
    serverTime: string;
    available?: boolean;
    devices?: { kind: string; ts: string; metrics: Record<string, unknown> }[];
  };
  at: number;
}

/** Opens the stream and collects parsed events until `until` says stop (or timeout). */
async function collect(
  siteId: string,
  token: string,
  until: (evs: Ev[]) => boolean,
  timeoutMs = 10_000,
  onOpen?: () => Promise<void>,
) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const res = await fetch(`${t.api}/solar/sites/${siteId}/live`, {
    headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' },
    signal: ac.signal,
  });
  const evs: Ev[] = [];
  if (res.status !== 200 || !res.body) {
    clearTimeout(timer);
    return { res, evs };
  }
  await onOpen?.();
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  try {
    while (!until(evs)) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const type = /^event: ?(.*)$/m.exec(block)?.[1] ?? 'message';
        const data = block
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.replace(/^data: ?/, ''))
          .join('\n');
        if (data) evs.push({ type, data: JSON.parse(data), at: Date.now() });
      }
    }
  } catch (e) {
    if (!ac.signal.aborted) throw e;
  } finally {
    clearTimeout(timer);
    ac.abort();
  }
  return { res, evs };
}

async function liveSite() {
  const owner = await signup(t.api, 'live');
  const p = await provision(t.api, admin, owner.user.id);
  const m = reading({
    measurements: {
      pvPower: 3000,
      loadPower: 1000,
      gridPower: -500,
      batteryPower: 1500,
      soc: 55,
    },
  });
  expect((await ingest(t.api, p.key, m)).status).toBe(202);
  expect((await processed(prisma, m.messageId))?.status).toBe('PROCESSED');
  return { owner, p };
}

describe('live energy-flow stream', () => {
  it('requires a session and access to the site', async () => {
    const { p } = await liveSite();
    const anon = await fetch(`${t.api}/solar/sites/${p.site.id}/live`);
    expect(anon.status).toBe(401);
    const stranger = await signup(t.api, 'live-stranger');
    const { res } = await collect(p.site.id, stranger.token, () => true);
    expect(res.status).toBe(404);
  });

  it('starts with a snapshot of the latest readings, then sends heartbeats every second', async () => {
    const { owner, p } = await liveSite();
    const { res, evs } = await collect(
      p.site.id,
      owner.token,
      (e) => e.length >= 4,
    );
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    expect(res.headers.get('x-accel-buffering')).toBe('no');
    expect(evs[0].type).toBe('snapshot');
    const sys = evs[0].data.devices?.find((d) => d.kind === 'SYSTEM');
    expect(sys?.metrics).toMatchObject({
      pv_power_w: 3000,
      load_power_w: 1000,
      grid_power_w: -500,
      battery_power_w: 1500,
      soc_pct: 55,
    });
    // BMS readings (with cell arrays) are not part of the live energy state.
    expect(evs[0].data.devices?.some((d) => d.kind === 'BMS')).toBe(false);
    expect(
      evs
        .slice(1)
        .every((e) => e.type === 'heartbeat' && e.data.available === true),
    ).toBe(true);
    const gaps = evs.slice(1).map((e, i) => e.at - evs[i].at);
    expect(Math.max(...gaps)).toBeLessThan(2500);
    expect(
      Math.abs(Date.parse(evs[3].data.serverTime) - Date.now()),
    ).toBeLessThan(5000);
  });

  it('pushes a new snapshot within about a second of a new SolarBMS reading', async () => {
    const { owner, p } = await liveSite();
    let sentAt = 0;
    const { evs } = await collect(
      p.site.id,
      owner.token,
      (e) => e.filter((x) => x.type === 'snapshot').length >= 2,
      15_000,
      async () => {
        await new Promise((r) => setTimeout(r, 1500));
        sentAt = Date.now();
        const m = reading({
          measurements: {
            pvPower: 0,
            loadPower: 800,
            gridPower: 300,
            batteryPower: -500,
            soc: 54,
          },
        });
        expect((await ingest(t.api, p.key, m)).status).toBe(202);
      },
    );
    const second = evs.filter((e) => e.type === 'snapshot')[1];
    expect(second).toBeDefined();
    const sys = second.data.devices?.find((d) => d.kind === 'SYSTEM');
    expect(sys?.metrics).toMatchObject({
      grid_power_w: 300,
      battery_power_w: -500,
    });
    // Ingestion → worker → Redis → stream; generous bound for CI.
    expect(second.at - sentAt).toBeLessThan(4000);
  });

  it('lets an ADMIN watch any site and gives every viewer the first snapshot', async () => {
    const { owner, p } = await liveSite();
    const [a, b] = await Promise.all([
      collect(p.site.id, admin, (e) => e.length >= 1),
      collect(p.site.id, owner.token, (e) => e.length >= 1),
    ]);
    expect(a.evs[0].type).toBe('snapshot');
    expect(b.evs[0].type).toBe('snapshot');
    expect(JSON.stringify(a.evs[0].data.devices)).toBe(
      JSON.stringify(b.evs[0].data.devices),
    );
  });

  it('streams are not logged as slow requests, and normal calls still work meanwhile', async () => {
    const { owner, p } = await liveSite();
    await collect(p.site.id, owner.token, (e) => e.length >= 3);
    const r = await call(t.api, 'GET', `/solar/sites/${p.site.id}/overview`, {
      token: owner.token,
    });
    expect(r.status).toBe(200);
    await new Promise((res) => setTimeout(res, 300));
    const slow = await prisma.logs.count({
      where: { description: { contains: `/solar/sites/${p.site.id}/live` } },
    });
    expect(slow).toBe(0);
  });
});
