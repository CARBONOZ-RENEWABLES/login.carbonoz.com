import {
  metricKey,
  normalizeSolarBms,
  parseCells,
  unitFor,
} from './solarbms.normalizer';

const full = {
  schemaVersion: '1',
  messageId: 'm-1',
  systemId: 'sbms-andreas-01',
  timestamp: '2026-09-29T10:00:00Z',
  measurements: {
    pvPower: 4200,
    loadPower: 1300,
    gridPower: -800,
    batteryPower: 2100,
    soc: 67,
  },
  inverters: [
    {
      id: 'GW-123',
      manufacturer: 'Growatt',
      model: 'SPH 6000',
      status: 'Normal',
      power: 4100,
      acFrequency: 50.01,
      dailyYieldKwh: 12.4,
    },
  ],
  batteries: [
    {
      id: 'bat-1',
      soc: 67,
      voltage: 53.1,
      current: 39.5,
      temperature: 24.2,
      bms: {
        id: 'seplos-1',
        manufacturer: 'Seplos',
        status: 'Charging',
        alarms: [
          {
            code: 'CELL_OVERVOLT',
            message: 'Cell over voltage',
            severity: 'warning',
          },
        ],
        temperatures: [23.9, 24.4, 25.0],
        cells: [
          { id: 1, voltage: 3.311, timestamp: '2026-09-29T09:59:58Z' },
          { id: 2, voltage: 3.325 },
          { id: 3, voltage: 3.298 },
        ],
      },
    },
  ],
  events: [
    {
      timestamp: '2026-09-29T09:58:00Z',
      level: 'info',
      code: 'GRID_RESTORED',
      message: 'Grid restored',
      deviceKind: 'inverter',
      deviceId: 'GW-123',
    },
  ],
  forecast: {
    source: 'solcast',
    generatedAt: '2026-09-29T06:00:00Z',
    points: [
      { ts: '2026-09-29T12:00:00Z', pvPowerW: 5200 },
      { ts: '2026-09-29T11:00:00Z', pvPowerW: 4800 },
    ],
  },
  newThingAndreasAddedLater: 42,
};

describe('normalizeSolarBms', () => {
  it('maps system, inverter, battery, BMS, cells, events and forecast', () => {
    const n = normalizeSolarBms(full);
    expect(n.systemId).toBe('sbms-andreas-01');
    expect(n.ts.toISOString()).toBe('2026-09-29T10:00:00.000Z');

    const sys = n.samples.find((s) => s.kind === 'SYSTEM');
    expect(sys.metrics).toMatchObject({
      pv_power_w: 4200,
      load_power_w: 1300,
      grid_power_w: -800,
      battery_power_w: 2100,
      soc_pct: 67,
    });
    // Unknown fields are kept as metrics, not dropped.
    expect(sys.metrics.new_thing_andreas_added_later).toBe(42);
    expect(sys.metrics.schema_version).toBeUndefined();

    const inv = n.samples.find((s) => s.kind === 'INVERTER');
    expect(inv.externalId).toBe('GW-123');
    expect(inv.status).toBe('Normal');
    expect(inv.metrics).toMatchObject({
      power_w: 4100,
      ac_frequency: 50.01,
      daily_yield_kwh: 12.4,
    });
    expect(n.devices.find((d) => d.kind === 'INVERTER')).toMatchObject({
      manufacturer: 'Growatt',
      model: 'SPH 6000',
    });

    const bat = n.samples.find((s) => s.kind === 'BATTERY');
    expect(bat.metrics).toMatchObject({
      soc_pct: 67,
      voltage_v: 53.1,
      current_a: 39.5,
      temperature_c: 24.2,
    });

    const bms = n.samples.find((s) => s.kind === 'BMS');
    expect(bms.externalId).toBe('seplos-1');
    expect(n.devices.find((d) => d.kind === 'BMS').parentExternalId).toBe(
      'bat-1',
    );
    expect(bms.status).toBe('Charging');
    expect(bms.cells).toHaveLength(3);
    expect(bms.cells[0]).toEqual({
      id: '1',
      voltage: 3.311,
      ts: '2026-09-29T09:59:58.000Z',
    });
    expect(bms.metrics).toMatchObject({
      cell_count: 3,
      cell_voltage_min_v: 3.298,
      cell_voltage_max_v: 3.325,
      cell_voltage_spread_mv: 27,
      cell_voltage_min_id: '3',
      cell_voltage_max_id: '2',
      temperatures_1: 23.9,
      temperatures_3: 25,
    });

    const alarm = n.events.find((e) => e.isAlarm);
    expect(alarm).toMatchObject({
      kind: 'BMS',
      externalId: 'seplos-1',
      severity: 'WARNING',
      code: 'cell_overvolt',
    });
    const ev = n.events.find((e) => !e.isAlarm);
    expect(ev).toMatchObject({
      kind: 'INVERTER',
      externalId: 'GW-123',
      severity: 'INFO',
      code: 'grid_restored',
    });

    expect(n.forecast.source).toBe('solcast');
    expect(n.forecast.points.map((p) => p.ts)).toEqual([
      '2026-09-29T11:00:00.000Z',
      '2026-09-29T12:00:00.000Z',
    ]);
    expect(n.forecast.points[0].pv_power_w).toBe(4800);
    expect(n.units.pv_power_w).toBe('W');
  });

  it('keeps BMS-reported min/max instead of overwriting them', () => {
    const n = normalizeSolarBms({
      bms: [{ id: 'jk', minCellVoltage: 3.1, cells: [3.2, 3.3] }],
    });
    const bms = n.samples.find((s) => s.kind === 'BMS');
    expect(bms.metrics.cell_voltage_min_v).toBe(3.1);
    expect(bms.metrics.cell_voltage_max_v).toBe(3.3);
  });

  it('tolerates id-keyed objects, millivolt cells and flag-style alarms', () => {
    const n = normalizeSolarBms({
      batteries: {
        packA: {
          soc: 50,
          cells: { c1: 3305, c2: 3310 },
          alarms: { overTemp: true, underVolt: false },
        },
      },
    });
    const bms = n.samples.find((s) => s.kind === 'BMS');
    expect(bms.externalId).toBe('packA-bms');
    expect(bms.cells.map((c) => c.voltage)).toEqual([3.305, 3.31]);
    expect(n.events.map((e) => e.code)).toEqual(['over_temp']);
  });

  it('handles missing data without throwing', () => {
    expect(() => normalizeSolarBms(null)).not.toThrow();
    const n = normalizeSolarBms({
      batteries: [{ id: 'b', bms: { id: 'x', cells: [] } }],
    });
    const bms = n.samples.find((s) => s.kind === 'BMS');
    expect(bms.cells).toBeUndefined();
    expect(bms.metrics.cell_count).toBeUndefined();
    expect(n.forecast).toBeUndefined();
    expect(n.warnings).toContain('no payload timestamp, using receive time');
  });

  it('accepts epoch seconds and milliseconds', () => {
    expect(normalizeSolarBms({ ts: 1790000000 }).ts.getTime()).toBe(
      1790000000000,
    );
    expect(normalizeSolarBms({ ts: 1790000000123 }).ts.getTime()).toBe(
      1790000000123,
    );
  });
});

describe('helpers', () => {
  it('produces Mongo-safe snake_case keys', () => {
    expect(metricKey('cellVoltage.Max')).toBe('cell_voltage_max');
    expect(metricKey('SOC%')).toBe('soc_pct');
    expect(metricKey('1stCell')).toBe('m_1st_cell');
  });
  it('infers units from suffixes', () => {
    expect(unitFor('battery_power_w')).toBe('W');
    expect(unitFor('cell_voltage_spread_mv')).toBe('mV');
    expect(unitFor('status')).toBeUndefined();
  });
  it('parses plain number cells', () => {
    expect(parseCells([3.3, 'x', 3.31])).toEqual([
      { id: '1', voltage: 3.3 },
      { id: '2', voltage: null },
      { id: '3', voltage: 3.31 },
    ]);
  });
});

describe('robustness', () => {
  it('gives every id-less BMS of one battery its own id', () => {
    const n = normalizeSolarBms({
      batteries: [{ id: 'b1', bms: [{ cells: [3.3] }, { cells: [3.31] }] }],
    });
    expect(
      n.samples.filter((s) => s.kind === 'BMS').map((s) => s.externalId),
    ).toEqual(['b1-bms', 'b1-bms-2']);
  });

  it('supports several batteries with different cell counts', () => {
    const n = normalizeSolarBms({
      batteries: [
        { id: 'a', bms: { id: 'jk', cells: Array(16).fill(3.3) } },
        { id: 'b', bms: { id: 'seplos', cells: Array(8).fill(3.31) } },
        { id: 'c' },
      ],
    });
    const bms = n.samples.filter((s) => s.kind === 'BMS');
    expect(bms.map((s) => s.cells.length)).toEqual([16, 8]);
    expect(n.samples.filter((s) => s.kind === 'BATTERY')).toHaveLength(3);
  });

  it('replaces timestamps far in the future with the receive time', () => {
    const received = new Date('2026-09-29T10:00:00Z');
    const n = normalizeSolarBms(
      { timestamp: '2099-01-01T00:00:00Z', measurements: { pvPower: 1 } },
      received,
    );
    expect(n.ts).toEqual(received);
    expect(n.samples[0].ts).toEqual(received);
    expect(n.warnings.join()).toMatch(/ahead of the receive time/);
  });

  it('caps oversized text and ignores hostile keys', () => {
    const n = normalizeSolarBms(
      JSON.parse(
        '{"measurements":{"__proto__":{"x":1},"status_text":"' +
          'a'.repeat(5000) +
          '","$where":5,"a.b":6}}',
      ),
    );
    const m = n.samples[0].metrics;
    expect((m.status_text as string).length).toBe(500);
    expect(Object.keys(m).every((k) => /^[a-z0-9_]+$/.test(k))).toBe(true);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it('never throws on arbitrary shapes', () => {
    for (const p of [
      [],
      'x',
      1,
      { batteries: 'x' },
      { batteries: [null, 1, 'a'] },
      { bms: { cells: 'x' } },
      { forecast: [{}] },
      { events: [1] },
    ]) {
      expect(() => normalizeSolarBms(p)).not.toThrow();
    }
  });
});

import { toMongoSafe } from './mongo-safe';

describe('toMongoSafe', () => {
  it('rewrites field names MongoDB cannot store and reports it', () => {
    const r = toMongoSafe(
      JSON.parse('{"a\\u0000b":1,"$where":2,"x.y":3,"":4,"ok":{"$gt":5}}'),
    );
    expect(r.changed).toBe(true);
    const keys = Object.keys(r.value as object);
    expect(keys.some((k) => k.includes('\u0000'))).toBe(false);
    expect(keys.some((k) => k.startsWith('$'))).toBe(false);
    expect(keys.some((k) => k.includes('.'))).toBe(false);
    expect((r.value as Record<string, unknown>)['(empty)']).toBe(4);
    expect(Object.keys((r.value as { ok: object }).ok)[0].startsWith('$')).toBe(
      false,
    );
  });
  it('leaves normal payloads untouched', () => {
    const p = { measurements: { pvPower: 1 }, cells: [3.3, { id: 1 }] };
    const r = toMongoSafe(p);
    expect(r.changed).toBe(false);
    expect(r.value).toEqual(p);
  });
  it('flattens nesting deeper than MongoDB allows into text', () => {
    let deep: Record<string, unknown> = { v: 1 };
    for (let i = 0; i < 150; i++) deep = { n: deep };
    const r = toMongoSafe(deep);
    expect(r.changed).toBe(true);
    let d = 0;
    let cur: unknown = r.value;
    while (cur && typeof cur === 'object') {
      cur = (cur as { n: unknown }).n;
      d++;
    }
    expect(d).toBeLessThanOrEqual(90);
    expect(typeof cur).toBe('string');
  });
});
