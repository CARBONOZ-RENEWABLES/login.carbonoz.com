import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { normalizeSolarBms } from './solarbms.normalizer';

const DOC = join(__dirname, '../../../../docs/solarbms-ingestion.md');
const FIXTURES = join(__dirname, 'fixtures');

/** The example message in docs/solarbms-ingestion.md is the published contract. */
function docExample(): Record<string, unknown> {
  const md = readFileSync(DOC, 'utf8');
  const block = md.match(/```json\n([\s\S]*?)\n```/);
  if (!block) throw new Error('No JSON example in docs/solarbms-ingestion.md');
  return JSON.parse(block[1]);
}

describe('SolarBMS contract (docs/solarbms-ingestion.md)', () => {
  const payload = docExample();
  const n = normalizeSolarBms(payload, new Date('2026-09-29T10:00:05Z'));
  const sample = (kind: string, id?: string) =>
    n.samples.find((s) => s.kind === kind && (!id || s.externalId === id));

  it('maps every section of the documented message', () => {
    expect(n.systemId).toBe('sbms-andreas-01');
    expect(sample('SYSTEM').metrics).toMatchObject({
      pv_power_w: 4200,
      load_power_w: 1300,
      grid_power_w: -800,
      battery_power_w: 2100,
      soc_pct: 67,
    });
    expect(sample('INVERTER', 'GW-123').metrics).toMatchObject({
      power_w: 4100,
      daily_yield_kwh: 12.4,
    });
    expect(sample('BATTERY', 'bat-1').metrics).toMatchObject({ soc_pct: 67 });
    const bms = sample('BMS', 'seplos-1');
    expect(bms.cells).toHaveLength(2);
    expect(bms.metrics.cell_voltage_spread_mv).toBe(14);
    expect(n.events.some((e) => e.isAlarm && e.code === 'cell_overvolt')).toBe(
      true,
    );
    expect(n.events.some((e) => !e.isAlarm && e.code === 'grid_restored')).toBe(
      true,
    );
    expect(n.forecast.points[0].pv_power_w).toBe(5200);
  });

  it('keeps metrics SolarBMS adds later, on every device level', () => {
    const p = JSON.parse(JSON.stringify(payload));
    p.measurements.newSiteMetric = 1;
    p.inverters[0].newInverterMetric = 2;
    p.batteries[0].temperatureMax = 31.5;
    p.batteries[0].bms.newBmsMetric = 3;
    p.batteries[0].bms.cells[0].cellResistance = 0.21;
    p.batteries[0].bms.cells[0].balancingCurrent = 0.05;
    const m = normalizeSolarBms(p);
    const get = (k: string) => m.samples.find((s) => s.kind === k);
    expect(get('SYSTEM').metrics.new_site_metric).toBe(1);
    expect(get('INVERTER').metrics.new_inverter_metric).toBe(2);
    expect(get('BATTERY').metrics.temperature_max).toBe(31.5);
    expect(get('BMS').metrics.new_bms_metric).toBe(3);
    expect(get('BMS').cells[0]).toMatchObject({
      id: '1',
      voltage: 3.311,
      cell_resistance: 0.21,
      balancing_current: 0.05,
    });
  });
});

describe('SolarBMS fixtures (real payloads)', () => {
  const files = readdirSync(FIXTURES).filter(
    (f) => f.endsWith('.json') && !f.endsWith('.expect.json'),
  );
  if (!files.length) {
    it.todo('add a real SolarBMS payload from Andreas to fixtures/');
    return;
  }
  it.each(files)('%s normalizes', (file) => {
    const raw = JSON.parse(readFileSync(join(FIXTURES, file), 'utf8'));
    const messages = Array.isArray(raw?.messages) ? raw.messages : [raw];
    for (const msg of messages) {
      const n = normalizeSolarBms(msg);
      expect(n.samples.length).toBeGreaterThan(0);
    }
    const expectFile = join(FIXTURES, file.replace(/\.json$/, '.expect.json'));
    let expected: Record<string, Record<string, unknown>> | null = null;
    try {
      expected = JSON.parse(readFileSync(expectFile, 'utf8'));
    } catch {
      return;
    }
    const n = normalizeSolarBms(messages[0]);
    for (const [device, metrics] of Object.entries(expected)) {
      const [kind, id] = device.split(':');
      const s = n.samples.find(
        (x) => x.kind === kind && (!id || x.externalId === id),
      );
      expect(s).toBeDefined();
      expect(s.metrics).toMatchObject(metrics);
    }
  });
});
