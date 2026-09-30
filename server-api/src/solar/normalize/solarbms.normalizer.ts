/**
 * SolarBMS payload → Carbonoz normalized model.
 *
 * Pure and tolerant: the SolarBMS API is still evolving, so this accepts the
 * documented envelope (docs/solarbms-ingestion.md) plus common variations
 * (camelCase/snake_case, arrays or id-keyed objects, cells as numbers or
 * objects). Any scalar field it doesn't know becomes a metric under a
 * snake_case key, so new SolarBMS values are stored without code changes.
 * The raw payload is stored separately and never modified.
 */

export type DeviceKind = 'SYSTEM' | 'INVERTER' | 'BATTERY' | 'BMS';
export type MetricValue = number | string | boolean;
export type Severity = 'INFO' | 'WARNING' | 'ALARM' | 'CRITICAL';

export interface NormalizedDevice {
  kind: DeviceKind;
  externalId: string;
  parentExternalId?: string;
  name?: string;
  manufacturer?: string;
  model?: string;
  attributes?: Record<string, MetricValue>;
}

export interface NormalizedCell {
  id: string;
  voltage: number | null;
  temperature?: number;
  balancing?: boolean;
  ts?: string;
  /** Any other per-cell value the BMS reports (cell_resistance, balancing_current…). */
  [extra: string]: MetricValue | null | undefined;
}

export interface NormalizedSample {
  kind: DeviceKind;
  externalId: string;
  ts: Date;
  metrics: Record<string, MetricValue>;
  cells?: NormalizedCell[];
  status?: string;
}

export interface NormalizedEvent {
  kind?: DeviceKind;
  externalId?: string;
  ts: Date;
  severity: Severity;
  code?: string;
  message: string;
  /** Alarms are state (active while reported); events are one-off. */
  isAlarm: boolean;
  raw?: unknown;
}

export interface NormalizedForecast {
  generatedAt: Date;
  source?: string;
  points: Array<Record<string, MetricValue> & { ts: string }>;
}

export interface NormalizedBatch {
  systemId?: string;
  ts: Date;
  devices: NormalizedDevice[];
  samples: NormalizedSample[];
  events: NormalizedEvent[];
  forecast?: NormalizedForecast;
  units: Record<string, string>;
  warnings: string[];
}

type Obj = Record<string, unknown>;

const MAX_METRICS_PER_DEVICE = 500;
const MAX_DEPTH = 3;
/** Ids, names and text metrics are cut to this length (the raw payload keeps the full value). */
const MAX_TEXT = 500;
/** Readings stamped further ahead of the receive time are treated as clock errors. */
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

const isObj = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isScalar = (v: unknown): v is MetricValue =>
  (typeof v === 'number' && Number.isFinite(v)) ||
  typeof v === 'string' ||
  typeof v === 'boolean';

/** camelCase / kebab / spaces → snake_case, safe as a MongoDB field name. */
export function metricKey(raw: string): string {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
    .replace(/%/g, '_pct')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 'm_$1');
}

/** Common SolarBMS / inverter spellings → one canonical key with a unit suffix. */
const ALIASES: Record<string, string> = {
  soc: 'soc_pct',
  state_of_charge: 'soc_pct',
  battery_soc: 'soc_pct',
  soh: 'soh_pct',
  state_of_health: 'soh_pct',
  voltage: 'voltage_v',
  pack_voltage: 'voltage_v',
  total_voltage: 'voltage_v',
  battery_voltage: 'battery_voltage_v',
  current: 'current_a',
  pack_current: 'current_a',
  battery_current: 'battery_current_a',
  power: 'power_w',
  temperature: 'temperature_c',
  temp: 'temperature_c',
  battery_temperature: 'battery_temperature_c',
  pv_power: 'pv_power_w',
  pv: 'pv_power_w',
  solar_power: 'pv_power_w',
  load: 'load_power_w',
  load_power: 'load_power_w',
  consumption: 'load_power_w',
  consumption_power: 'load_power_w',
  grid: 'grid_power_w',
  grid_power: 'grid_power_w',
  battery_power: 'battery_power_w',
  inverter_power: 'inverter_power_w',
  output_power: 'output_power_w',
  frequency: 'frequency_hz',
  grid_frequency: 'grid_frequency_hz',
  cycles: 'cycle_count',
  cycle_count: 'cycle_count',
  remaining_capacity: 'remaining_capacity_ah',
  full_capacity: 'full_capacity_ah',
  min_cell_voltage: 'cell_voltage_min_v',
  cell_min_voltage: 'cell_voltage_min_v',
  max_cell_voltage: 'cell_voltage_max_v',
  cell_max_voltage: 'cell_voltage_max_v',
  cell_voltage_diff: 'cell_voltage_spread_mv',
  cell_voltage_delta: 'cell_voltage_spread_mv',
  cell_diff: 'cell_voltage_spread_mv',
};

const UNIT_SUFFIXES: Array<[RegExp, string]> = [
  [/_kwh$/, 'kWh'],
  [/_wh$/, 'Wh'],
  [/_kw$/, 'kW'],
  [/_w$/, 'W'],
  [/_mv$/, 'mV'],
  [/_v$/, 'V'],
  [/_ma$/, 'mA'],
  [/_ah$/, 'Ah'],
  [/_a$/, 'A'],
  [/_c$/, '°C'],
  [/_pct$/, '%'],
  [/_hz$/, 'Hz'],
  [/_s$/, 's'],
];

export function unitFor(key: string): string | undefined {
  return UNIT_SUFFIXES.find(([re]) => re.test(key))?.[1];
}

const canonical = (raw: string) => {
  const k = metricKey(raw);
  return ALIASES[k] ?? k;
};

/** Fields that describe a device rather than measure it. */
const IDENTITY_KEYS = new Set([
  'id',
  'device_id',
  'serial',
  'serial_number',
  'sn',
  'name',
  'label',
  'manufacturer',
  'brand',
  'vendor',
  'model',
  'type',
  'firmware',
  'firmware_version',
  'bms_id',
  'battery_id',
  'inverter_id',
  'system_id',
  'address',
]);
/** Fields handled structurally, not flattened into metrics. */
const STRUCTURAL_KEYS = new Set([
  'cells',
  'cell_voltages',
  'cell',
  'bms',
  'bms_list',
  'alarms',
  'warnings',
  'errors',
  'faults',
  'events',
  'timestamp',
  'ts',
  'time',
  'datetime',
  'updated_at',
  'metrics',
  'measurements',
  'values',
  'data',
  'status',
  'state',
  'batteries',
  'inverters',
]);

/** ISO date-time without `Z` or `±hh:mm`: JavaScript would read it in the server's zone. */
const NO_OFFSET = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
/** Offset-less timestamps seen by the current normalizeSolarBms() call (it is synchronous). */
let offsetless = 0;

export function parseTime(v: unknown): Date | undefined {
  if (v == null || v === '') return undefined;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v;
  if (typeof v === 'number') {
    // Seconds vs milliseconds since epoch.
    const d = new Date(v < 1e11 ? v * 1000 : v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof v === 'string') {
    if (/^\d+(\.\d+)?$/.test(v)) return parseTime(Number(v));
    // No offset: read as UTC, whatever zone the server runs in (to confirm with SolarBMS).
    const noOffset = NO_OFFSET.test(v.trim());
    if (noOffset) offsetless++;
    const d = new Date(noOffset ? `${v.trim().replace(' ', 'T')}Z` : v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

const pick = (o: Obj, ...keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  // Case/style-insensitive fallback.
  const wanted = new Set(keys.map(metricKey));
  for (const [k, v] of Object.entries(o))
    if (wanted.has(metricKey(k)) && v != null) return v;
  return undefined;
};

const str = (v: unknown): string | undefined =>
  v == null || v === ''
    ? undefined
    : isScalar(v)
    ? String(v).slice(0, MAX_TEXT)
    : undefined;

const timeOf = (o: Obj) =>
  parseTime(pick(o, 'timestamp', 'ts', 'time', 'datetime', 'updatedAt'));

/** Arrays, or objects keyed by device id, → list of objects with an id. */
function asList(v: unknown): Obj[] {
  if (Array.isArray(v)) return v.filter(isObj);
  if (isObj(v)) {
    const values = Object.values(v);
    if (values.length && values.every(isObj)) {
      return Object.entries(v).map(([id, o]) => ({ id, ...(o as Obj) }));
    }
    return [v];
  }
  return [];
}

/** Flattens measurement fields into metrics; nested objects become prefix_key. */
function collectMetrics(
  o: Obj,
  out: Record<string, MetricValue>,
  warnings: string[],
  where: string,
  prefix = '',
  depth = 0,
) {
  for (const [rawKey, v] of Object.entries(o)) {
    const k = metricKey(rawKey);
    if (!prefix && (IDENTITY_KEYS.has(k) || STRUCTURAL_KEYS.has(k))) continue;
    const key = prefix ? `${prefix}_${k}` : canonical(rawKey);
    if (Object.keys(out).length >= MAX_METRICS_PER_DEVICE) {
      warnings.push(
        `${where}: metric limit reached, rest kept in raw payload only`,
      );
      return;
    }
    if (isScalar(v)) {
      if (!(key in out))
        out[key] = typeof v === 'string' ? v.slice(0, MAX_TEXT) : v;
    } else if (
      Array.isArray(v) &&
      v.length &&
      v.every((x) => typeof x === 'number')
    ) {
      // e.g. temperatures: [24.1, 25.3] → temperatures_1, temperatures_2
      v.forEach((x, i) => {
        if (Number.isFinite(x)) out[`${key}_${i + 1}`] = x as number;
      });
    } else if (isObj(v) && depth < MAX_DEPTH) {
      collectMetrics(v, out, warnings, where, key, depth + 1);
    }
    // Arrays of objects are left to the raw payload.
  }
}

function deviceMetrics(
  o: Obj,
  warnings: string[],
  where: string,
): Record<string, MetricValue> {
  const out: Record<string, MetricValue> = {};
  // Explicit metric containers first, then fields on the device itself.
  for (const c of ['metrics', 'measurements', 'values', 'data']) {
    const inner = pick(o, c);
    if (isObj(inner)) collectMetrics(inner, out, warnings, where);
  }
  collectMetrics(o, out, warnings, where);
  return out;
}

function statusOf(o: Obj): string | undefined {
  const s = pick(o, 'status', 'state');
  if (isScalar(s)) return String(s);
  if (isObj(s)) return str(pick(s, 'text', 'name', 'code', 'value'));
  return undefined;
}

/** Cell voltages: > 100 is taken as millivolts. */
const volts = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return n > 100 ? n / 1000 : n;
};

const CELL_KNOWN = new Set([
  'id',
  'cell',
  'cell_id',
  'index',
  'number',
  'no',
  'voltage',
  'voltage_mv',
  'mv',
  'v',
  'value',
  'temperature',
  'temp',
  'balancing',
  'balance',
  'is_balancing',
  'timestamp',
  'ts',
  'time',
]);

export function parseCells(v: unknown): NormalizedCell[] {
  let list: unknown[] = [];
  if (Array.isArray(v)) list = v;
  else if (isObj(v))
    list = Object.entries(v).map(([id, x]) =>
      isObj(x) ? { id, ...x } : { id, voltage: x },
    );
  return list
    .map((c, i): NormalizedCell | null => {
      if (typeof c === 'number' || typeof c === 'string') {
        return { id: String(i + 1), voltage: volts(c) };
      }
      if (!isObj(c)) return null;
      const id =
        str(pick(c, 'id', 'cell', 'cellId', 'index', 'number', 'no')) ??
        String(i + 1);
      const mv = pick(c, 'voltage_mv', 'voltageMv', 'mv');
      const voltage =
        mv != null
          ? volts(Number(mv) > 100 ? mv : Number(mv) * 1000)
          : volts(pick(c, 'voltage', 'v', 'value'));
      const temp = pick(c, 'temperature', 'temp');
      const bal = pick(c, 'balancing', 'balance', 'isBalancing');
      const ts = parseTime(pick(c, 'timestamp', 'ts', 'time'));
      // Every other scalar is kept too, so new per-cell values need no code change.
      const extra: Record<string, MetricValue> = {};
      for (const [k, x] of Object.entries(c)) {
        const key = metricKey(k);
        if (CELL_KNOWN.has(key) || !isScalar(x) || key in extra) continue;
        extra[key] = typeof x === 'string' ? x.slice(0, MAX_TEXT) : x;
      }
      return {
        ...extra,
        id,
        voltage,
        ...(typeof temp === 'number' && { temperature: temp }),
        ...(typeof bal === 'boolean' && { balancing: bal }),
        ...(ts && { ts: ts.toISOString() }),
      };
    })
    .filter((c): c is NormalizedCell => !!c);
}

/** min / max / spread / avg — only where the payload didn't report them itself. */
export function cellStats(
  cells: NormalizedCell[],
  metrics: Record<string, MetricValue>,
) {
  const valid = cells.filter((c) => typeof c.voltage === 'number') as Array<
    NormalizedCell & { voltage: number }
  >;
  if (!valid.length) return;
  let min = valid[0];
  let max = valid[0];
  let sum = 0;
  for (const c of valid) {
    if (c.voltage < min.voltage) min = c;
    if (c.voltage > max.voltage) max = c;
    sum += c.voltage;
  }
  const set = (k: string, v: MetricValue) => {
    if (!(k in metrics)) metrics[k] = v;
  };
  set('cell_count', cells.length);
  set('cell_voltage_min_v', round(min.voltage, 4));
  set('cell_voltage_max_v', round(max.voltage, 4));
  set('cell_voltage_avg_v', round(sum / valid.length, 4));
  set('cell_voltage_spread_mv', round((max.voltage - min.voltage) * 1000, 1));
  set('cell_voltage_min_id', min.id);
  set('cell_voltage_max_id', max.id);
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

function severityOf(v: unknown, fallback: Severity): Severity {
  const s = String(v ?? '').toUpperCase();
  if (/CRIT|FATAL|EMERG/.test(s)) return 'CRITICAL';
  if (/ALARM|ERR|FAULT|PROTECT/.test(s)) return 'ALARM';
  if (/WARN/.test(s)) return 'WARNING';
  if (/INFO|NOTICE|DEBUG/.test(s)) return 'INFO';
  return fallback;
}

function parseAlarms(
  o: Obj,
  kind: DeviceKind,
  externalId: string,
  ts: Date,
): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  const groups: Array<[unknown, Severity]> = [
    [pick(o, 'alarms', 'errors', 'faults'), 'ALARM'],
    [pick(o, 'warnings'), 'WARNING'],
  ];
  for (const [value, fallback] of groups) {
    const items: unknown[] = Array.isArray(value)
      ? value
      : isObj(value)
      ? // { overVoltage: true, underTemp: false } → only the true flags
        Object.entries(value)
          .filter(([, on]) => on === true || on === 1)
          .map(([k]) => k)
      : typeof value === 'string' && value
      ? [value]
      : [];
    for (const a of items) {
      if (isScalar(a)) {
        out.push({
          kind,
          externalId,
          ts,
          severity: fallback,
          code: metricKey(String(a)),
          message: String(a),
          isAlarm: true,
        });
      } else if (isObj(a)) {
        const code = str(pick(a, 'code', 'id', 'type', 'name'));
        const message =
          str(pick(a, 'message', 'text', 'description', 'name')) ??
          code ??
          'Alarm';
        const active = pick(a, 'active');
        if (active === false) continue;
        out.push({
          kind,
          externalId,
          ts: timeOf(a) ?? ts,
          severity: severityOf(pick(a, 'severity', 'level'), fallback),
          code: code ? metricKey(code) : metricKey(message),
          message,
          isAlarm: true,
          raw: a,
        });
      }
    }
  }
  return out;
}

export function normalizeSolarBms(
  payload: unknown,
  receivedAt: Date = new Date(),
): NormalizedBatch {
  const warnings: string[] = [];
  offsetless = 0;
  const devices = new Map<string, NormalizedDevice>();
  const samples: NormalizedSample[] = [];
  const events: NormalizedEvent[] = [];
  const units: Record<string, string> = {};

  if (!isObj(payload)) {
    return {
      ts: receivedAt,
      devices: [],
      samples: [],
      events: [],
      units,
      warnings: ['payload is not an object'],
    };
  }
  const p = payload;
  const ts = timeOf(p) ?? receivedAt;
  if (!timeOf(p)) warnings.push('no payload timestamp, using receive time');
  const systemId =
    str(pick(p, 'systemId', 'system_id', 'deviceId', 'serial')) ?? undefined;

  const addDevice = (d: NormalizedDevice) => {
    const k = `${d.kind}:${d.externalId}`;
    devices.set(k, { ...devices.get(k), ...d });
  };
  const addSample = (s: NormalizedSample) => {
    for (const k of Object.keys(s.metrics)) {
      const u = unitFor(k);
      if (u) units[k] = u;
    }
    samples.push(s);
  };
  const identity = (
    o: Obj,
    kind: DeviceKind,
    fallbackId: string,
    parent?: string,
  ): NormalizedDevice => ({
    kind,
    externalId:
      str(
        pick(
          o,
          'id',
          `${kind.toLowerCase()}Id`,
          `${kind.toLowerCase()}_id`,
          'serial',
          'serialNumber',
          'sn',
        ),
      ) ?? fallbackId,
    ...(parent && { parentExternalId: parent }),
    name: str(pick(o, 'name', 'label')),
    manufacturer: str(pick(o, 'manufacturer', 'brand', 'vendor')),
    model: str(pick(o, 'model', 'type')),
    ...(str(pick(o, 'firmware', 'firmwareVersion')) && {
      attributes: { firmware: str(pick(o, 'firmware', 'firmwareVersion')) },
    }),
  });

  // ── System level: site totals (PV, load, grid, battery…) ──────────────
  const systemMetrics: Record<string, MetricValue> = {};
  for (const c of [
    'measurements',
    'metrics',
    'system',
    'power',
    'totals',
    'summary',
  ]) {
    const v = pick(p, c);
    if (isObj(v)) collectMetrics(v, systemMetrics, warnings, `system.${c}`);
  }
  // `energy: { pv: 12.3 }` holds energy (counters of unconfirmed meaning), not
  // power: kept as energy_pv…, never aliased to pv_power_w and so never
  // integrated by energy history.
  const energy = pick(p, 'energy');
  if (isObj(energy))
    collectMetrics(energy, systemMetrics, warnings, 'system.energy', 'energy');
  // Top-level scalars (not structure) are system metrics too.
  collectMetrics(
    Object.fromEntries(
      Object.entries(p).filter(
        ([, v]) =>
          isScalar(v) ||
          (Array.isArray(v) && v.every((x) => typeof x === 'number')),
      ),
    ),
    systemMetrics,
    warnings,
    'system',
  );
  delete systemMetrics.schema_version;
  delete systemMetrics.message_id;
  const systemExternalId = systemId ?? 'system';
  addDevice({
    kind: 'SYSTEM',
    externalId: systemExternalId,
    name: str(pick(p, 'name', 'siteName')),
  });
  if (Object.keys(systemMetrics).length) {
    addSample({
      kind: 'SYSTEM',
      externalId: systemExternalId,
      ts,
      metrics: systemMetrics,
      status: statusOf(p),
    });
  }
  // Alarms reported for the whole system (top-level `alarms`, `warnings`…).
  events.push(...parseAlarms(p, 'SYSTEM', systemExternalId, ts));

  // ── Inverters ─────────────────────────────────────────────────────────
  asList(pick(p, 'inverters', 'inverter')).forEach((o, i) => {
    const d = identity(o, 'INVERTER', `inverter-${i + 1}`);
    addDevice(d);
    addSample({
      kind: 'INVERTER',
      externalId: d.externalId,
      ts: timeOf(o) ?? ts,
      metrics: deviceMetrics(o, warnings, `inverter ${d.externalId}`),
      status: statusOf(o),
    });
    events.push(...parseAlarms(o, 'INVERTER', d.externalId, timeOf(o) ?? ts));
  });

  // ── BMS (nested in a battery or top level) ────────────────────────────
  const handleBms = (o: Obj, i: number, batteryId?: string, nth = 0) => {
    const parent = batteryId ?? str(pick(o, 'batteryId', 'battery_id'));
    const suffix = nth > 0 ? `-${nth + 1}` : '';
    const d = identity(
      o,
      'BMS',
      parent ? `${parent}-bms${suffix}` : `bms-${i + 1}`,
      parent,
    );
    addDevice(d);
    const sts = timeOf(o) ?? ts;
    const metrics = deviceMetrics(o, warnings, `bms ${d.externalId}`);
    const cells = parseCells(pick(o, 'cells', 'cellVoltages', 'cell_voltages'));
    cellStats(cells, metrics);
    addSample({
      kind: 'BMS',
      externalId: d.externalId,
      ts: sts,
      metrics,
      ...(cells.length && { cells }),
      status: statusOf(o),
    });
    events.push(...parseAlarms(o, 'BMS', d.externalId, sts));
  };

  // ── Batteries ─────────────────────────────────────────────────────────
  let bmsIndex = 0;
  asList(pick(p, 'batteries', 'battery')).forEach((o, i) => {
    const d = identity(o, 'BATTERY', `battery-${i + 1}`);
    addDevice(d);
    const sts = timeOf(o) ?? ts;
    const metrics = deviceMetrics(o, warnings, `battery ${d.externalId}`);
    // Cells reported directly on the battery (no separate BMS object).
    const directCells = parseCells(
      pick(o, 'cells', 'cellVoltages', 'cell_voltages'),
    );
    const bmsList = asList(pick(o, 'bms', 'bmsList'));
    if (directCells.length && !bmsList.length) {
      bmsList.push({
        id: str(pick(o, 'bmsId', 'bms_id')) ?? `${d.externalId}-bms`,
        cells: pick(o, 'cells', 'cellVoltages', 'cell_voltages'),
      });
    }
    addSample({
      kind: 'BATTERY',
      externalId: d.externalId,
      ts: sts,
      metrics,
      status: statusOf(o),
    });
    events.push(...parseAlarms(o, 'BATTERY', d.externalId, sts));
    bmsList.forEach((b, nth) => handleBms(b, bmsIndex++, d.externalId, nth));
  });
  asList(pick(p, 'bms', 'bmsList')).forEach((b) => handleBms(b, bmsIndex++));

  // ── One-off events ────────────────────────────────────────────────────
  for (const e of asList(pick(p, 'events', 'log'))) {
    const kindRaw = String(
      pick(e, 'deviceKind', 'deviceType', 'source') ?? '',
    ).toUpperCase();
    const kind = (
      ['INVERTER', 'BATTERY', 'BMS', 'SYSTEM'] as DeviceKind[]
    ).find((k) => kindRaw.includes(k));
    const code = str(pick(e, 'code', 'type', 'id'));
    events.push({
      kind,
      externalId: str(
        pick(e, 'deviceId', 'device', 'bmsId', 'batteryId', 'inverterId'),
      ),
      ts: timeOf(e) ?? ts,
      severity: severityOf(pick(e, 'severity', 'level'), 'INFO'),
      code: code ? metricKey(code) : undefined,
      message:
        str(pick(e, 'message', 'text', 'description')) ?? code ?? 'Event',
      isAlarm: false,
      raw: e,
    });
  }

  // ── Forecast ──────────────────────────────────────────────────────────
  const f = pick(p, 'forecast', 'solarForecast', 'pvForecast');
  if (f != null) {
    const container = isObj(f) ? f : {};
    const rawPoints = Array.isArray(f)
      ? f
      : asList(
          pick(container, 'points', 'values', 'hours', 'data', 'forecast'),
        );
    const points = rawPoints
      .filter(isObj)
      .map((pt) => {
        const t =
          timeOf(pt) ?? parseTime(pick(pt, 'period_end', 'periodEnd', 'start'));
        if (!t) return null;
        const m: Record<string, MetricValue> = {};
        collectMetrics(pt, m, warnings, 'forecast');
        for (const k of Object.keys(m))
          if (/^period_(end|start)$/.test(k) || k === 'start') delete m[k];
        for (const k of Object.keys(m)) {
          const u = unitFor(k);
          if (u) units[k] = u;
        }
        return { ts: t.toISOString(), ...m };
      })
      .filter(Boolean) as NormalizedForecast['points'];
    if (points.length) {
      points.sort((a, b) => a.ts.localeCompare(b.ts));
      const generatedAt =
        parseTime(
          pick(
            container,
            'generatedAt',
            'generated_at',
            'created',
            'timestamp',
          ),
        ) ?? ts;
      return finish({
        generatedAt,
        source: str(pick(container, 'source', 'provider')),
        points,
      });
    }
    warnings.push('forecast present but had no timestamped points');
  }
  return finish(undefined);

  function finish(forecast?: NormalizedForecast): NormalizedBatch {
    // A Pi with a wrong clock must not pin the live view to a "future" reading.
    const limit = receivedAt.getTime() + MAX_CLOCK_SKEW_MS;
    let skewed = false;
    for (const x of [...samples, ...events]) {
      if (x.ts.getTime() > limit) {
        x.ts = receivedAt;
        skewed = true;
      }
    }
    if (skewed)
      warnings.push('timestamps ahead of the receive time were replaced by it');
    if (offsetless)
      warnings.push('timestamps with no UTC offset were read as UTC');
    return {
      systemId,
      ts: ts.getTime() > limit ? receivedAt : ts,
      devices: [...devices.values()],
      samples,
      events,
      forecast,
      units,
      warnings,
    };
  }
}
