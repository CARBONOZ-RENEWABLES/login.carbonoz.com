import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import { createClient } from 'redis';
import { readState } from './stack';

export interface Res<T = any> {
  status: number;
  data: T;
  headers: Headers;
  ms: number;
}

export async function call<T = any>(
  api: string,
  method: string,
  path: string,
  opts: {
    token?: string;
    body?: unknown;
    raw?: string;
    headers?: Record<string, string>;
    cookie?: string;
    timeoutMs?: number;
  } = {},
): Promise<Res<T>> {
  const t = Date.now();
  const r = await fetch(api + path, {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    headers: {
      'content-type': 'application/json',
      ...(opts.token && { authorization: `Bearer ${opts.token}` }),
      ...(opts.cookie && { cookie: opts.cookie }),
      ...opts.headers,
    },
    body:
      opts.raw ??
      (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  const text = await r.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: r.status, data, headers: r.headers, ms: Date.now() - t };
}

export const tag = () => randomBytes(4).toString('hex');
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function until<T>(
  fn: () => Promise<T>,
  ok: (v: T) => boolean,
  timeoutMs = 20_000,
  stepMs = 250,
): Promise<T> {
  const end = Date.now() + timeoutMs;
  let last: T;
  while (Date.now() < end) {
    last = await fn();
    if (ok(last)) return last;
    await sleep(stepMs);
  }
  return last;
}

export const db = () =>
  new PrismaClient({ datasources: { db: { url: readState().databaseUrl } } });

export async function redis() {
  const c = createClient({ url: readState().redisUrl });
  c.on('error', () => undefined);
  await c.connect();
  return c;
}

/** Legacy password account (sign-up), returns its bearer token and user. */
export async function signup(api: string, prefix = 'user') {
  const email = `${prefix}-${tag()}@example.test`;
  const r = await call(api, 'POST', '/auth/sign-up', {
    body: { email, password: 'Passw0rd!', role: 'USER' },
  });
  if (r.status !== 201)
    throw new Error(`sign-up failed ${r.status} ${JSON.stringify(r.data)}`);
  return {
    email,
    token: r.data.data.token as string,
    user: r.data.data.user as { id: string; email: string },
  };
}

export async function adminToken(api: string) {
  const r = await call(api, 'POST', '/auth/login', {
    body: { email: 'admin@carbonoz.test', password: 'Admin@123' },
  });
  if (r.status !== 200) throw new Error(`admin login failed ${r.status}`);
  return r.data.data.token as string;
}

/** Customer → site → installation → API key, owned by `ownerId`. */
export async function provision(
  api: string,
  admin: string,
  ownerId: string,
  opts: { systemId?: string; sites?: number } = {},
) {
  const post = async (p: string, body: unknown) => {
    const r = await call(api, 'POST', p, { token: admin, body });
    if (r.status !== 201)
      throw new Error(`${p} → ${r.status} ${JSON.stringify(r.data)}`);
    return r.data.data;
  };
  const customer = await post('/admin/customers', {
    name: `Customer ${tag()}`,
    type: 'COMPANY',
    ownerUserId: ownerId,
  });
  const site = await post(`/admin/customers/${customer.id}/sites`, {
    name: 'Site',
    timezone: 'Europe/Berlin',
  });
  const installation = await post(`/admin/sites/${site.id}/installations`, {
    name: 'Pi',
    externalSystemId: opts.systemId,
  });
  const cred = await post(
    `/admin/installations/${installation.id}/credentials`,
    { type: 'API_KEY' },
  );
  return {
    customer,
    site,
    installation,
    key: cred.apiKey as string,
    credentialId: cred.id as string,
    post,
  };
}

/** A SolarBMS message in the documented contract. */
export function reading(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: '1',
    messageId: `m-${tag()}${tag()}`,
    timestamp: new Date().toISOString(),
    measurements: {
      pvPower: 1000,
      loadPower: 400,
      gridPower: -100,
      batteryPower: 500,
      soc: 60,
    },
    batteries: [
      {
        id: 'battery-1',
        soc: 60,
        voltage: 53.2,
        bms: {
          id: 'bms-1',
          cells: [
            { id: 1, voltage: 3.31 },
            { id: 2, voltage: 3.33 },
          ],
        },
      },
    ],
    ...over,
  };
}

export const ingest = (api: string, key: string, body: unknown) =>
  call(api, 'POST', '/ingest/solarbms', { token: key, body });

/** Waits until the worker stored (PROCESSED) a message. */
export async function processed(
  prisma: PrismaClient,
  messageId: string,
  timeoutMs = 20_000,
) {
  return until(
    () => prisma.solarIngest.findFirst({ where: { messageId } }),
    (r) => r?.status === 'PROCESSED',
    timeoutMs,
  );
}

// ── SSO helpers against the mock Keycloak ───────────────────────────────

export async function kc(path: string, body?: unknown) {
  const r = await fetch(readState().kcUrl + path, {
    method: body === undefined ? 'GET' : 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return r.json();
}

const cookieOf = (h: Headers, name: string) => {
  const all = (
    h as unknown as { getSetCookie?: () => string[] }
  ).getSetCookie?.() ?? [h.get('set-cookie') ?? ''];
  const c = all.find((x) => x.startsWith(`${name}=`));
  return c ? { pair: c.split(';')[0], raw: c } : null;
};

/**
 * Full browser-style login. `browser` controls which cookies the callback
 * request carries (to test the login-state binding).
 */
export async function sso(
  api: string,
  user: { email: string; sub?: string; verified?: boolean; expiresIn?: number },
  opts: { returnTo?: string; sendStateCookie?: boolean } = {},
) {
  await kc('/_next', {
    sub: user.sub ?? `kc-${user.email}`,
    email: user.email,
    email_verified: user.verified ?? true,
    expiresIn: user.expiresIn,
  });
  const start = await fetch(
    `${api}/auth/oidc/login${
      opts.returnTo ? `?returnTo=${encodeURIComponent(opts.returnTo)}` : ''
    }`,
    { redirect: 'manual' },
  );
  const stateCookie = cookieOf(start.headers, 'cz_oidc_state');
  const authorize = start.headers.get('location');
  const toCallback = await fetch(authorize, { redirect: 'manual' });
  const callbackUrl = toCallback.headers.get('location');
  const cb = await fetch(callbackUrl, {
    redirect: 'manual',
    headers:
      opts.sendStateCookie === false || !stateCookie
        ? {}
        : { cookie: stateCookie.pair },
  });
  const session = cookieOf(cb.headers, 'cz_session');
  return {
    authorize,
    callbackUrl,
    stateCookie,
    location: cb.headers.get('location') ?? '',
    session: session?.pair ?? '',
    sessionRaw: session?.raw ?? '',
    status: cb.status,
  };
}

export const csrf = { 'x-carbonoz-csrf': '1' };
