/**
 * Regression tests for the audit's security findings: no credentials in the
 * error log, expiring legacy tokens, no account enumeration through
 * forgot-password, no automatic email linking of privileged accounts,
 * brute-force limits and security headers.
 */
import { spawnSync } from 'child_process';
import { JwtService } from '@nestjs/jwt';
import { ERole } from '@prisma/client';
import { join } from 'path';
import { startApi, TestApi } from './support/app';
import { call, db, signup, sso, tag } from './support/http';

const prisma = db();
let t: TestApi;

beforeAll(async () => {
  t = await startApi();
});
afterAll(async () => {
  await prisma.$disconnect();
  await t.close();
});

describe('error log', () => {
  it('stores no password, token or secret from a failed request', async () => {
    const u = await signup(t.api, 'logsec');
    const marker = `Wr0ng-${tag()}`;
    const r = await call(t.api, 'POST', `/auth/login?token=q-${marker}`, {
      body: {
        email: u.email,
        password: marker,
        nested: {
          client_secret: `s-${marker}`,
          list: [{ apiKey: `k-${marker}` }],
        },
      },
    });
    expect(r.status).toBe(403);
    const logs = await prisma.logs.findMany({
      where: { requestUrl: { startsWith: '/api/v1/auth/login' } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    const mine = logs.find((l) => (l.metadata ?? '').includes(u.email));
    expect(mine).toBeDefined();
    const stored = JSON.stringify(logs);
    expect(stored).not.toContain(marker);
    expect(mine.metadata).toContain('[REDACTED]');
    expect(mine.requestUrl).toBe('/api/v1/auth/login?token=[REDACTED]');
  });
});

describe('legacy bearer tokens', () => {
  it('expire, and a token without an expiry is refused', async () => {
    const u = await signup(t.api, 'jwtexp');
    const payload = JSON.parse(
      Buffer.from(u.token.split('.')[1], 'base64url').toString(),
    );
    expect(payload.exp - payload.iat).toBe(12 * 3600);
    expect(
      (await call(t.api, 'GET', '/user/infos', { token: u.token })).status,
    ).toBe(200);

    const forever = new JwtService().sign(
      { id: u.user.id, role: 'USER', email: u.email },
      { secret: 'e2e-jwt-secret' },
    );
    expect(
      (await call(t.api, 'GET', '/user/infos', { token: forever })).status,
    ).toBe(401);
    const expired = new JwtService().sign(
      { id: u.user.id, role: 'USER', email: u.email },
      { secret: 'e2e-jwt-secret', expiresIn: -10 },
    );
    expect(
      (await call(t.api, 'GET', '/user/infos', { token: expired })).status,
    ).toBe(401);
  });
});

describe('forgot-password', () => {
  it('answers the same for known and unknown emails, without account data', async () => {
    const u = await signup(t.api, 'forgot');
    const known = await call(t.api, 'POST', '/auth/forgot-password', {
      body: { email: u.email },
    });
    const unknown = await call(t.api, 'POST', '/auth/forgot-password', {
      body: { email: `nobody-${tag()}@example.test` },
    });
    expect([known.status, unknown.status]).toEqual([200, 200]);
    expect(known.data).toEqual(unknown.data);
    expect(JSON.stringify(known.data)).not.toMatch(/"id"|"role"|password/);
  });
});

describe('Keycloak email linking', () => {
  it('never links a privileged account by email', async () => {
    for (const role of [ERole.ADMIN, ERole.SUB_ADMIN]) {
      const acct = await signup(t.api, `priv-${role.toLowerCase()}`);
      await prisma.user.update({ where: { id: acct.user.id }, data: { role } });
      const r = await sso(t.api, {
        email: acct.email,
        sub: `kc-priv-${tag()}`,
      });
      expect(r.location).toContain('sso_error=privileged_link_refused');
      expect(r.session).toBe('');
      expect(
        await prisma.userIdentity.count({ where: { userId: acct.user.id } }),
      ).toBe(0);
    }
  });

  it('links a privileged account only through scripts/link-identity.js (dry run first, refusals)', async () => {
    const acct = await signup(t.api, 'linkscript');
    await prisma.user.update({
      where: { id: acct.user.id },
      data: { role: ERole.ADMIN },
    });
    const sub = `kc-script-${tag()}`;
    const run = (...extra: string[]) =>
      spawnSync(
        process.execPath,
        [
          join(__dirname, '..', 'scripts', 'link-identity.js'),
          '--email',
          acct.email,
          '--subject',
          sub,
          ...extra,
        ],
        { encoding: 'utf8', env: process.env },
      );
    const dry = run();
    expect([dry.status, dry.stdout]).toEqual([
      0,
      expect.stringMatching(/dry run/),
    ]);
    expect(
      await prisma.userIdentity.count({ where: { userId: acct.user.id } }),
    ).toBe(0);
    expect(run('--apply').status).toBe(0);
    const r = await sso(t.api, { email: acct.email, sub });
    expect(r.session).not.toBe('');

    // The same subject can't be attached to a second account.
    const other = await signup(t.api, 'linkscript2');
    const steal = spawnSync(
      process.execPath,
      [
        join(__dirname, '..', 'scripts', 'link-identity.js'),
        '--email',
        other.email,
        '--subject',
        sub,
        '--apply',
      ],
      { encoding: 'utf8', env: process.env },
    );
    expect(steal.status).toBe(1);
    expect(steal.stderr).toMatch(/already linked to another account/);
    const none = spawnSync(
      process.execPath,
      [
        join(__dirname, '..', 'scripts', 'link-identity.js'),
        '--email',
        `nobody-${tag()}@example.test`,
        '--subject',
        'x',
        '--apply',
      ],
      { encoding: 'utf8', env: process.env },
    );
    expect(none.stderr).toMatch(/0 accounts match/);
    expect(`${dry.stdout}${steal.stderr}`).not.toMatch(/mongodb:\/\//);
  });

  it('still links an ordinary account by verified email', async () => {
    const acct = await signup(t.api, 'plainlink');
    const r = await sso(t.api, { email: acct.email, sub: `kc-plain-${tag()}` });
    expect(r.session).not.toBe('');
    expect(
      await prisma.userIdentity.count({ where: { userId: acct.user.id } }),
    ).toBe(1);
  });
});

describe('HTTP security headers', () => {
  it('are set on API responses; X-Powered-By is not', async () => {
    const res = await fetch(`${t.api}/auth/config`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('content-security-policy')).toContain(
      "frame-ancestors 'none'",
    );
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('x-powered-by')).toBeNull();
  });
});

describe('brute-force limit on password endpoints', () => {
  let limited: TestApi;
  beforeAll(async () => {
    await t.close();
    limited = await startApi({
      AUTH_RATE_LIMIT_ENABLED: 'true',
      AUTH_RATE_LIMIT_PER_ACCOUNT: '3',
      AUTH_RATE_LIMIT_PER_IP: '6',
      AUTH_RATE_LIMIT_WINDOW_S: '60',
    });
  });
  afterAll(async () => {
    await limited.close();
    t = await startApi(); // for the outer afterAll
  });

  it('returns 429 with Retry-After after too many attempts for one account', async () => {
    const email = `brute-${tag()}@example.test`;
    const attempt = () =>
      fetch(`${limited.api}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'nope' }),
      });
    for (let i = 0; i < 3; i++) expect((await attempt()).status).not.toBe(429);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('limits per client IP across accounts', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const r = await fetch(`${limited.api}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: `ip-${i}-${tag()}@example.test` }),
      });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 6).every((s) => s === 200)).toBe(true);
    expect(statuses[6]).toBe(429);
  });
});

describe('scripts/logs-credential-audit.js (records written before redaction)', () => {
  it('counts without printing contents, dry-runs, then redacts in place', async () => {
    const marker = `Leak-${tag()}`;
    const old = await prisma.logs.create({
      data: {
        eventType: 'ERROR',
        description: 'Error occurred: Wrong User password',
        requestUrl: `/api/v1/auth/verify?token=${marker}`,
        method: 'POST',
        metadata: JSON.stringify({
          query: {},
          body: {
            email: 'x@example.test',
            password: marker,
            profile: { apiKey: marker },
          },
        }),
      },
    });
    const run = (...a: string[]) =>
      spawnSync(
        process.execPath,
        [join(__dirname, '..', 'scripts', 'logs-credential-audit.js'), ...a],
        { encoding: 'utf8', env: process.env },
      );
    try {
      const check = run('check');
      expect(check.status).toBe(0);
      expect(check.stdout).toMatch(
        /records that may contain credentials: [1-9]/,
      );
      const dry = run('redact');
      expect(dry.stdout).toMatch(/would redact \(dry run\)/);
      for (const r of [check, dry])
        expect(`${r.stdout}${r.stderr}`).not.toContain(marker);
      expect(
        (await prisma.logs.findUnique({ where: { id: old.id } })).metadata,
      ).toContain(marker);

      const applied = run('redact', '--apply');
      expect(applied.status).toBe(0);
      const after = await prisma.logs.findUnique({ where: { id: old.id } });
      expect(JSON.stringify(after)).not.toContain(marker);
      expect(after.metadata).toContain('x@example.test'); // non-secret context kept
      expect(run('check').stdout).toMatch(
        /records that may contain credentials: 0/,
      );
    } finally {
      await prisma.logs.delete({ where: { id: old.id } }).catch(() => null);
    }
  });
});
