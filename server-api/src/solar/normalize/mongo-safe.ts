/**
 * Makes an arbitrary JSON value storable as a MongoDB document.
 *
 * MongoDB rejects field names containing NUL, and (before 5.0) names starting
 * with `$` or containing `.`; it also limits nesting to 100 levels. A SolarBMS
 * payload may contain any of these. Rewriting them keeps the message storable
 * instead of leaving it pending forever; the caller keeps the original text
 * whenever `changed` is true, so nothing of the raw message is lost.
 */
const MAX_NESTING = 90;

// Explicit code points, so no invisible or look-alike characters live in the source.
const REPLACEMENT_CHAR = String.fromCharCode(0xfffd); // stands in for NUL
const FULLWIDTH_DOT = String.fromCharCode(0xff0e); // stands in for '.'
const FULLWIDTH_DOLLAR = String.fromCharCode(0xff04); // stands in for a leading '$'
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b); // de-duplicates colliding keys

const safeKey = (k: string): string => {
  if (k === '') return '(empty)';
  let out = k
    .split(String.fromCharCode(0))
    .join(REPLACEMENT_CHAR)
    .split('.')
    .join(FULLWIDTH_DOT);
  if (out.startsWith('$')) out = FULLWIDTH_DOLLAR + out.slice(1);
  return out;
};

export function toMongoSafe(value: unknown): {
  value: unknown;
  changed: boolean;
} {
  let changed = false;
  const walk = (v: unknown, depth: number): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (depth >= MAX_NESTING) {
      changed = true;
      return JSON.stringify(v);
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      let key = safeKey(k);
      if (key !== k) changed = true;
      // Two keys that collapse to the same safe key keep both values.
      while (Object.prototype.hasOwnProperty.call(out, key))
        key += ZERO_WIDTH_SPACE;
      out[key] = walk(x, depth + 1);
    }
    return out;
  };
  return { value: walk(value, 0), changed };
}
