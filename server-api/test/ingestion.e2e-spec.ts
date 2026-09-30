/**
 * SolarBMS ingestion through the real pipeline (HTTP → Redis stream → worker
 * → MongoDB → read API): contract handling, dynamic data, ordering and state.
 */
import { SolarEnergyService } from '../src/solar/read/solar-energy.service';
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

let t: TestApi;
const prisma = db();
let admin: string;
let owner: Awaited<ReturnType<typeof signup>>;
let p: Awaited<ReturnType<typeof provision>>;
const get = (path: string) =>
  call(t.api, 'GET', `/solar/sites/${p.site.id}${path}`, {
    token: owner.token,
  });

beforeAll(async () => {
  t = await startApi();
  admin = await adminToken(t.api);
  owner = await signup(t.api, 'ing');
  p = await provision(t.api, admin, owner.user.id, { systemId: 'sbms-e2e' });
});
afterAll(async () => {
  await prisma.$disconnect();
  await t.close();
});

describe('HTTP contract', () => {
  it('deduplicates by messageId', async () => {
    const m = reading({ systemId: 'sbms-e2e' });
    expect((await ingest(t.api, p.key, m)).data.data[0].status).toBe('queued');
    expect((await ingest(t.api, p.key, m)).data.data[0].status).toBe(
      'duplicate',
    );
    await processed(prisma, m.messageId);
    expect(
      await prisma.solarIngest.count({ where: { messageId: m.messageId } }),
    ).toBe(1);
  });

  it('rejects malformed, oversized and out-of-contract requests', async () => {
    expect(
      (
        await call(t.api, 'POST', '/ingest/solarbms', {
          token: p.key,
          raw: '{"a":',
        })
      ).status,
    ).toBe(400);
    expect((await ingest(t.api, p.key, [1, 2])).status).toBe(400);
    expect(
      (
        await ingest(t.api, p.key, {
          messages: Array.from({ length: 101 }, () => reading()),
        })
      ).status,
    ).toBe(400);
    expect(
      (await ingest(t.api, p.key, { messages: [reading(), 'x'] })).status,
    ).toBe(400);
    expect(
      (await ingest(t.api, p.key, reading({ blob: 'x'.repeat(150_000) })))
        .status,
    ).toBe(413);
  });

  it('accepts odd shapes and keeps the raw payload verbatim', async () => {
    const m = {
      messageId: `odd-${tag()}`,
      batteries: 'nope',
      inverters: [null, 5],
      bms: { cells: 'x' },
      deep: { a: { b: { c: 1 } } },
    };
    expect((await ingest(t.api, p.key, m)).status).toBe(202);
    const row = await processed(prisma, m.messageId);
    expect(row.payload).toEqual(m);
  });
});

describe('dynamic data', () => {
  it('stores and exposes unknown metrics at every level, arbitrary cells and per-cell fields', async () => {
    const m = reading({
      systemId: 'sbms-e2e',
      measurements: {
        pvPower: 2000,
        siteNewMetric: 1.5,
        nested: { newerThing: 3 },
      },
      inverters: [
        { id: 'inv-1', power: 900, newInverterMetricKw: 0.9 },
        { id: 'inv-2', power: 1100 },
      ],
      batteries: [
        {
          id: 'pack-a',
          soc: 70,
          bms: [
            {
              id: 'jk-1',
              newBmsMetric: 4,
              cells: Array.from({ length: 16 }, (_, i) => ({
                id: i + 1,
                voltage: 3.3 + i / 1000,
                temperature: 20 + i,
                balancing: i === 3,
                cellResistance: 0.2,
                balancingCurrent: 0.05,
              })),
            },
          ],
        },
        {
          id: 'pack-b',
          soc: 75,
          bms: [
            { cells: [3.31, 3.32, 3.33, 3.34, 3.35, 3.36, 3.37, 3.38] },
            { cells: [3.3, 3.31, 3.32] },
          ],
        },
      ],
    });
    await ingest(t.api, p.key, m);
    await processed(prisma, m.messageId);
    const ov = (await get('/overview')).data.data;
    const find = (kind: string, id: string) =>
      ov.devices.find((d) => d.kind === kind && d.externalId === id);
    expect(find('SYSTEM', 'sbms-e2e').latest.metrics).toMatchObject({
      site_new_metric: 1.5,
      nested_newer_thing: 3,
    });
    expect(
      find('INVERTER', 'inv-1').latest.metrics.new_inverter_metric_kw,
    ).toBe(0.9);
    expect(find('BMS', 'jk-1').latest.metrics.new_bms_metric).toBe(4);
    expect(find('BMS', 'jk-1').latest.cells).toHaveLength(16);
    expect(find('BMS', 'jk-1').latest.cells[3]).toMatchObject({
      temperature: 23,
      balancing: true,
      cell_resistance: 0.2,
      balancing_current: 0.05,
    });
    expect(find('BMS', 'jk-1').latest.metrics).toMatchObject({
      cell_count: 16,
      cell_voltage_min_v: 3.3,
      cell_voltage_max_v: 3.315,
      cell_voltage_spread_mv: 15,
    });
    // Two id-less BMS on one battery get distinct ids and their own cell counts.
    expect(find('BMS', 'pack-b-bms').latest.cells).toHaveLength(8);
    expect(find('BMS', 'pack-b-bms-2').latest.cells).toHaveLength(3);
    const keys = ov.metrics.map((x) => `${x.deviceKind}:${x.key}`);
    expect(keys).toEqual(
      expect.arrayContaining([
        'SYSTEM:site_new_metric',
        'INVERTER:new_inverter_metric_kw',
        'BMS:new_bms_metric',
      ]),
    );
    expect(
      ov.metrics.find((x) => x.key === 'new_inverter_metric_kw').unit,
    ).toBe('kW');
    const hist = (await get('/history?metric=site_new_metric')).data.data;
    expect(hist.series[0].points[0].avg).toBe(1.5);
  });

  it('stores events and forecast', async () => {
    const m = reading({
      systemId: 'sbms-e2e',
      events: [
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          code: 'GRID_RESTORED',
          message: 'Grid restored',
          deviceKind: 'inverter',
          deviceId: 'inv-1',
        },
      ],
      forecast: {
        source: 'solcast',
        points: [
          { ts: new Date(Date.now() + 3600e3).toISOString(), pvPowerW: 4000 },
        ],
      },
    });
    await ingest(t.api, p.key, m);
    await processed(prisma, m.messageId);
    const ev = (await get('/events')).data.data;
    expect(ev.some((e) => e.code === 'grid_restored' && !e.active)).toBe(true);
    const fc = (await get('/forecast')).data.data;
    expect(fc.source).toBe('solcast');
    expect(fc.points[0].pv_power_w).toBe(4000);
  });
});

describe('time and state', () => {
  const bmsMsg = (ts: number, alarms: unknown[]) =>
    reading({
      systemId: 'sbms-e2e',
      timestamp: new Date(ts).toISOString(),
      batteries: [
        {
          id: 'order-pack',
          bms: { id: 'order-bms', alarms, cells: [3.3, 3.31] },
        },
      ],
    });
  const active = (code: string) =>
    prisma.solarEvent.count({
      where: { siteId: p.site.id, code, active: true },
    });

  it('an older reading never changes newer alarm state', async () => {
    const now = Date.now();
    const code = `order_${tag()}`;
    const m1 = bmsMsg(now, [{ code, message: 'x', severity: 'alarm' }]);
    await ingest(t.api, p.key, m1);
    await processed(prisma, m1.messageId);
    expect(await active(code)).toBe(1);
    // Older reading without the alarm → must not clear it.
    const m2 = bmsMsg(now - 3600e3, []);
    await ingest(t.api, p.key, m2);
    await processed(prisma, m2.messageId);
    expect(await active(code)).toBe(1);
    // Newer reading without the alarm → clears it.
    const m3 = bmsMsg(now + 1000, []);
    await ingest(t.api, p.key, m3);
    await processed(prisma, m3.messageId);
    expect(await active(code)).toBe(0);
    // Older reading WITH the alarm after that clear → must not re-activate it.
    const m4 = bmsMsg(now - 1800e3, [
      { code, message: 'x', severity: 'alarm' },
    ]);
    await ingest(t.api, p.key, m4);
    await processed(prisma, m4.messageId);
    expect(await active(code)).toBe(0);
    // lastSeenAt never moves backwards.
    const dev = await prisma.solarDevice.findFirst({
      where: {
        installationId: p.installation.id,
        kind: 'BMS',
        externalId: 'order-bms',
      },
    });
    expect(dev.lastSeenAt.getTime()).toBeGreaterThanOrEqual(now + 1000 - 1);
  });

  it('clamps future timestamps and keeps the live value from the newest reading', async () => {
    const future = reading({
      systemId: 'sbms-e2e',
      timestamp: '2099-01-01T00:00:00Z',
      measurements: { pvPower: 9999 },
    });
    await ingest(t.api, p.key, future);
    await processed(prisma, future.messageId);
    const normal = reading({
      systemId: 'sbms-e2e',
      measurements: { pvPower: 1234 },
    });
    await ingest(t.api, p.key, normal);
    await processed(prisma, normal.messageId);
    const sys = (await get('/overview')).data.data.devices.find(
      (d) => d.kind === 'SYSTEM',
    );
    expect(sys.latest.metrics.pv_power_w).toBe(1234);
    expect(new Date(sys.latest.ts).getTime()).toBeLessThanOrEqual(
      Date.now() + 5000,
    );
  });

  it('marks old readings as stale and sites without data as "none"', async () => {
    const o2 = await signup(t.api, 'stale');
    const q = await provision(t.api, admin, o2.user.id);
    const empty = (
      await call(t.api, 'GET', `/solar/sites/${q.site.id}/overview`, {
        token: o2.token,
      })
    ).data.data;
    expect(empty.source).toBe('none');
    expect(empty.stale).toBe(true);
    const old = reading({
      timestamp: new Date(Date.now() - 2 * 3600e3).toISOString(),
    });
    await ingest(t.api, q.key, old);
    await processed(prisma, old.messageId);
    const ov = (
      await call(t.api, 'GET', `/solar/sites/${q.site.id}/overview`, {
        token: o2.token,
      })
    ).data.data;
    expect(ov.stale).toBe(true);
    expect(ov.devices.every((d) => d.latest.stale)).toBe(true);
  });
});

describe('isolation and limits', () => {
  it('keeps same-id devices of two installations on one site apart (live, cells, history)', async () => {
    const o3 = await signup(t.api, 'multi');
    const x = await provision(t.api, admin, o3.user.id);
    const y = await x.post(`/admin/sites/${x.site.id}/installations`, {
      name: 'Pi 2',
    });
    const yKey = (
      await x.post(`/admin/installations/${y.id}/credentials`, {
        type: 'API_KEY',
      })
    ).apiKey;
    const m1 = reading({ measurements: { pvPower: 100 } });
    const m2 = reading({
      measurements: { pvPower: 200 },
      batteries: [
        {
          id: 'battery-1',
          soc: 90,
          bms: { id: 'bms-1', cells: [3.4, 3.41, 3.42] },
        },
      ],
    });
    await ingest(t.api, x.key, m1);
    await ingest(t.api, yKey, m2);
    await processed(prisma, m1.messageId);
    await processed(prisma, m2.messageId);
    const r = (path: string) =>
      call(t.api, 'GET', `/solar/sites/${x.site.id}${path}`, {
        token: o3.token,
      });
    const bats = (await r('/overview')).data.data.devices.filter(
      (d) => d.kind === 'BATTERY',
    );
    expect(new Set(bats.map((b) => b.installationId)).size).toBe(2);
    expect(bats.map((b) => b.latest.metrics.soc_pct).sort()).toEqual([60, 90]);
    const cells = (await r('/cells')).data.data;
    expect(cells.filter((c) => c.installationId === y.id)).toHaveLength(3);
    const h = (await r('/history?metric=pv_power_w')).data.data;
    expect(h.series).toHaveLength(2);
  });

  it('caps the metric catalogue per site; extra names stay in the raw payload', async () => {
    const o4 = await signup(t.api, 'cap');
    const z = await provision(t.api, admin, o4.user.id);
    const ids: string[] = [];
    for (let batch = 0; batch < 5; batch++) {
      const metrics = Object.fromEntries(
        Array.from({ length: 450 }, (_, i) => [`junk_${batch}_${i}`, i]),
      );
      const m = reading({ measurements: metrics, batteries: [] });
      ids.push(m.messageId);
      await ingest(t.api, z.key, m);
    }
    for (const id of ids) await processed(prisma, id, 60_000);
    expect(
      await prisma.solarMetric.count({ where: { siteId: z.site.id } }),
    ).toBe(2000);
    const last = await prisma.solarIngest.findFirst({
      where: { messageId: ids[4] },
    });
    expect(last.error).toMatch(/metric catalogue full/);
    expect(
      Object.keys((last.payload as { measurements: object }).measurements),
    ).toHaveLength(450);
  });

  it('limits history to 31 days and uses the requested site only', async () => {
    const from = new Date(Date.now() - 40 * 86400e3).toISOString();
    expect((await get(`/history?metric=pv_power_w&from=${from}`)).status).toBe(
      400,
    );
    const ok = await until(
      () => get('/history?metric=pv_power_w'),
      (r) => r.status === 200,
    );
    expect(
      ok.data.data.series.every((s) => s.installationId === p.installation.id),
    ).toBe(true);
  });
});

describe('Redex production source', () => {
  it("integrates SolarBMS pv power into monthly kWh for the user's sites", async () => {
    const o5 = await signup(t.api, 'redex');
    const r = await provision(t.api, admin, o5.user.id);
    const year = new Date().getUTCFullYear() - 1; // a past year: never clamped as "future"
    const at = (d: number, h: number, m: number) =>
      new Date(Date.UTC(year, 2, d, h, m)).toISOString();
    const msgs = [
      reading({
        timestamp: at(10, 12, 0),
        measurements: { pvPower: 1000 },
        batteries: [],
      }),
      reading({
        timestamp: at(10, 12, 30),
        measurements: { pvPower: 3000 },
        batteries: [],
      }), // same hour → avg 2000 W → 2 kWh
      reading({
        timestamp: at(11, 9, 0),
        measurements: { pvPower: 500 },
        batteries: [],
      }), //  → 0.5 kWh
    ];
    for (const m of msgs) await ingest(t.api, r.key, m);
    for (const m of msgs) await processed(prisma, m.messageId);
    const kwh = await t.app
      .get(SolarEnergyService)
      .monthlyPvKwh(o5.user.id, year);
    expect(kwh.Mar).toBe(2.5);
    expect(kwh.Feb).toBe(0);
    expect(
      (await t.app.get(SolarEnergyService).monthlyPvKwh(owner.user.id, year))
        .Mar,
    ).toBe(0); // other user's sites not included
  });
});
