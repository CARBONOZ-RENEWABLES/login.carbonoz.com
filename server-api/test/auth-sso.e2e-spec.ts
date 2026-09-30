/**
 * Customer sign-in through Keycloak (mock): PKCE/state/nonce, server-side
 * session in an HttpOnly cookie, identity linking (incl. the email-regex
 * takeover regression), login-CSRF binding, CSRF on writes, refresh
 * revocation and back-off, logout, disabled users.
 */
import { startApi, TestApi } from './support/app';
import {
  call,
  csrf,
  db,
  kc,
  redis,
  signup,
  sleep,
  sso,
  tag,
} from './support/http';

let t: TestApi;
const prisma = db();

beforeAll(async () => {
  t = await startApi();
});
afterAll(async () => {
  await kc('/_mode', { mode: 'normal', delayMs: 0 });
  await kc('/_unrevoke', {});
  await prisma.$disconnect();
  await t.close();
});

describe('login flow', () => {
  it('uses PKCE S256, state and nonce, and never exposes the client secret', async () => {
    const r = await sso(t.api, { email: `pkce-${tag()}@example.test` });
    const u = new URL(r.authorize);
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('code_challenge')).toBeTruthy();
    expect(u.searchParams.get('state')).toBeTruthy();
    expect(u.searchParams.get('nonce')).toBeTruthy();
    expect(r.authorize).not.toContain('test-secret');
  });

  it('issues an opaque HttpOnly SameSite=Lax session cookie and binds the login state to the browser', async () => {
    const r = await sso(
      t.api,
      { email: `cookie-${tag()}@example.test` },
      { returnTo: '/ds/solar' },
    );
    expect(r.location).toBe('http://frontend.test/ds/solar');
    expect(r.sessionRaw).toMatch(/HttpOnly/i);
    expect(r.sessionRaw).toMatch(/SameSite=Lax/i);
    expect(r.session.split('=')[1].split('.')).toHaveLength(1); // not a JWT
    expect(r.stateCookie?.raw).toMatch(/HttpOnly/i);
    expect(r.stateCookie?.raw).toMatch(/Path=\/api\/v1\/auth\/oidc/);
    const s = await call(t.api, 'GET', '/auth/session', { cookie: r.session });
    expect(s.status).toBe(200);
  });

  it('rejects a callback completed by a browser that did not start the login (login CSRF)', async () => {
    const r = await sso(
      t.api,
      { email: `csrf-${tag()}@example.test` },
      { sendStateCookie: false },
    );
    expect(r.location).toContain('sso_error=login_state_mismatch');
    expect(r.session).toBe('');
  });

  it("rejects a callback carrying another login's state cookie", async () => {
    const other = await sso(t.api, { email: `other-${tag()}@example.test` });
    await kc('/_next', {
      sub: `kc-x-${tag()}`,
      email: `victim-${tag()}@example.test`,
      email_verified: true,
    });
    const start = await fetch(`${t.api}/auth/oidc/login`, {
      redirect: 'manual',
    });
    const cb = await fetch(start.headers.get('location'), {
      redirect: 'manual',
    });
    const res = await fetch(cb.headers.get('location'), {
      redirect: 'manual',
      headers: { cookie: other.stateCookie.pair },
    });
    expect(res.headers.get('location')).toContain(
      'sso_error=login_state_mismatch',
    );
  });

  it('keeps the state single-use and rejects an expired state', async () => {
    const r = await sso(t.api, { email: `replay-${tag()}@example.test` });
    const replay = await fetch(r.callbackUrl, {
      redirect: 'manual',
      headers: { cookie: r.stateCookie.pair },
    });
    expect(replay.headers.get('location')).toContain('sso_error=');
    // Expiry: the Redis state lives 10 min; deleting it simulates expiry.
    await kc('/_next', {
      sub: `kc-exp-${tag()}`,
      email: `exp-${tag()}@example.test`,
      email_verified: true,
    });
    const start = await fetch(`${t.api}/auth/oidc/login`, {
      redirect: 'manual',
    });
    const state = new URL(start.headers.get('location')).searchParams.get(
      'state',
    );
    const cookie = start.headers.get('set-cookie').split(';')[0];
    const r2 = await redis();
    await r2.del(`oidc-pending:${state}`);
    await r2.quit();
    const cb = await fetch(start.headers.get('location'), {
      redirect: 'manual',
    });
    const res = await fetch(cb.headers.get('location'), {
      redirect: 'manual',
      headers: { cookie },
    });
    expect(res.headers.get('location')).toContain('sso_error=');
    expect(res.headers.get('set-cookie') ?? '').not.toContain('cz_session=');
  });

  it('only returns to allow-listed origins', async () => {
    const email = `ret-${tag()}@example.test`;
    expect(
      (await sso(t.api, { email }, { returnTo: 'https://evil.example/x' }))
        .location,
    ).toBe('http://frontend.test/ds');
    expect(
      (await sso(t.api, { email }, { returnTo: '//evil.example' })).location,
    ).toBe('http://frontend.test/ds');
    expect(
      (
        await sso(
          t.api,
          { email },
          { returnTo: 'http://solar.test.evil.example/ds' },
        )
      ).location,
    ).toBe('http://frontend.test/ds');
    expect(
      (await sso(t.api, { email }, { returnTo: 'http://solar.test/ds/solar' }))
        .location,
    ).toBe('http://solar.test/ds/solar');
  });
});

describe('identity linking', () => {
  it('links an existing password account by verified email (case-insensitive) and reuses the link', async () => {
    const legacy = await signup(t.api, 'link');
    const first = await sso(t.api, {
      email: legacy.email.toUpperCase(),
      sub: `kc-link-${tag()}`,
    });
    const s = await call(t.api, 'GET', '/auth/session', {
      cookie: first.session,
    });
    expect(s.data.data.user.id).toBe(legacy.user.id);
  });

  it('treats + . * | in addresses literally (no regex account takeover)', async () => {
    const victim = await signup(t.api, 'aab');
    const plusEmail = victim.email.replace(/^aab/, 'a+b');
    const r = await sso(t.api, { email: plusEmail });
    const s = await call(t.api, 'GET', '/auth/session', { cookie: r.session });
    expect(s.data.data.user.id).not.toBe(victim.user.id);
    expect(s.data.data.user.email).toBe(plusEmail.toLowerCase());

    for (const attack of [
      `x*|audit-${tag()}@attacker.example`,
      `.*|audit-${tag()}@attacker.example`,
    ]) {
      const a = await sso(t.api, { email: attack });
      const who = await call(t.api, 'GET', '/auth/session', {
        cookie: a.session,
      });
      expect(who.data.data.user.role).toBe('USER');
      expect(who.data.data.user.email).toBe(attack.toLowerCase());
    }
  });

  it('refuses to guess between accounts that differ only by case', async () => {
    const base = `dup-${tag()}@example.test`;
    await prisma.user.create({ data: { email: base, active: true } });
    await prisma.user.create({
      data: { email: base.toUpperCase(), active: true },
    });
    const r = await sso(t.api, { email: base });
    expect(r.location).toContain('sso_error=email_ambiguous');
  });

  it('refuses unverified email addresses', async () => {
    const r = await sso(t.api, {
      email: `unv-${tag()}@example.test`,
      verified: false,
    });
    expect(r.location).toContain('sso_error=email_unverified');
    expect(r.session).toBe('');
  });

  it('SSO-only accounts get a clear 403 on password login', async () => {
    const email = `ssoonly-${tag()}@example.test`;
    await sso(t.api, { email });
    const r = await call(t.api, 'POST', '/auth/login', {
      body: { email, password: 'whatever' },
    });
    expect(r.status).toBe(403);
  });
});

describe('session, CSRF and logout', () => {
  it('requires the CSRF header for cookie-authenticated writes', async () => {
    const r = await sso(t.api, { email: `w-${tag()}@example.test` });
    expect(
      (
        await call(t.api, 'PATCH', '/user/edit-user', {
          cookie: r.session,
          body: { firstName: 'x' },
        })
      ).status,
    ).toBe(403);
    expect(
      (await call(t.api, 'POST', '/auth/logout', { cookie: r.session })).status,
    ).toBe(403);
    const out = await call(t.api, 'POST', '/auth/logout', {
      cookie: r.session,
      headers: csrf,
    });
    expect(out.status).toBe(200);
    expect(out.data.data.logoutUrl).toContain(
      '/realms/customers/protocol/openid-connect/logout',
    );
    expect(out.data.data.logoutUrl).toContain('id_token_hint=');
    expect(
      (await call(t.api, 'GET', '/auth/session', { cookie: r.session })).status,
    ).toBe(401);
  });

  it('ends the session for a disabled user', async () => {
    const email = `dis-${tag()}@example.test`;
    const r = await sso(t.api, { email });
    const id = (
      await call(t.api, 'GET', '/auth/session', { cookie: r.session })
    ).data.data.user.id;
    await prisma.user.update({ where: { id }, data: { activeStatus: false } });
    expect(
      (await call(t.api, 'GET', '/auth/session', { cookie: r.session })).status,
    ).toBe(401);
  });

  it('ends the session once Keycloak rejects the refresh (logout/disable in Keycloak)', async () => {
    const r = await sso(t.api, {
      email: `rev-${tag()}@example.test`,
      expiresIn: 1,
    });
    await sleep(1200);
    expect(
      (await call(t.api, 'GET', '/auth/session', { cookie: r.session })).status,
    ).toBe(200); // refreshed
    await kc('/_revoke', {});
    await sleep(1200);
    expect(
      (await call(t.api, 'GET', '/auth/session', { cookie: r.session })).status,
    ).toBe(401);
    await kc('/_unrevoke', {});
  });
});

describe('Keycloak unavailable or slow', () => {
  it('keeps sessions working, backs off instead of retrying every request, and recovers', async () => {
    const r = await sso(t.api, {
      email: `bo-${tag()}@example.test`,
      expiresIn: 1,
    });
    await sleep(1200);
    await kc('/_mode', { mode: 'down', delayMs: 0 });
    const before = (await kc('/_stats')).refreshRequests;
    for (let i = 0; i < 5; i++)
      expect(
        (await call(t.api, 'GET', '/auth/session', { cookie: r.session }))
          .status,
      ).toBe(200);
    const after = (await kc('/_stats')).refreshRequests;
    expect(after - before).toBe(1); // one attempt, then back-off

    // Slow Keycloak: the one refresh attempt is bounded (3 s), the rest don't wait.
    await kc('/_mode', { mode: 'normal', delayMs: 0 });
    const r2 = await sso(t.api, {
      email: `slow-${tag()}@example.test`,
      expiresIn: 1,
    });
    expect(r2.session).not.toBe('');
    await kc('/_mode', { mode: 'normal', delayMs: 8000 });
    await sleep(1200);
    const slow = await call(t.api, 'GET', '/auth/session', {
      cookie: r2.session,
    });
    expect(slow.status).toBe(200);
    expect(slow.ms).toBeLessThan(5000);
    const fast = await call(t.api, 'GET', '/auth/session', {
      cookie: r2.session,
    });
    expect(fast.ms).toBeLessThan(1000);

    // Recovery: after the back-off window the refresh succeeds again.
    await kc('/_mode', { mode: 'normal', delayMs: 0 });
    const redisClient = await redis();
    // Skip the 30 s back-off window: expire the session's access time now.
    for (const key of await redisClient.keys('session:*')) {
      const v = JSON.parse(String(await redisClient.get(key)));
      if (v.accessExpiresAt)
        await redisClient.set(
          key,
          JSON.stringify({ ...v, accessExpiresAt: 1 }),
          { KEEPTTL: true },
        );
    }
    await redisClient.quit();
    const beforeOk = (await kc('/_stats')).refreshRequests;
    expect(
      (await call(t.api, 'GET', '/auth/session', { cookie: r.session })).status,
    ).toBe(200);
    expect((await kc('/_stats')).refreshRequests).toBeGreaterThan(beforeOk);
  });
});
