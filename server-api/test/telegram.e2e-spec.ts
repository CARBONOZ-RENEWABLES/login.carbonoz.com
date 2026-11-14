/**
 * Telegram integration end to end, against the real API, MongoDB and Redis.
 * Telegram itself is a local fake server (TELEGRAM_API_URL): no real bot, no
 * real chat, no message leaves this machine. All data is synthetic.
 */
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import {
  DEFAULT_THRESHOLDS,
  FLEET_IDLE,
  FleetRow,
} from '../src/telegram/telegram-alerts';
import { TelegramApiError } from '../src/telegram/telegram-api';
import { TelegramLinkService } from '../src/telegram/telegram-link.service';
import {
  LOCK_MS,
  MAX_AGE_MS,
  TelegramNotifierService,
} from '../src/telegram/telegram-notifier.service';
import { TelegramSnapshotService } from '../src/telegram/telegram-snapshot.service';
import { startApi, TestApi } from './support/app';
import {
  adminToken,
  call,
  db,
  ingest,
  processed,
  provision,
  reading,
  signup,
} from './support/http';

const SECRET = 'e2e-webhook-secret-0123456789abcdef';
const DEFAULT_T = { ...DEFAULT_THRESHOLDS };
let t: TestApi;
const prisma = db();
let admin: string;
let server: Server;
/** Every sendMessage the fake Telegram received. */
const sent: { chat_id: string; text: string }[] = [];
let updateId = 1000;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const payload = body ? JSON.parse(body) : {};
      if (req.url?.endsWith('/sendMessage'))
        sent.push({ chat_id: String(payload.chat_id), text: payload.text });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({ ok: true, result: { message_id: sent.length } }),
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  t = await startApi({
    TELEGRAM_ENABLED: 'true',
    TELEGRAM_BOT_TOKEN: 'e2e-fake-token',
    TELEGRAM_BOT_USERNAME: 'carbonoz_test_bot',
    TELEGRAM_WEBHOOK_SECRET: SECRET,
    TELEGRAM_API_URL: `http://127.0.0.1:${
      (server.address() as AddressInfo).port
    }`,
    // The background loop stays off; the tests drive evaluate/deliver.
    TELEGRAM_NOTIFICATIONS_ENABLED: 'false',
    TELEGRAM_MAX_MESSAGES_PER_HOUR: '3',
  });
  admin = await adminToken(t.api);
});
afterAll(async () => {
  await prisma.$disconnect();
  await t.close();
  server.close();
});

const chat = (id: number, type = 'private') => ({ id, type });
async function say(
  text: string,
  chatId: number,
  opts: { type?: string; secret?: string | null } = {},
) {
  const before = sent.length;
  const r = await call(t.api, 'POST', '/telegram/webhook', {
    headers:
      opts.secret === null
        ? {}
        : { 'x-telegram-bot-api-secret-token': opts.secret ?? SECRET },
    body: {
      update_id: ++updateId,
      message: {
        message_id: 1,
        text,
        chat: chat(chatId, opts.type),
        from: { id: chatId },
      },
    },
  });
  return {
    status: r.status,
    reply:
      sent.slice(before).find((m) => m.chat_id === String(chatId))?.text ??
      null,
  };
}
const code = async (token: string) =>
  (await call(t.api, 'POST', '/telegram/link-code', { token })).data.data
    .code as string;

/** A customer with one site that reports a real (synthetic) reading through ingestion. */
async function customer(prefix: string, soc: number | null) {
  const owner = await signup(t.api, prefix);
  const p = await provision(t.api, admin, owner.user.id);
  await prisma.site.update({
    where: { id: p.site.id },
    data: { name: `${prefix} roof`, timezone: 'Africa/Kigali' },
  });
  if (soc != null) {
    const m = reading({
      measurements: {
        pvPower: 0,
        loadPower: 900,
        gridPower: -100,
        batteryPower: -800,
        soc,
      },
    });
    expect((await ingest(t.api, p.key, m)).status).toBe(202);
    await processed(prisma, m.messageId as string);
  }
  return { owner, p };
}

describe('feature flag and webhook protection', () => {
  it('a wrong or missing secret token is refused, nothing is answered', async () => {
    expect(
      (await say('/help', 9001, { secret: 'wrong-secret-wrong-secret-xx' }))
        .status,
    ).toBe(404);
    expect((await say('/help', 9001, { secret: null })).status).toBe(404);
    expect(sent.filter((m) => m.chat_id === '9001')).toEqual([]);
    expect((await say('/help', 9001)).reply).toContain('/status');
  });

  it('switched off: status says so, linking and the webhook answer 404', async () => {
    const u = await signup(t.api, 'tg-off');
    process.env.TELEGRAM_ENABLED = 'false';
    try {
      expect(
        (await call(t.api, 'GET', '/telegram', { token: u.token })).data.data,
      ).toEqual({ enabled: false });
      expect(
        (await call(t.api, 'POST', '/telegram/link-code', { token: u.token }))
          .status,
      ).toBe(404);
      expect((await say('/help', 9002)).status).toBe(404);
    } finally {
      process.env.TELEGRAM_ENABLED = 'true';
    }
  });
});

describe('secure linking', () => {
  it('a website code links the chat once; the same code never works again', async () => {
    const { owner } = await customer('tg-link', 55);
    const c = await code(owner.token);
    expect(c).toMatch(/^[A-Z2-9]{10}$/);
    expect((await say(`/start ${c}`, 101)).reply).toContain('Connected');
    expect((await say(`/link ${c}`, 102)).reply).toContain('not valid');
    const status = (
      await call(t.api, 'GET', '/telegram', { token: owner.token })
    ).data.data;
    expect(status).toMatchObject({
      enabled: true,
      linked: true,
      botUsername: 'carbonoz_test_bot',
    });
    expect(JSON.stringify(status)).not.toContain('101'); // the chat id is never returned
    // Only the hash is stored.
    expect(
      await prisma.telegramLinkCode.count({ where: { codeHash: c } }),
    ).toBe(0);
  });

  it('an expired code is refused', async () => {
    const u = await signup(t.api, 'tg-exp');
    const c = await code(u.token);
    await prisma.telegramLinkCode.updateMany({
      where: { userId: u.user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await say(`/link ${c}`, 103)).reply).toContain('expired');
  });

  it('five wrong codes lock the chat, even against a valid code', async () => {
    const u = await signup(t.api, 'tg-brute');
    for (let i = 0; i < 5; i++) await say('/link AAAAAAAAAA', 104);
    expect((await say(`/link ${await code(u.token)}`, 104)).reply).toContain(
      'Too many wrong codes',
    );
    expect(
      await prisma.telegramLink.count({
        where: { userId: u.user.id, revokedAt: null },
      }),
    ).toBe(0);
  });

  it('works only in a private chat', async () => {
    const u = await signup(t.api, 'tg-group');
    expect(
      (await say(`/link ${await code(u.token)}`, -105, { type: 'group' }))
        .reply,
    ).toContain('private chat');
  });

  it('a new link replaces the old one; /unlink and the website both revoke', async () => {
    const u = await signup(t.api, 'tg-relink');
    await say(`/link ${await code(u.token)}`, 106);
    await say(`/link ${await code(u.token)}`, 107);
    expect((await say('/status', 106)).reply).toContain('not connected');
    expect((await say('/unlink', 107)).reply).toContain('Disconnected');
    await say(`/link ${await code(u.token)}`, 108);
    expect(
      (await call(t.api, 'DELETE', '/telegram/link', { token: u.token })).data
        .data.revoked,
    ).toBe(true);
    expect((await say('/status', 108)).reply).toContain('not connected');
  });
});

describe("commands show only the user's own sites, with real readings", () => {
  it('status, battery, sites and site selection; another customer stays invisible', async () => {
    const a = await customer('tg-alpha', 47);
    const b = await customer('tg-bravo', 81);
    await say(`/link ${await code(a.owner.token)}`, 201);
    await say(`/link ${await code(b.owner.token)}`, 202);

    const status = (await say('/status', 201)).reply as string;
    expect(status).toContain('tg-alpha roof');
    expect(status).toContain('🟢 Live');
    expect(status).toContain('Battery: 47%');
    expect(status).toContain('exporting');
    const battery = (await say('/battery', 201)).reply as string;
    expect(battery).toContain('State of charge: 47%');
    expect(battery).toContain('discharging');

    const sites = (await say('/sites', 202)).reply as string;
    expect(sites).toContain('tg-bravo roof');
    expect(sites).not.toContain('tg-alpha');
    // Numbers pick only from the user's own list.
    expect((await say('/site 2', 202)).reply).toContain('Use a number');
    expect((await say('/status 1', 202)).reply).toContain('tg-bravo roof');

    // Preferences: a foreign site id is refused server-side.
    const r = await call(t.api, 'PATCH', '/telegram/preferences', {
      token: b.owner.token,
      body: { siteIds: [a.p.site.id] },
    });
    expect(r.status).toBe(404);
  });

  it('a site without readings says so; nothing is made up', async () => {
    const c = await customer('tg-empty', null);
    await say(`/link ${await code(c.owner.token)}`, 203);
    const reply = (await say('/battery', 203)).reply as string;
    expect(reply).toContain('has not reported any reading');
    expect(reply).not.toMatch(/\d+%/);
  });

  it('help and unknown commands', async () => {
    expect((await say('/help', 204)).reply).toContain('/battery');
    expect((await say('/nonsense', 204)).reply).toContain('Unknown command');
    expect((await say('/status', 204)).reply).toContain('not connected');
  });
});

describe('notifications', () => {
  const notifier = () => t.app.get(TelegramNotifierService);
  // The e2e database holds installations of every suite, mostly quiet: the
  // fleet the outage check sees is decided per test here (the real query is
  // tested on its own below). The outage logic and its saved state are real.
  let fleet: jest.SpyInstance;
  beforeEach(async () => {
    await t.app.get(RedisService).del('telegram:fleet-state');
    // The app's notifier keeps its last state in memory too: start each test clean.
    Object.assign(notifier(), { fleet: FLEET_IDLE });
    fleet = jest.spyOn(notifier(), 'fleetRows').mockResolvedValue([]);
  });
  afterEach(() => fleet.mockRestore());
  /** The outbox is shared: park other tests' pending messages so counts are this test's. */
  const isolate = (linkId: string) =>
    prisma.telegramMessage.updateMany({
      where: { status: 'PENDING', linkId: { not: linkId } },
      data: { status: 'DROPPED' },
    });

  it('low battery is announced once, then its recovery', async () => {
    const c = await customer('tg-low', 12);
    await say(`/link ${await code(c.owner.token)}`, 301);
    const link = await prisma.telegramLink.findFirstOrThrow({
      where: { chatId: '301', revokedAt: null },
    });

    await notifier().evaluate();
    await notifier().evaluate(); // still low: no second message
    await isolate(link.id);
    const queued = await prisma.telegramMessage.findMany({
      where: { linkId: link.id },
    });
    expect(queued).toHaveLength(1);
    expect(queued[0].text).toContain('Low battery at tg-low roof: 12%');

    const before = sent.length;
    expect(
      await notifier().deliver({
        sendMessage: async (id, text) => sent.push({ chat_id: id, text }),
      }),
    ).toMatchObject({ sent: 1 });
    expect(sent.slice(before)[0]).toMatchObject({ chat_id: '301' });

    // Recovery needs threshold + 5 (hysteresis).
    const m = reading({
      measurements: {
        pvPower: 3000,
        loadPower: 500,
        gridPower: 0,
        batteryPower: 2500,
        soc: 40,
      },
    });
    await ingest(t.api, c.p.key, m);
    await processed(prisma, m.messageId as string);
    await notifier().evaluate();
    const texts = (
      await prisma.telegramMessage.findMany({
        where: { linkId: link.id },
        orderBy: { createdAt: 'asc' },
      })
    ).map((x) => x.text);
    expect(texts[1]).toContain('recovered: 40%');
  });

  it('a site with no data raises "no data", not an alarm', async () => {
    const c = await customer('tg-nodata', null);
    await say(`/link ${await code(c.owner.token)}`, 302);
    await notifier().evaluate();
    const link = await prisma.telegramLink.findFirstOrThrow({
      where: { chatId: '302', revokedAt: null },
    });
    const [msg] = await prisma.telegramMessage.findMany({
      where: { linkId: link.id },
    });
    expect(msg.text).toContain('No data from tg-nodata roof');
  });

  it('retries on 429 and 5xx, gives up after 5 attempts, stops for a blocked chat', async () => {
    const c = await customer('tg-fail', 10);
    await say(`/link ${await code(c.owner.token)}`, 303);
    await notifier().evaluate();
    const link = await prisma.telegramLink.findFirstOrThrow({
      where: { chatId: '303', revokedAt: null },
    });
    await isolate(link.id);
    const msg = await prisma.telegramMessage.findFirstOrThrow({
      where: { linkId: link.id },
    });

    const now = new Date();
    await notifier().deliver(
      {
        sendMessage: async () => {
          throw new TelegramApiError('sendMessage: HTTP 429', 429, 30, false);
        },
      },
      now,
    );
    let row = await prisma.telegramMessage.findUniqueOrThrow({
      where: { id: msg.id },
    });
    expect(row.status).toBe('PENDING');
    expect(row.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(
      now.getTime() + 30_000,
    );

    for (let i = 0; i < 4; i++) {
      await prisma.telegramMessage.update({
        where: { id: msg.id },
        data: { nextAttemptAt: new Date(0) },
      });
      await notifier().deliver({
        sendMessage: async () => {
          throw new TelegramApiError('sendMessage: HTTP 502', 502, null, false);
        },
      });
    }
    row = await prisma.telegramMessage.findUniqueOrThrow({
      where: { id: msg.id },
    });
    expect([row.status, row.attempts]).toEqual(['DEAD', 5]);

    // 403: the user blocked the bot -> no retry, link revoked.
    const m2 = await prisma.telegramMessage.create({
      data: {
        linkId: link.id,
        chatId: '303',
        dedupeKey: `x-${Date.now()}`,
        text: 'x',
      },
    });
    await notifier().deliver({
      sendMessage: async () => {
        throw new TelegramApiError('sendMessage: HTTP 403', 403, null, true);
      },
    });
    expect(
      (await prisma.telegramMessage.findUniqueOrThrow({ where: { id: m2.id } }))
        .status,
    ).toBe('DEAD');
    expect(
      (await prisma.telegramLink.findUniqueOrThrow({ where: { id: link.id } }))
        .revokedBy,
    ).toBe('blocked');
  });

  it('rate limit: over the hourly limit messages are dropped and one notice is sent', async () => {
    const c = await customer('tg-rate', 50);
    await say(`/link ${await code(c.owner.token)}`, 304);
    const link = await prisma.telegramLink.findFirstOrThrow({
      where: { chatId: '304', revokedAt: null },
    });
    const now = new Date();
    for (let i = 0; i < 6; i++)
      await notifier().enqueue(
        link,
        { siteId: null, kind: 'notice' },
        `rate-${link.id}-${i}`,
        `alert ${i}`,
        now,
      );
    const rows = await prisma.telegramMessage.findMany({
      where: { linkId: link.id },
    });
    expect(
      rows.filter((r) => r.status === 'PENDING' && r.text.startsWith('alert')),
    ).toHaveLength(3);
    expect(rows.filter((r) => r.status === 'DROPPED')).toHaveLength(3);
    expect(rows.filter((r) => r.text.startsWith('Many alerts'))).toHaveLength(
      1,
    );
    // The same key is never queued twice.
    expect(
      await notifier().enqueue(
        link,
        { siteId: null, kind: 'notice' },
        `rate-${link.id}-0`,
        'again',
        now,
      ),
    ).toBe(false);
  });

  it('admins get no alerts until they choose sites; stats and revoke are admin-only', async () => {
    await say(`/link ${await code(admin)}`, 305);
    const link = await prisma.telegramLink.findFirstOrThrow({
      where: { chatId: '305', revokedAt: null },
    });
    await notifier().evaluate();
    expect(
      await prisma.telegramMessage.count({ where: { linkId: link.id } }),
    ).toBe(0);

    const u = await signup(t.api, 'tg-notadmin');
    expect(
      (await call(t.api, 'GET', '/admin/telegram/stats', { token: u.token }))
        .status,
    ).toBe(403);
    const stats = (
      await call(t.api, 'GET', '/admin/telegram/stats', { token: admin })
    ).data.data;
    expect(stats.activeLinks).toBeGreaterThan(0);
    expect(JSON.stringify(stats)).not.toMatch(/"chatId"|"text"/);
    expect(
      (
        await call(t.api, 'DELETE', `/admin/telegram/links/${link.userId}`, {
          token: admin,
        })
      ).data.data.revoked,
    ).toBe(true);
    expect((await say('/status', 305)).reply).toContain('not connected');
  });

  /** A second installation on the customer's site, with one reading `minAgo` minutes old. */
  async function secondInstallation(
    c: Awaited<ReturnType<typeof customer>>,
    name: string,
    minAgo: number,
    soc: number,
  ) {
    const inst = await c.p.post(`/admin/sites/${c.p.site.id}/installations`, {
      name,
    });
    const cred = await c.p.post(`/admin/installations/${inst.id}/credentials`, {
      type: 'API_KEY',
    });
    const m = reading({
      timestamp: new Date(Date.now() - minAgo * 60_000).toISOString(),
      measurements: {
        pvPower: 0,
        loadPower: 500,
        gridPower: 0,
        batteryPower: -500,
        soc,
      },
    });
    expect((await ingest(t.api, cred.apiKey, m)).status).toBe(202);
    await processed(prisma, m.messageId as string);
    return inst.id as string;
  }
  const linkOf = (chatId: number) =>
    prisma.telegramLink.findFirstOrThrow({
      where: { chatId: String(chatId), revokedAt: null },
    });
  const openIncidents = (linkId: string) =>
    prisma.telegramIncident.findMany({ where: { linkId, resolvedAt: null } });
  const textsOf = async (linkId: string) =>
    (await prisma.telegramMessage.findMany({ where: { linkId } })).map(
      (m) => m.text,
    );

  it('H1: a delayed installation with a low SoC raises no low-battery alert while another is live', async () => {
    const c = await customer('tg-multi', 80);
    const garage = await secondInstallation(c, 'Garage Pi', 30, 8);
    await say(`/link ${await code(c.owner.token)}`, 310);
    const link = await linkOf(310);
    // Threshold 50%: averaging in the delayed 8% would give 44%, a false alert.
    await prisma.telegramLink.update({
      where: { id: link.id },
      data: { lowSocPct: 50 },
    });
    await notifier().evaluate();

    const open = await openIncidents(link.id);
    expect(open.map((i) => i.kind)).toEqual(['STALE']);
    expect(open[0].key).toContain(garage);
    const texts = await textsOf(link.id);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain('Data delayed at tg-multi roof – Garage Pi');
    expect(texts.join('\n')).not.toContain('Low battery');

    const battery = (await say('/battery', 310)).reply as string;
    expect(battery).toContain('State of charge: 80%');
    expect(battery).toContain('Garage Pi is delayed');
  });

  it('H1: an offline installation is reported on its own; the live one is not marked offline', async () => {
    const c = await customer('tg-one-off', 70);
    const shed = await secondInstallation(c, 'Shed Pi', 90, 60);
    await say(`/link ${await code(c.owner.token)}`, 311);
    const link = await linkOf(311);
    await notifier().evaluate();

    const open = await openIncidents(link.id);
    expect(open.map((i) => [i.kind, i.key.endsWith(shed)])).toEqual([
      ['OFFLINE', true],
    ]);
    expect((await textsOf(link.id))[0]).toContain(
      'tg-one-off roof – Shed Pi is offline',
    );
  });

  it('M2: queued messages are discarded after /unlink, an admin revoke, or loss of site access on retry', async () => {
    const tried: string[] = [];
    const record = async (id: string) => {
      tried.push(id);
    };
    const queued = async (prefix: string, chatId: number) => {
      const c = await customer(prefix, 10);
      await say(`/link ${await code(c.owner.token)}`, chatId);
      const link = await linkOf(chatId);
      await notifier().evaluate();
      await isolate(link.id);
      const msg = await prisma.telegramMessage.findFirstOrThrow({
        where: { linkId: link.id, status: 'PENDING' },
      });
      expect(msg.siteId).toBe(c.p.site.id);
      return { c, link, msg };
    };
    const state = (id: string) =>
      prisma.telegramMessage.findUniqueOrThrow({ where: { id } });

    // /unlink in Telegram
    const a = await queued('tg-m2-unlink', 320);
    await say('/unlink', 320);
    expect(await notifier().deliver({ sendMessage: record })).toMatchObject({
      sent: 0,
      discarded: 1,
    });
    expect(await state(a.msg.id)).toMatchObject({
      status: 'DROPPED',
      lastError: 'discarded: unlinked',
    });

    // Admin revoke
    const b = await queued('tg-m2-admin', 321);
    await call(t.api, 'DELETE', `/admin/telegram/links/${b.link.userId}`, {
      token: admin,
    });
    await notifier().deliver({ sendMessage: record });
    expect((await state(b.msg.id)).lastError).toBe('discarded: unlinked');

    // Access removed while the message waits for a retry
    const d = await queued('tg-m2-access', 322);
    await notifier().deliver({
      sendMessage: async () => {
        throw new TelegramApiError('sendMessage: HTTP 502', 502, null, false);
      },
    });
    expect((await state(d.msg.id)).status).toBe('PENDING');
    await prisma.customerMember.deleteMany({
      where: { userId: d.link.userId },
    });
    await prisma.telegramMessage.update({
      where: { id: d.msg.id },
      data: { nextAttemptAt: new Date(0) },
    });
    await notifier().deliver({ sendMessage: record });
    expect(await state(d.msg.id)).toMatchObject({
      status: 'DROPPED',
      lastError: 'discarded: no_access',
    });

    expect(tried).toEqual([]); // nothing reached Telegram
    // No site data in the reason or in the stats.
    const stats = (
      await call(t.api, 'GET', '/admin/telegram/stats', { token: admin })
    ).data.data;
    expect(JSON.stringify(stats)).not.toContain('tg-m2');
  });

  it('a 403 for an old chat never unlinks the newer chat of the same user', async () => {
    const c = await customer('tg-403-race', 10);
    await say(`/link ${await code(c.owner.token)}`, 330);
    const old = await linkOf(330);
    await notifier().evaluate();
    await isolate(old.id);
    const next = await code(c.owner.token);
    // The user links a new chat while the old chat's message is being sent; then the old chat answers 403.
    await notifier().deliver({
      sendMessage: async () => {
        await say(`/link ${next}`, 331);
        throw new TelegramApiError(
          'sendMessage: HTTP 403 Forbidden: bot was blocked by the user',
          403,
          null,
          true,
        );
      },
    });
    const fresh = await linkOf(331);
    expect(fresh.revokedAt).toBeNull();
    expect(fresh.userId).toBe(old.userId);
    expect(
      (await prisma.telegramLink.findUniqueOrThrow({ where: { id: old.id } }))
        .revokedBy,
    ).toBe('relinked');
  });

  const send = async (key: string, m: Record<string, unknown>) => {
    expect((await ingest(t.api, key, m)).status).toBe(202);
    await processed(prisma, m.messageId as string);
  };
  /** `n` synthetic installations stored / measured the given minutes ago. */
  const fleetOf = (
    n: number,
    storedMin: number,
    measuredMin = storedMin,
    at = Date.now(),
  ) =>
    Array.from({ length: n }, (): FleetRow & { installationId: string } => ({
      installationId: `synthetic-${n}`,
      storedAt: at - storedMin * 60_000,
      measuredAt: at - measuredMin * 60_000,
    }));
  const fleetState = async () =>
    JSON.parse(
      (await t.app.get(RedisService).get('telegram:fleet-state')) as string,
    );

  it('A: an outage, then a backlog longer than the old grace period: no alert, no false "reporting again"', async () => {
    const c = await customer('tg-backlog', null);
    await send(
      c.p.key,
      reading({ timestamp: new Date(Date.now() - 90 * 60_000).toISOString() }),
    );
    await say(`/link ${await code(c.owner.token)}`, 340);
    const link = await linkOf(340);
    const pass = async (rows: FleetRow[], at = new Date()) => {
      fleet.mockResolvedValue(rows);
      return (await notifier().evaluate(at)).suppressed;
    };

    // Healthy fleet before: baseline. (This site was already offline: shown below.)
    fleet.mockResolvedValue(fleetOf(10, 1));
    expect((await notifier().platformStatus(new Date(), DEFAULT_T)).phase).toBe(
      'healthy',
    );
    // Outage: nothing stored for 30 min.
    expect(await pass(fleetOf(10, 30))).toBe(true);
    // Storing again, but a 2-hour backlog: stored now, measured long ago.
    expect(await pass(fleetOf(10, 0, 120))).toBe(true);
    const catchingUp = await fleetState();
    expect(catchingUp.storingSince).toEqual(expect.any(Number));
    // The site's own backlog is stored too: still 60 min old.
    await send(
      c.p.key,
      reading({ timestamp: new Date(Date.now() - 60 * 60_000).toISOString() }),
    );
    // 20 min later (past the old 15-min grace), backlog still behind.
    const later = Date.now() + 20 * 60_000;
    expect(await pass(fleetOf(10, 0, 40, later), new Date(later))).toBe(true);
    // Still the same catch-up phase, not a new outage.
    expect(await fleetState()).toMatchObject({
      storingSince: catchingUp.storingSince,
    });
    expect(await openIncidents(link.id)).toEqual([]);

    // Caught up: fresh measurements everywhere, this site reports live again.
    await send(c.p.key, reading());
    expect(await pass(fleetOf(10, 0, 1))).toBe(false);
    expect(await openIncidents(link.id)).toEqual([]);
    expect(await textsOf(link.id)).toEqual([]);
    const stats = (
      await call(t.api, 'GET', '/admin/telegram/stats', { token: admin })
    ).data.data;
    expect(stats.ingestionOutageSuspectedSince).toBeNull();
  });

  it('A: the outage state survives a restart (saved in Redis)', async () => {
    fleet.mockResolvedValue(fleetOf(10, 1));
    await notifier().platformStatus(new Date(), DEFAULT_T);
    fleet.mockResolvedValue(fleetOf(10, 30));
    await notifier().platformStatus(new Date(), DEFAULT_T);
    // A fresh instance (as after a restart) continues from the saved state.
    const next = new TelegramNotifierService(
      t.app.get(PrismaService),
      t.app.get(TelegramLinkService),
      t.app.get(TelegramSnapshotService),
      t.app.get(RedisService),
    );
    jest.spyOn(next, 'fleetRows').mockResolvedValue(fleetOf(10, 0, 90));
    expect(await next.platformStatus(new Date(), DEFAULT_T)).toMatchObject({
      phase: 'catching_up',
      suppress: true,
    });
  });

  it('L1: after a failed save, the older copy in Redis does not override the newer state', async () => {
    const redis = t.app.get(RedisService);
    fleet.mockResolvedValue(fleetOf(10, 1));
    expect((await notifier().platformStatus(new Date(), DEFAULT_T)).phase).toBe(
      'healthy',
    ); // saved
    const set = jest
      .spyOn(redis, 'set')
      .mockRejectedValueOnce(new Error('synthetic Redis failure'));
    fleet.mockResolvedValue(fleetOf(10, 30));
    expect((await notifier().platformStatus(new Date(), DEFAULT_T)).phase).toBe(
      'outage',
    ); // not saved
    expect(set).toHaveBeenCalled();
    expect(
      JSON.parse((await redis.get('telegram:fleet-state')) as string)
        .suspectedSince,
    ).toBeNull(); // Redis still holds the older, healthy state
    set.mockRestore();
    // Storing again with a backlog: continues the outage (memory is newer), not "healthy".
    fleet.mockResolvedValue(fleetOf(10, 0, 90));
    expect((await notifier().platformStatus(new Date(), DEFAULT_T)).phase).toBe(
      'catching_up',
    );
    expect(
      JSON.parse((await redis.get('telegram:fleet-state')) as string)
        .suspectedSince,
    ).toEqual(expect.any(Number)); // saved again
  });

  it('A / G: the real fleet query tells stored time from measured time, and skips inactive and old installations', async () => {
    fleet.mockRestore();
    const c = await customer('tg-fleet', null);
    // Backlog: stored now, measured 2 h ago.
    await send(
      c.p.key,
      reading({ timestamp: new Date(Date.now() - 120 * 60_000).toISOString() }),
    );
    const inactive = await secondInstallation(c, 'Inactive Pi', 1, 50);
    const old = await secondInstallation(c, 'Old Pi', 1, 50);
    await prisma.installation.update({
      where: { id: inactive },
      data: { active: false },
    });
    await prisma.installation.update({
      where: { id: old },
      data: { lastSeenAt: new Date(Date.now() - 8 * 24 * 3600_000) },
    });
    const rows = await notifier().fleetRows(new Date());
    const mine = rows.find((r) => r.installationId === c.p.installation.id);
    expect(Date.now() - (mine?.storedAt as number)).toBeLessThan(60_000);
    expect(Date.now() - (mine?.measuredAt as number)).toBeGreaterThan(
      119 * 60_000,
    );
    expect(rows.map((r) => r.installationId)).not.toContain(inactive);
    expect(rows.map((r) => r.installationId)).not.toContain(old);
    // A fresh measurement moves measuredAt forward; an older one never moves it back.
    await send(c.p.key, reading());
    await send(
      c.p.key,
      reading({ timestamp: new Date(Date.now() - 300 * 60_000).toISOString() }),
    );
    const after = (await notifier().fleetRows(new Date())).find(
      (r) => r.installationId === c.p.installation.id,
    );
    expect(Date.now() - (after?.measuredAt as number)).toBeLessThan(60_000);
    const r = await notifier().platformStatus(new Date(), DEFAULT_T);
    expect(typeof r.suppress).toBe('boolean');
  });

  it('B: an alarm missing from one payload is neither cleared nor re-announced; a confirmed clear is announced once', async () => {
    const c = await customer('tg-alarm', 80);
    await say(`/link ${await code(c.owner.token)}`, 360);
    const link = await linkOf(360);
    const withAlarm = () =>
      reading({
        alarms: [
          { code: 'GRID_LOSS', message: 'Grid lost', severity: 'critical' },
        ],
      });
    const alarmIncident = async () =>
      (await openIncidents(link.id)).filter((i) => i.kind === 'ALARM');

    await send(c.p.key, withAlarm());
    await notifier().evaluate();
    expect((await textsOf(link.id)).join('\n')).toContain('Grid lost');

    // Intermittent list: absent, present (a new SolarEvent row), absent again.
    await send(c.p.key, reading());
    await notifier().evaluate();
    expect((await alarmIncident())[0].detail).toMatchObject({
      absentSince: expect.any(Number),
    });
    await send(c.p.key, withAlarm());
    await notifier().evaluate();
    expect(
      await prisma.solarEvent.count({
        where: { siteId: c.p.site.id, message: 'Grid lost' },
      }),
    ).toBeGreaterThanOrEqual(2);
    expect((await alarmIncident())[0].detail).toMatchObject({
      absentSince: null,
    });
    await send(c.p.key, reading());
    await notifier().evaluate();
    expect(await textsOf(link.id)).toHaveLength(1); // one alert, no clear yet

    // Absent for longer than alarmClearMs while reporting: confirmed clear.
    const [inc] = await alarmIncident();
    await prisma.telegramIncident.update({
      where: { id: inc.id },
      data: {
        detail: {
          ...(inc.detail as object),
          absentSince: Date.now() - 16 * 60_000,
        },
      },
    });
    await send(c.p.key, reading());
    await notifier().evaluate();
    const texts = await textsOf(link.id);
    expect(texts).toHaveLength(2);
    expect(texts[1]).toContain('Alarm cleared at tg-alarm roof');
  });

  it('D: an alert whose problem is already over is not sent, nor its recovery', async () => {
    const c = await customer('tg-obsolete', 10);
    await say(`/link ${await code(c.owner.token)}`, 351);
    const link = await linkOf(351);
    await notifier().evaluate();
    // Recovered before the alert went out (e.g. notifications were paused).
    await send(
      c.p.key,
      reading({
        measurements: {
          pvPower: 3000,
          loadPower: 500,
          gridPower: 0,
          batteryPower: 2500,
          soc: 60,
        },
      }),
    );
    await notifier().evaluate();
    await isolate(link.id);
    const tried: string[] = [];
    expect(
      await notifier().deliver({
        sendMessage: async (id) => {
          tried.push(id);
        },
      }),
    ).toMatchObject({ sent: 0, discarded: 2 });
    expect(tried).toEqual([]);
    const rows = await prisma.telegramMessage.findMany({
      where: { linkId: link.id },
    });
    expect(rows.map((r) => [r.kind, r.lastError]).sort()).toEqual([
      ['open', 'discarded: obsolete'],
      ['resolved', 'discarded: obsolete'],
    ]);
  });

  it('D: age limits per kind; a recovery waits for its alert and is sent only if the alert was', async () => {
    const c = await customer('tg-age', 50);
    await say(`/link ${await code(c.owner.token)}`, 352);
    const link = await linkOf(352);
    const n = Date.now();
    const incident = (resolved: boolean) =>
      prisma.telegramIncident.create({
        data: {
          linkId: link.id,
          siteId: c.p.site.id,
          kind: 'LOW_SOC',
          key: `age-${n}-${Math.random()}`,
          openedAt: new Date(n),
          resolvedAt: resolved ? new Date(n) : null,
        },
      });
    const msg = (
      kind: string,
      incidentId: string | null,
      ageMs: number,
      status = 'PENDING',
      dedupeKey = `age-${Math.random()}`,
    ) =>
      prisma.telegramMessage.create({
        data: {
          linkId: link.id,
          chatId: link.chatId,
          siteId: incidentId ? c.p.site.id : null,
          incidentId,
          kind,
          dedupeKey,
          text: 'x',
          status,
          createdAt: new Date(n - ageMs),
        },
      });
    const why = async (m: Awaited<ReturnType<typeof msg>>) =>
      notifier().undeliverable(m, new Date(n));

    const open = await incident(false);
    expect(await why(await msg('open', open.id, 30 * 60_000))).toBeNull();
    expect(
      await why(await msg('open', open.id, MAX_AGE_MS.open + 60_000)),
    ).toBe('expired');
    expect(
      await why(await msg('notice', null, MAX_AGE_MS.notice + 60_000)),
    ).toBe('expired');

    const done = async (alertStatus: string, ageMs: number) => {
      const i = await incident(true);
      await msg('open', i.id, ageMs, alertStatus, `${i.id}:open`);
      return why(await msg('resolved', i.id, ageMs));
    };
    expect(await done('SENT', 60 * 60_000)).toBeNull();
    expect(await done('SENT', MAX_AGE_MS.resolved + 60_000)).toBe('expired');
    expect(await done('DROPPED', 60_000)).toBe('obsolete');
    expect(await done('DEAD', 60_000)).toBe('obsolete');
    expect(await done('SENDING', 60_000)).toBe('wait');
  });

  it('G: queued messages are discarded when alerts are switched off or the user is deactivated', async () => {
    const queued = async (prefix: string, chatId: number) => {
      const c = await customer(prefix, 10);
      await say(`/link ${await code(c.owner.token)}`, chatId);
      const link = await linkOf(chatId);
      await notifier().evaluate();
      await isolate(link.id);
      return link;
    };
    const reason = async (linkId: string) =>
      (
        await prisma.telegramMessage.findFirstOrThrow({
          where: { linkId, kind: 'open' },
        })
      ).lastError;
    const tried: string[] = [];
    const api = {
      sendMessage: async (id: string) => {
        tried.push(id);
      },
    };

    const off = await queued('tg-g-off', 370);
    await prisma.telegramLink.update({
      where: { id: off.id },
      data: { notify: false },
    });
    await notifier().deliver(api);
    expect(await reason(off.id)).toBe('discarded: alerts_off');

    const gone = await queued('tg-g-inactive', 371);
    await prisma.user.update({
      where: { id: gone.userId },
      data: { activeStatus: false },
    });
    await notifier().deliver(api);
    expect(await reason(gone.id)).toBe('discarded: user_inactive');
    expect(tried).toEqual([]);
  });

  it('H: the lock is renewed while working; a process that lost it during a long delivery stops', async () => {
    const deps = [
      t.app.get(PrismaService),
      t.app.get(TelegramLinkService),
      t.app.get(TelegramSnapshotService),
      t.app.get(RedisService),
    ] as const;
    const a = new TelegramNotifierService(...deps);
    const b = new TelegramNotifierService(...deps);
    expect(a.instance).not.toBe(b.instance);
    await prisma.solarBridgeLock.updateMany({
      where: { name: 'telegram-notifier' },
      data: { until: new Date(0) },
    });
    const t0 = Date.now();
    const at = (min: number) => new Date(t0 + min * 60_000);
    expect(await a.lock(at(0))).toBe(true);
    expect(await b.lock(at(1))).toBe(false);
    // Renewed at 4 min: still A's at 6 min, past the first lifetime.
    expect(await a.lock(at(4))).toBe(true);
    expect(await b.lock(at(6))).toBe(false);
    // A pauses past the lifetime without renewing: B takes over, A has lost it.
    expect(await b.lock(at(10))).toBe(true);
    expect(await a.lock(at(10))).toBe(false);

    // A long delivery: A starts, is held up past the lifetime, B takes over.
    await prisma.solarBridgeLock.updateMany({
      where: { name: 'telegram-notifier' },
      data: { until: new Date(0) },
    });
    const c = await customer('tg-lock', 50);
    await say(`/link ${await code(c.owner.token)}`, 380);
    const link = await linkOf(380);
    for (let i = 0; i < 3; i++)
      await a.enqueue(
        link,
        { siteId: null, kind: 'notice' },
        `lock-${link.id}-${i}`,
        `notice ${i}`,
        new Date(),
      );
    await isolate(link.id);
    expect(await a.lock()).toBe(true);
    const sentBy: string[] = [];
    const first = await a.deliver(
      {
        sendMessage: async (_id, text) => {
          sentBy.push(`a:${text}`);
          // Held up longer than the lock lifetime; B's pass takes the lock.
          await b.lock(new Date(Date.now() + LOCK_MS + 60_000));
        },
      },
      new Date(),
      () => a.lock(),
    );
    expect(first).toMatchObject({ sent: 1, aborted: true });
    const second = await b.deliver(
      {
        sendMessage: async (_id, text) => {
          sentBy.push(`b:${text}`);
        },
      },
      new Date(),
      () => b.lock(new Date(Date.now() + LOCK_MS + 60_000)),
    );
    expect(second).toMatchObject({ sent: 2, aborted: false });
    expect(sentBy).toEqual(['a:notice 0', 'b:notice 1', 'b:notice 2']);
    await prisma.solarBridgeLock.updateMany({
      where: { name: 'telegram-notifier' },
      data: { until: new Date(0) },
    });
  });
});
