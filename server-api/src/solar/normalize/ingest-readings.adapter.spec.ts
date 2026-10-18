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
              Array.from({ length: 201 }, (_, i) => [`m${i}`, i]),
            ),
          },
        ],
      }),
      /1 to 200/,
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
      ['wr1', { pv_power_w: 2300, temp_c: 41.5 }],
      ['wr2', { pv_power_w: 1900 }],
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
