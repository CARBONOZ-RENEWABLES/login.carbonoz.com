/**
 * Felix's ingest API (api.carbonoz.com → Redis `ingest:readings`) → the
 * SolarBMS message shape the existing worker and normalizer already handle.
 *
 * Delivery schema (ingest guide, 29 Sep 2026): `{ site, readings: [{ ts,
 * metrics: { name: number } }] }`, 1–1000 readings, ts ISO 8601 UTC with Z,
 * up to MAX_METRICS numeric metrics per reading (+ optional text `metadata`,
 * e.g. serial numbers). This adapter only reshapes; what a
 * metric MEANS (aliases, units, signs) stays in solarbms.normalizer.ts and
 * the dashboard's semantics.ts.
 *
 * How the API lays a delivery out in the stream entry is not documented yet:
 * the JSON is looked for in `payloadField` (config), then in common field
 * names, then in any field holding a JSON object with `readings`; a flat
 * entry (`site` + `readings` as fields) works too.
 */
import { createHash } from 'crypto';
import {
  isSensitiveKey,
  redact,
  redactText,
} from 'src/__shared__/utils/redact';

export interface IngestReading {
  ts: string;
  metrics: Record<string, number>;
  /** Optional non-numeric values (serial numbers, firmware), routed like metrics. */
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Upper bound per reading. Felix's API currently accepts 200; this side
 * allows more so raising his limit never makes our bridge quarantine data.
 */
export const MAX_METRICS = 1000;
const MAX_METADATA = 200;

export interface IngestDelivery {
  site: string;
  readings: IngestReading[];
  /** Non-secret entry fields (client id, receive time…), kept as source information. */
  meta: Record<string, string>;
}

const SITE = /^[A-Za-z0-9._-]{1,64}$/;
const METRIC = /^[A-Za-z0-9._-]{1,64}$/;
const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/;
const PAYLOAD_FIELDS = ['payload', 'data', 'body', 'json', 'batch', 'delivery'];
/** Entry fields never copied anywhere (defence in depth; the API should not store them). */
const SECRET_FIELD = /token|secret|auth|password|bearer|cookie/i;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function parseJson(raw: string | undefined): unknown {
  const s = raw?.trimStart();
  if (!s || (s[0] !== '{' && s[0] !== '[')) return undefined;
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

// Redaction without size limits: a dead letter must stay replayable in full.
const KEEP_ALL = { maxDepth: 64, maxArray: 1_000_000, maxString: 10_000_000 };

/**
 * Entry fields safe to store (dead letters, source info): secret-looking
 * fields dropped, and inside JSON values credential fields are redacted at
 * any depth (objects and arrays); credential-shaped text (bearer tokens,
 * JWTs, URLs with a password) is masked in plain values. Readings and
 * metrics are kept unchanged so the entry can be replayed.
 */
export function safeFields(fields: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (SECRET_FIELD.test(k) || isSensitiveKey(k)) continue;
    const j = parseJson(v);
    out[k] =
      j === undefined
        ? redactText(v, KEEP_ALL.maxString)
        : JSON.stringify(redact(j, KEEP_ALL));
  }
  return out;
}

/** A stream entry → a validated delivery, or the reason it can't be used (never the payload). */
export function parseDelivery(
  fields: Record<string, string>,
  payloadField = '',
): IngestDelivery | { error: string } {
  let body: unknown;
  let used: string | undefined;
  for (const f of [payloadField, ...PAYLOAD_FIELDS].filter(Boolean)) {
    const v = parseJson(fields[f]);
    if (v !== undefined) {
      body = v;
      used = f;
      break;
    }
  }
  if (body === undefined) {
    const flat = parseJson(fields.readings);
    if (flat !== undefined) {
      body = { site: fields.site, readings: flat };
      used = 'readings';
    }
  }
  if (body === undefined) {
    for (const [k, v] of Object.entries(fields)) {
      const j = parseJson(v);
      if (isObj(j) && Array.isArray(j.readings)) {
        body = j;
        used = k;
        break;
      }
    }
  }
  // One wrapper level, e.g. {"body": {"site": …, "readings": […]}}.
  if (isObj(body) && !Array.isArray(body.readings)) {
    const inner = Object.values(body).filter(
      (v) => isObj(v) && Array.isArray(v.readings),
    );
    if (inner.length === 1) body = inner[0];
  }
  if (!isObj(body)) return { error: 'no delivery JSON in the stream entry' };

  const site = body.site ?? fields.site;
  if (typeof site !== 'string' || !SITE.test(site))
    return { error: 'site missing or not a valid name' };
  const readings = body.readings;
  if (!Array.isArray(readings) || readings.length < 1 || readings.length > 1000)
    return { error: 'readings must be 1 to 1000 entries' };

  const out: IngestReading[] = [];
  for (const [i, r] of readings.entries()) {
    if (!isObj(r)) return { error: `reading ${i} is not an object` };
    if (
      typeof r.ts !== 'string' ||
      !TS.test(r.ts) ||
      Number.isNaN(Date.parse(r.ts))
    )
      return { error: `reading ${i}: ts must be ISO 8601 UTC with Z` };
    if (!isObj(r.metrics)) return { error: `reading ${i}: metrics missing` };
    const entries = Object.entries(r.metrics);
    if (entries.length < 1 || entries.length > MAX_METRICS)
      return { error: `reading ${i}: 1 to ${MAX_METRICS} metrics` };
    for (const [k, v] of entries)
      if (!METRIC.test(k) || typeof v !== 'number' || !Number.isFinite(v))
        return {
          error: `reading ${i}: metric "${k.slice(
            0,
            64,
          )}" is not a valid numeric metric`,
        };
    let metadata: IngestReading['metadata'];
    if (r.metadata !== undefined) {
      if (!isObj(r.metadata))
        return { error: `reading ${i}: metadata must be an object` };
      const md = Object.entries(r.metadata);
      if (md.length > MAX_METADATA)
        return {
          error: `reading ${i}: at most ${MAX_METADATA} metadata values`,
        };
      for (const [k, v] of md)
        if (
          !METRIC.test(k) ||
          !(
            (typeof v === 'string' && v.length <= 128) ||
            typeof v === 'boolean' ||
            (typeof v === 'number' && Number.isFinite(v))
          )
        )
          return {
            error: `reading ${i}: metadata "${k.slice(
              0,
              64,
            )}" must be a short text, number or boolean`,
          };
      metadata = r.metadata as IngestReading['metadata'];
    }
    out.push({
      ts: r.ts,
      metrics: r.metrics as Record<string, number>,
      ...(metadata && { metadata }),
    });
  }

  const meta = Object.fromEntries(
    Object.entries(safeFields(fields)).filter(
      ([k, v]) =>
        k !== used &&
        k !== 'site' &&
        v.length <= 200 &&
        parseJson(v) === undefined,
    ),
  );
  return { site, readings: out, meta };
}

/**
 * Flat metric names → devices. Both naming styles are understood:
 *   inverters      `wr1_pv_w`, `inverter1_pv_w`, `inverter.1.pv_power_w`, `inv_2.load_power_w`
 *   battery cells  `battery.pack.1.cell.10.voltage_v`, `bms.2.cell.3.voltage_mv`, `pack1_cell4_v`
 *   battery packs  `battery.pack.1.soc_pct`, `bms.2.temperature_c`, `battery.3.voltage_v`
 *   plant totals   `plant.pv_power_w`, `total.load_power_w`, `system.grid_power_w` (prefix dropped)
 * Everything else stays a system metric (unknown names are kept, not dropped).
 */
const SEP = '[._-]';
const INVERTER_KEY = new RegExp(
  `^(?:inverter|inv|wr)${SEP}?(\\d{1,3})${SEP}(.+)$`,
  'i',
);
const CELL_KEY = new RegExp(
  `^(?:battery${SEP}?)?(?:pack|bms|battery|bat)${SEP}?(\\d{1,3})${SEP}cells?${SEP}?(\\d{1,4})(?:${SEP}(.+))?$`,
  'i',
);
const PACK_KEY = new RegExp(
  `^(?:battery${SEP}?)?(?:pack|bms|battery|bat)${SEP}?(\\d{1,3})${SEP}(.+)$`,
  'i',
);
const TOTAL_PREFIX = new RegExp(
  `^(?:plant|total|system|site|overall)${SEP}(.+)$`,
  'i',
);

type Value = number | string | boolean;
export interface GroupedMetrics {
  system: Record<string, Value>;
  inverters: Map<number, Record<string, Value>>;
  packs: Map<number, Record<string, Value>>;
  cells: Map<number, Map<number, { voltage?: number; temperature?: number }>>;
  /** Whole-battery values (`battery.soc_pct`, `battery.capacity_kwh`…), prefix dropped. */
  bank: Record<string, Value>;
}

export function groupMetrics(values: Record<string, Value>): GroupedMetrics {
  const g: GroupedMetrics = {
    system: {},
    inverters: new Map(),
    packs: new Map(),
    cells: new Map(),
    bank: {},
  };
  for (const [key, v] of Object.entries(values)) {
    let m = INVERTER_KEY.exec(key);
    if (m) {
      const n = Number(m[1]);
      g.inverters.set(n, { ...g.inverters.get(n), [m[2]]: v });
      continue;
    }
    m = CELL_KEY.exec(key);
    if (m && typeof v === 'number') {
      const pack = Number(m[1]),
        cell = Number(m[2]);
      const field = (m[3] ?? 'voltage').toLowerCase();
      const cells = g.cells.get(pack) ?? new Map();
      const c = cells.get(cell) ?? {};
      if (/temp/.test(field)) c.temperature = v;
      else c.voltage = /(^|[._-])mv$/.test(field) ? v / 1000 : v;
      cells.set(cell, c);
      g.cells.set(pack, cells);
      continue;
    }
    m = PACK_KEY.exec(key);
    if (m) {
      const n = Number(m[1]);
      g.packs.set(n, { ...g.packs.get(n), [m[2]]: v });
      continue;
    }
    m = TOTAL_PREFIX.exec(key);
    g.system[m ? m[1] : key] = v;
    // Whole-battery values also describe the battery bank as a device.
    const b = new RegExp(`^battery${SEP}(?!\\d)(.+)$`, 'i').exec(
      m ? m[1] : key,
    );
    if (b) g.bank[b[1]] = v;
  }
  // Plant totals missing but every inverter reports them: their sum (one
  // phase of a parallel system each), so Overview and Energy Flow work.
  const canon = (k: string) => k.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const has = (names: string[]) =>
    Object.keys(g.system).some((k) => names.includes(canon(k)));
  const sum = (names: string[]) => {
    let total = 0,
      n = 0;
    for (const inv of g.inverters.values())
      for (const [k, v] of Object.entries(inv))
        if (names.includes(canon(k)) && typeof v === 'number')
          (total += v), n++;
    return n === g.inverters.size && n > 0 ? total : undefined;
  };
  for (const [target, names] of [
    [
      'pv_power_w',
      [
        'pv_power_w',
        'pv_w',
        'pv_power',
        'pv_total_power_w',
        'pv_total_w',
        'total_pv_power_w',
      ],
    ],
    [
      'load_power_w',
      ['load_power_w', 'load_w', 'load_power', 'total_load_power_w'],
    ],
  ] as const) {
    if (has([...names])) continue;
    const s = sum([...names]);
    if (s !== undefined) g.system[target] = s;
  }
  return g;
}

/** `<site>@<ts>#<hash of the metrics>`: identifies a reading independent of the stream entry. */
export function readingId(site: string, r: IngestReading) {
  const canonical = JSON.stringify(
    Object.keys(r.metrics)
      .sort()
      .map((k) => [k, r.metrics[k]]),
  );
  return `${site}@${r.ts}#${createHash('sha256')
    .update(canonical)
    .digest('hex')
    .slice(0, 16)}`;
}

/** One delivery → one SolarBMS message per reading, with a stable messageId for idempotency. */
export function toSolarBmsMessages(
  stream: string,
  entryId: string,
  d: IngestDelivery,
): Record<string, unknown>[] {
  return d.readings.map((r, i) => {
    const g = groupMetrics({ ...r.metadata, ...r.metrics });
    const cellsOf = (n: number) =>
      [...(g.cells.get(n) ?? new Map())]
        .sort(([x], [y]) => x - y)
        .map(([id, c]) => ({ id, ...c }));
    const bank = Object.keys(g.bank).length
      ? [{ id: 'battery-bank', name: 'Battery bank', ...g.bank }]
      : [];
    // Packs with their own values are batteries (cells under their BMS);
    // packs that only report cells are just a BMS with cells.
    const packs = [...g.packs.keys()]
      .sort((x, y) => x - y)
      .map((n) => ({
        id: `pack-${n}`,
        name: `Battery pack ${n}`,
        ...g.packs.get(n),
        ...(g.cells.has(n) && { cells: cellsOf(n) }),
      }));
    const bmsOnly = [...g.cells.keys()]
      .filter((n) => !g.packs.has(n))
      .sort((x, y) => x - y)
      .map((n) => ({
        id: `pack-${n}-bms`,
        name: `BMS pack ${n}`,
        cells: cellsOf(n),
      }));
    return {
      schemaVersion: 'ingest-readings/1',
      // Same reading content → same id: retries, replays and re-sent batches
      // are stored once; different metrics at the same time are kept.
      messageId: readingId(d.site, r),
      systemId: d.site,
      timestamp: r.ts,
      measurements: g.system,
      ...(g.inverters.size && {
        inverters: [...g.inverters]
          .sort(([x], [y]) => x - y)
          .map(([n, m]) => ({
            id: `inverter-${n}`,
            name: `Inverter ${n}`,
            ...m,
          })),
      }),
      ...((bank.length || packs.length) && { batteries: [...bank, ...packs] }),
      ...(bmsOnly.length && { bms: bmsOnly }),
      // Where it came from; kept in the stored raw message, not turned into metrics.
      source: { stream, entryId, index: i, ...d.meta },
    };
  });
}
