/**
 * Redaction for anything that is stored or logged: request bodies, query
 * strings, error messages, stream payloads. Field names that can carry a
 * credential are replaced at any depth; credential-shaped text (connection
 * strings with a password, bearer tokens, JWTs, machine API keys) is masked
 * inside strings. Output is bounded in depth, array length and string length.
 */
export const REDACTED = '[REDACTED]';

// Matched against field names (case-insensitive, any depth).
const SENSITIVE_KEY =
  /pass(word|wd|phrase)?$|^pwd$|secret|token|^auth|authori[sz]ation|cookie|session|api[-_]?key|private[-_]?key|credential|signature|^jwt$|bearer|^otp$|^code$|code[-_]?verifier|^pin$|^cvc$|^cvv$|card[-_]?number/i;

export const isSensitiveKey = (key: string) => SENSITIVE_KEY.test(key);

const TEXT_PATTERNS: [RegExp, string][] = [
  // scheme://user:password@host → scheme://***@host
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]*:[^\s/@]*@/gi, '$1***@'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***'],
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, '***jwt***'],
  [/\bczk\.[A-Za-z0-9]+\.[A-Za-z0-9_-]+/g, 'czk.***'],
  // key=value / "key":"value" pairs inside free text
  [
    /\b(password|passwd|pwd|secret|token|api[-_]?key|client[-_]?secret)(["']?\s*[:=]\s*["']?)[^\s"'&,;}]+/gi,
    `$1$2${REDACTED}`,
  ],
];

export function redactText(text: string, maxLength = 2000): string {
  let s = String(text);
  for (const [re, by] of TEXT_PATTERNS) s = s.replace(re, by);
  return s.length > maxLength ? `${s.slice(0, maxLength)}…[truncated]` : s;
}

export interface RedactOptions {
  maxDepth?: number;
  maxArray?: number;
  maxString?: number;
}

export function redact(value: unknown, opts: RedactOptions = {}): unknown {
  const { maxDepth = 6, maxArray = 50, maxString = 500 } = opts;
  const walk = (v: unknown, depth: number): unknown => {
    if (v === null || v === undefined) return v;
    if (typeof v === 'string') return redactText(v, maxString);
    if (typeof v !== 'object') return v;
    if (v instanceof Date) return v;
    if (depth >= maxDepth) return '[depth limit]';
    if (Array.isArray(v)) {
      const out = v.slice(0, maxArray).map((x) => walk(x, depth + 1));
      if (v.length > maxArray) out.push(`[+${v.length - maxArray} more]`);
      return out;
    }
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>))
      out[k] = isSensitiveKey(k) ? REDACTED : walk(x, depth + 1);
    return out;
  };
  return walk(value, 0);
}

/** Path plus query string with sensitive parameter values replaced. */
export function redactUrl(url: string): string {
  const q = url.indexOf('?');
  if (q < 0) return redactText(url, 1000);
  const params = new URLSearchParams(url.slice(q + 1));
  for (const k of [...params.keys()])
    if (isSensitiveKey(k)) params.set(k, REDACTED);
  return redactText(`${url.slice(0, q)}?${params.toString()}`, 1000);
}

/** JSON of a redacted value, cut to `maxBytes` (stays a string, not valid JSON, when cut). */
export function safeJson(
  value: unknown,
  maxBytes = 8000,
  opts: RedactOptions = {},
): string {
  const s = JSON.stringify(redact(value, opts)) ?? '';
  return s.length > maxBytes ? `${s.slice(0, maxBytes)}…[truncated]` : s;
}
