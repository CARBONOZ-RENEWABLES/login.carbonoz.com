/**
 * SYNTHETIC TEST DATA ONLY — shaped after the schema in Felix's ingest guide
 * (29 Sep 2026). No real Raspberry payload exists in the repository yet; add
 * one to fixtures/ when it arrives and extend these tests.
 */
import {
  parseDelivery,
  readingId,
  safeFields,
  toSolarBmsMessages,
} from './ingest-readings.adapter';
import { normalizeSolarBms } from './solarbms.normalizer';

const delivery = {
  site: 'test-site_01',
  readings: [
    {
      ts: '2026-09-29T08:15:00Z',
      metrics: {
        pv_w: 4200,
        load_w: 1300,
        grid_w: -800,
        battery_w: 2100,
        soc_pct: 67,
        wr1_pv_w: 2300,
        wr2_pv_w: 1900,
        wr1_temp_c: 41.5,
        brand_new_metric: 7,
      },
    },
    { ts: '2026-09-29T08:16:00Z', metrics: { pv_w: 4100 } },
  ],
};
const entry = (body: unknown, extra: Record<string, string> = {}) => ({
  payload: JSON.stringify(body),
  ...extra,
});

describe('ingest:readings delivery → SolarBMS messages', () => {
  it('finds the delivery JSON in common entry layouts', () => {
    for (const fields of [
      entry(delivery),
      { data: JSON.stringify(delivery) },
      { site: delivery.site, readings: JSON.stringify(delivery.readings) },
      { whatever: JSON.stringify(delivery), client_id: 'raspberry-solarblick' },
      { custom: JSON.stringify(delivery) },
    ]) {
      const d = parseDelivery(fields, fields === undefined ? '' : 'custom');
      expect('error' in d ? d.error : d.site).toBe('test-site_01');
    }
  });

  it('keeps non-secret entry fields as source info and never secret-looking ones', () => {
    const d = parseDelivery(
      entry(delivery, {
        client_id: 'raspberry-solarblick',
        received_at: '2026-09-29T08:16:02Z',
        authorization: 'Bearer x',
        token: 'y',
      }),
    );
    if ('error' in d) throw new Error(d.error);
    expect(d.meta).toEqual({
      client_id: 'raspberry-solarblick',
      received_at: '2026-09-29T08:16:02Z',
    });
    expect(
      safeFields({ a: '1', clientSecret: 's', Authorization: 't' }),
    ).toEqual({ a: '1' });
  });

  it.each([
    ['no JSON', { foo: 'bar' }, /no delivery JSON/],
    ['bad site', entry({ ...delivery, site: 'bad site!' }), /site/],
    ['no readings', entry({ site: 's', readings: [] }), /1 to 1000/],
    [
      'ts without Z',
      entry({
        site: 's',
        readings: [{ ts: '2026-09-29T08:15:00', metrics: { pv_w: 1 } }],
      }),
      /ISO 8601 UTC/,
    ],
    [
      'string metric',
      entry({
        site: 's',
        readings: [{ ts: '2026-09-29T08:15:00Z', metrics: { pv_w: '1' } }],
      }),
      /numeric/,
    ],
    [
      'too many metrics',
      entry({
        site: 's',
        readings: [
          {
            ts: '2026-09-29T08:15:00Z',
            metrics: Object.fromEntries(
              Array.from({ length: 1001 }, (_, i) => [`m${i}`, i]),
            ),
          },
        ],
      }),
      /1 to 1000/,
    ],
  ])('rejects %s with a reason (and no payload in it)', (_n, fields, re) => {
    const d = parseDelivery(fields as Record<string, string>);
    expect('error' in d && d.error).toMatch(re);
    expect('error' in d && d.error).not.toMatch(/4200/);
  });

  it('maps through the existing normalizer: aliases, inverters by prefix, unknown metrics kept, time kept', () => {
    const d = parseDelivery(entry(delivery));
    if ('error' in d) throw new Error(d.error);
    const msgs = toSolarBmsMessages('ingest:readings', '1727531234567-0', d);
    expect(msgs).toHaveLength(2);
    const n = normalizeSolarBms(msgs[0], new Date('2026-09-29T08:20:00Z'));
    expect(n.ts.toISOString()).toBe('2026-09-29T08:15:00.000Z');
    const sys = n.samples.find((s) => s.kind === 'SYSTEM');
    expect(sys?.metrics).toMatchObject({
      pv_power_w: 4200,
      load_power_w: 1300,
      grid_power_w: -800,
      battery_power_w: 2100,
      soc_pct: 67,
      brand_new_metric: 7,
    });
    // Signs are passed through untouched; their meaning is decided in one place (dashboard semantics).
    expect(sys?.metrics.grid_power_w).toBe(-800);
    const inv = n.samples
      .filter((s) => s.kind === 'INVERTER')
      .map((s) => [s.externalId, s.metrics]);
    expect(inv).toEqual([
      ['inverter-1', { pv_power_w: 2300, temp_c: 41.5 }],
      ['inverter-2', { pv_power_w: 1900 }],
    ]);
    expect(n.warnings.join()).not.toMatch(/UTC offset|receive time/);
    expect((msgs[0].source as Record<string, unknown>).entryId).toBe(
      '1727531234567-0',
    );
  });

  it('gives every reading a content id: same content → same id (any entry), different content → different id', () => {
    const r = delivery.readings[0];
    const a = toSolarBmsMessages('ingest:readings', '1-0', {
      site: 's',
      readings: [r],
      meta: {},
    })[0].messageId;
    const b = toSolarBmsMessages('ingest:readings', '2-0', {
      site: 's',
      readings: [{ ts: r.ts, metrics: { ...r.metrics } }],
      meta: {},
    })[0].messageId;
    expect(a).toBe(b);
    expect(readingId('s', { ts: r.ts, metrics: { pv_w: 1 } })).not.toBe(
      readingId('s', { ts: r.ts, metrics: { pv_w: 2 } }),
    );
    expect(String(a).length).toBeLessThanOrEqual(128);
  });

  it('handles any number of inverters', () => {
    const metrics = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`wr${i + 1}_pv_w`, 100 * (i + 1)]),
    );
    const [m] = toSolarBmsMessages('k', '1-0', {
      site: 's',
      readings: [{ ts: '2026-09-29T08:15:00Z', metrics }],
      meta: {},
    });
    expect((m.inverters as unknown[]).length).toBe(12);
  });

  it('keeps energy counters as counters: never turned into power, never used as pv/load/grid/battery', () => {
    const [m] = toSolarBmsMessages('k', '1-0', {
      site: 's',
      readings: [
        {
          ts: '2026-09-29T08:15:00Z',
          metrics: {
            pv_energy_today_kwh: 12.3,
            grid_import_total_wh: 450000,
            wr1_energy_kwh: 6.1,
          },
        },
      ],
      meta: {},
    });
    const n = normalizeSolarBms(m);
    const sys = n.samples.find((x) => x.kind === 'SYSTEM')?.metrics ?? {};
    expect(sys).toEqual({
      pv_energy_today_kwh: 12.3,
      grid_import_total_wh: 450000,
    });
    expect(Object.keys(sys).some((k) => k.endsWith('_power_w'))).toBe(false);
    expect(n.units).toMatchObject({
      pv_energy_today_kwh: 'kWh',
      grid_import_total_wh: 'Wh',
    });
    expect(n.samples.find((x) => x.kind === 'INVERTER')?.metrics).toEqual({
      energy_kwh: 6.1,
    });
  });
});

describe('safeFields (dead letters, source info) — SYNTHETIC', () => {
  const body = {
    site: 'pi-1',
    auth: { bearer: 'tok-1', nested: [{ client_secret: 's-1' }] },
    readings: [{ ts: '2026-09-29T08:00:00Z', metrics: { pv_w: 1, load_w: 2 } }],
    meta: { api_key: 'k-1', note: 'Bearer abc.def.ghi' },
  };
  const fields = {
    payload: JSON.stringify(body),
    authorization: 'Bearer top-level',
    client_id: 'raspberry-1',
    url: 'redis://user:pw-1@host:6379', // secret-scan:allow (fake value for a redaction test)
  };

  it('drops secret fields and redacts nested secrets in objects and arrays', () => {
    const out = safeFields(fields);
    const text = JSON.stringify(out);
    for (const secret of [
      'tok-1',
      's-1',
      'k-1',
      'top-level',
      'pw-1',
      'abc.def.ghi',
    ])
      expect(text).not.toContain(secret);
    expect(out.authorization).toBeUndefined();
    expect(out.client_id).toBe('raspberry-1');
  });

  it('keeps the readings intact so the dead letter can be replayed', () => {
    const many = {
      site: 'pi-1',
      readings: Array.from({ length: 300 }, (_, i) => ({
        ts: new Date(Date.UTC(2026, 8, 29, 0, i))
          .toISOString()
          .replace('.000', ''),
        metrics: { pv_w: i },
      })),
    };
    const out = safeFields({ payload: JSON.stringify(many) });
    const d = parseDelivery(out);
    expect('error' in d).toBe(false);
    expect((d as { readings: unknown[] }).readings).toHaveLength(300);
  });
});

describe('parseDelivery robustness — SYNTHETIC', () => {
  const inner = {
    site: 'pi-1',
    readings: [{ ts: '2026-09-29T08:00:00Z', metrics: { pv_w: 5 } }],
  };

  it('accepts JSON with leading whitespace', () => {
    const d = parseDelivery({ payload: `\n  ${JSON.stringify(inner)}` });
    expect('error' in d).toBe(false);
  });

  it('unwraps one wrapper object holding the delivery', () => {
    const d = parseDelivery({
      payload: JSON.stringify({ body: inner, received: 'x' }),
    });
    expect(d).toMatchObject({ site: 'pi-1' });
  });

  it('reports a safe reason (no payload content) for malformed entries', () => {
    const d = parseDelivery({
      payload:
        '{"site": "pi-1", "readings": [{"ts": "bad", "metrics": {"x": "secret-value"}}]}',
    });
    expect(d).toEqual({ error: expect.any(String) });
    expect(JSON.stringify(d)).not.toContain('secret-value');
  });
});

describe('hierarchical metric names (Raspberry sender, Oct 2026) — SYNTHETIC', () => {
  const ts = '2026-10-20T10:00:00Z';
  const run = (
    metrics: Record<string, number>,
    metadata?: Record<string, string>,
  ) => {
    const [msg] = toSolarBmsMessages('s', '1-0', {
      site: 'solarblick-main',
      readings: [{ ts, metrics, ...(metadata && { metadata }) }],
      meta: {},
    });
    return normalizeSolarBms(msg, new Date(ts));
  };
  const of = (n: ReturnType<typeof run>, kind: string, id?: string) =>
    n.samples.filter((s) => s.kind === kind && (!id || s.externalId === id));

  it('dotted names: totals, battery bank, packs with cells, inverters', () => {
    const n = run({
      'plant.pv_power_w': 5000,
      'plant.load_power_w': 800,
      'battery.soc_pct': 30,
      'battery.power_w': 2200,
      'battery.capacity_kwh': 90,
      'battery.pack.1.cell.1.voltage_v': 3.101,
      'battery.pack.1.cell.2.voltage_v': 3.071,
      'battery.pack.2.cell.1.voltage_v': 3.055,
      'inverter.1.load_power_w': 400,
      'inverter.1.mppt1_voltage_v': 380,
      'inverter.2.load_power_w': 400,
    });
    const sys = of(n, 'SYSTEM')[0].metrics;
    expect(sys).toMatchObject({
      pv_power_w: 5000,
      load_power_w: 800,
      soc_pct: 30,
      battery_power_w: 2200,
    });
    expect(Object.keys(sys).some((k) => k.includes('cell'))).toBe(false); // cells are not system values
    expect(of(n, 'BATTERY', 'battery-bank')[0].metrics).toMatchObject({
      soc_pct: 30,
      capacity_kwh: 90,
    });
    const bms1 = of(n, 'BMS', 'pack-1-bms')[0];
    expect(bms1.cells).toHaveLength(2);
    expect(bms1.metrics).toMatchObject({
      cell_count: 2,
      cell_voltage_min_v: 3.071,
      cell_voltage_max_v: 3.101,
    });
    expect(of(n, 'BMS', 'pack-2-bms')[0].cells).toHaveLength(1);
    // Packs that only report cells are BMS devices, not empty batteries.
    expect(of(n, 'BATTERY').map((s) => s.externalId)).toEqual(['battery-bank']);
    const names = Object.fromEntries(
      n.devices.map((d) => [d.externalId, d.name]),
    );
    expect(names).toMatchObject({
      'battery-bank': 'Battery bank',
      'pack-1-bms': 'BMS pack 1',
      'inverter-2': 'Inverter 2',
    });
    expect(of(n, 'INVERTER').map((s) => s.externalId)).toEqual([
      'inverter-1',
      'inverter-2',
    ]);
    expect(of(n, 'INVERTER', 'inverter-1')[0].metrics).toMatchObject({
      load_power_w: 400,
      mppt1_voltage_v: 380,
    });
  });

  it('without plant totals, solar and home are the sum of all inverters', () => {
    const n = run({
      'inverter.1.pv_power_w': 1000,
      'inverter.1.load_power_w': 300,
      'inverter.2.pv_power_w': 1500,
      'inverter.2.load_power_w': 200,
    });
    expect(of(n, 'SYSTEM')[0].metrics).toMatchObject({
      pv_power_w: 2500,
      load_power_w: 500,
    });
  });

  it('no sum when an inverter lacks the value (no half totals)', () => {
    const n = run({
      'inverter.1.pv_power_w': 1000,
      'inverter.2.load_power_w': 200,
    });
    expect(of(n, 'SYSTEM')[0]?.metrics.pv_power_w).toBeUndefined();
  });

  it('underscore names and the original short names still work', () => {
    const n = run({
      pv_w: 900,
      load_w: 400,
      wr1_pv_w: 450,
      battery_pack_3_cell_10_voltage_v: 3.2,
      bms2_cell4_mv: 3310, // millivolts
    });
    expect(of(n, 'SYSTEM')[0].metrics).toMatchObject({
      pv_power_w: 900,
      load_power_w: 400,
    });
    expect(of(n, 'INVERTER', 'inverter-1').length).toBe(1);
    expect(of(n, 'BMS', 'pack-3-bms')[0].cells?.[0]).toMatchObject({
      voltage: 3.2,
    });
    expect(of(n, 'BMS', 'pack-2-bms')[0].cells?.[0]).toMatchObject({
      voltage: 3.31,
    });
  });

  it('accepts text metadata (serial numbers) and more than 200 metrics', () => {
    const metrics: Record<string, number> = {};
    for (let i = 1; i <= 220; i++)
      metrics[`battery.pack.${1 + (i % 4)}.cell.${i}.voltage_v`] = 3.1;
    const d = parseDelivery({
      payload: JSON.stringify({
        site: 'pi-1',
        readings: [
          {
            ts,
            metrics,
            metadata: { 'inverter.1.serial_number': 'RKG8CGW07L' },
          },
        ],
      }),
    });
    expect('error' in d).toBe(false);
    const bad = parseDelivery({
      payload: JSON.stringify({
        site: 'pi-1',
        readings: [
          { ts, metrics: { pv_w: 1 }, metadata: { x: { nested: 1 } } },
        ],
      }),
    });
    expect(bad).toEqual({ error: expect.stringMatching(/metadata "x"/) });
  });
});
