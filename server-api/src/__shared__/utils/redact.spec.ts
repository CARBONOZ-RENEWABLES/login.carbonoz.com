import { redact, redactText, redactUrl, REDACTED, safeJson } from './redact';

describe('redact', () => {
  it('replaces credential fields at any depth, in objects and arrays', () => {
    const out = redact({
      email: 'a@example.test',
      password: 'p1',
      nested: {
        refresh_token: 'r',
        list: [{ apiKey: 'k' }, { clientSecret: 's', keep: 1 }],
        deeper: { Authorization: 'Bearer abc', cookie: 'c', code: 'oauth' },
      },
      newPassword: 'p2',
      private_key: 'pk',
    });
    expect(out).toEqual({
      email: 'a@example.test',
      password: REDACTED,
      nested: {
        refresh_token: REDACTED,
        list: [{ apiKey: REDACTED }, { clientSecret: REDACTED, keep: 1 }],
        deeper: { Authorization: REDACTED, cookie: REDACTED, code: REDACTED },
      },
      newPassword: REDACTED,
      private_key: REDACTED,
    });
  });

  it('keeps ordinary fields (metrics, names) untouched', () => {
    const v = {
      pv_w: 1200,
      battery_w: -5,
      site: 'x',
      soc_pct: 50,
      status: 'ok',
    };
    expect(redact(v)).toEqual(v);
  });

  it('masks credential-shaped text inside strings', () => {
    const s = redactText(
      'connect mongodb://app:hunter2@db:27017/x failed; Authorization: Bearer abc.def.ghi; key czk.abc123.SECRETPART; password=hunter3 token: "t0k"',
    );
    expect(s).not.toMatch(/hunter2|hunter3|abc\.def\.ghi|SECRETPART|t0k/);
    expect(s).toContain('mongodb://***@db:27017/x');
  });

  it('masks JWTs', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEyMyJ9.c2lnbmF0dXJl';
    expect(redactText(`token ${jwt}`)).not.toContain(jwt);
  });

  it('bounds depth, array length and string length', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
    expect(JSON.stringify(redact(deep))).toContain('[depth limit]');
    const arr = redact(Array.from({ length: 60 }, (_, i) => i)) as unknown[];
    expect(arr).toHaveLength(51);
    expect(arr[50]).toBe('[+10 more]');
    expect((redact('x'.repeat(600)) as string).length).toBeLessThan(520);
    expect(safeJson({ big: 'y'.repeat(5000) }, 100)).toMatch(/…\[truncated\]$/);
  });

  it('redacts sensitive query parameters in URLs', () => {
    const u = redactUrl('/api/v1/auth/verify?token=abc&page=2&api_key=k');
    expect(u).not.toMatch(/abc|=k\b/);
    expect(u).toContain('page=2');
  });
});
