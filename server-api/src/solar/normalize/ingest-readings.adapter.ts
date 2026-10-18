/**
 * Felix's ingest API (api.carbonoz.com → Redis `ingest:readings`) → the
 * SolarBMS message shape the existing worker and normalizer already handle.
 *
 * Delivery schema (ingest guide, 29 Sep 2026): `{ site, readings: [{ ts,
 * metrics: { name: number } }] }`, 1–1000 readings, ts ISO 8601 UTC with Z,
 * 1–200 numeric metrics per reading. This adapter only reshapes; what a
 * metric MEANS (aliases, units, signs) stays in solarbms.normalizer.ts and
 * the dashboard's semantics.ts.
 *
 * How the API lays a delivery out in the stream entry is not documented yet:
 * the JSON is looked for in `payloadField` (config), then in common field
 * names, then in any field holding a JSON object with `readings`; a flat
 * entry (`site` + `readings` as fields) works too.
 */
import { createHash } from 'crypto';

export interface IngestReading {
  ts: string;
  metrics: Record<string, number>;
}

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

function parseJson(s: string | undefined): unknown {
  if (!s || (s[0] !== '{' && s[0] !== '[')) return undefined;
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/** Entry fields with anything secret-looking removed (for dead letters and logs). */
export function safeFields(fields: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(fields).filter(([k]) => !SECRET_FIELD.test(k)),
  );
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
    if (entries.length < 1 || entries.length > 200)
      return { error: `reading ${i}: 1 to 200 metrics` };
    for (const [k, v] of entries)
      if (!METRIC.test(k) || typeof v !== 'number' || !Number.isFinite(v))
        return {
          error: `reading ${i}: metric "${k.slice(
            0,
            64,
          )}" is not a valid numeric metric`,
        };
    out.push({ ts: r.ts, metrics: r.metrics as Record<string, number> });
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
 * Per-inverter metrics by prefix, as proposed in the ingest guide
 * (`wr1_pv_w`, `wr2_pv_w`; WR = Wechselrichter). `inv1_` / `inverter1_` too.
 * Everything else stays a system metric — unknown names are kept, not dropped.
 */
const INVERTER_PREFIX = /^(wr|inv|inverter)(\d{1,3})[_.-](.+)$/i;

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
    const system: Record<string, number> = {};
    const inverters = new Map<string, Record<string, number>>();
    for (const [k, v] of Object.entries(r.metrics)) {
      const m = INVERTER_PREFIX.exec(k);
      if (m) {
        const id = `${m[1].toLowerCase()}${Number(m[2])}`;
        inverters.set(id, { ...inverters.get(id), [m[3]]: v });
      } else system[k] = v;
    }
    return {
      schemaVersion: 'ingest-readings/1',
      // Same reading content → same id: retries, replays and re-sent batches
      // are stored once; different metrics at the same time are kept.
      messageId: readingId(d.site, r),
      systemId: d.site,
      timestamp: r.ts,
      measurements: system,
      ...(inverters.size && {
        inverters: [...inverters].map(([id, m]) => ({ id, ...m })),
      }),
      // Where it came from; kept in the stored raw message, not turned into metrics.
      source: { stream, entryId, index: i, ...d.meta },
    };
  });
}
