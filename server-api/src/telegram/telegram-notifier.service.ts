import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, TelegramLink, TelegramMessage } from '@prisma/client';
import { randomUUID } from 'crypto';
import { hostname } from 'os';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/redis/redis.service';
import { TelegramApi, TelegramApiError } from './telegram-api';
import {
  AlertKind,
  conditionsNow,
  DEFAULT_THRESHOLDS,
  FLEET,
  FLEET_IDLE,
  FleetPhase,
  FleetRow,
  FleetState,
  fleetStatus,
  OpenIncident,
  openText,
  resolvedText,
  Thresholds,
  transition,
} from './telegram-alerts';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramSnapshotService } from './telegram-snapshot.service';
import { telegramConfig, TelegramConfig } from './telegram.config';

const MAX_ATTEMPTS = 5;
const LEASE_MS = 60_000;
/** Lock lifetime; renewed before every link evaluated and every message sent. */
export const LOCK_MS = 5 * 60_000;
const LOCK_NAME = 'telegram-notifier';
/** Outage state survives an API restart (Redis, like the other Telegram counters). */
const FLEET_KEY = 'telegram:fleet-state';
const FLEET_TTL_S = 8 * 24 * 3600;

/**
 * Oldest a queued message may be when it is sent. An alert that waited longer
 * describes an old state; a recovery is only worth sending while its alert
 * was actually delivered. See undeliverable().
 */
export const MAX_AGE_MS = {
  open: 2 * 3600_000,
  resolved: 24 * 3600_000,
  notice: 3600_000,
};

export type MessageKind = 'open' | 'resolved' | 'notice';

export interface MessageMeta {
  /** The site the message is about (re-checked before sending); null for account notices. */
  siteId: string | null;
  incidentId?: string | null;
  kind: MessageKind;
}

/**
 * Two separate steps, run by one process at a time (lock row, renewed while
 * working; a process that lost it stops at once):
 *
 *   evaluate()  site state → incidents (open/resolve) → messages in the outbox
 *   deliver()   outbox → Telegram, with retries, back-off and Telegram's 429
 *
 * An incident is opened once and stays open until its condition clears, so
 * the same unresolved situation is never announced twice. Off unless
 * TELEGRAM_NOTIFICATIONS_ENABLED=true (and the bot itself is enabled).
 *
 * Every send is re-authorised: a message queued for a chat that was unlinked,
 * or for a site its user may no longer see, is discarded, never sent; so is
 * one that has become obsolete or too old.
 */
@Injectable()
export class TelegramNotifierService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Telegram');
  /** Unique per instance, also within one process (as the ingest bridge's lock). */
  readonly instance = `${hostname()}:${process.pid}:${randomUUID().slice(
    0,
    8,
  )}`;
  private timer?: NodeJS.Timeout;
  private stopped = false;
  /** Last known outage state, used when Redis is not reachable. */
  private fleet: FleetState = FLEET_IDLE;
  private fleetPhase: FleetPhase = 'healthy';

  constructor(
    private readonly prisma: PrismaService,
    private readonly links: TelegramLinkService,
    private readonly snapshots: TelegramSnapshotService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit() {
    const cfg = telegramConfig();
    if (!cfg.notificationsEnabled) return;
    const loop = async () => {
      if (this.stopped) return;
      try {
        await this.pass(new TelegramApi(cfg));
      } catch (e) {
        this.logger.error(`notifier: ${e.message}`);
      }
      if (!this.stopped)
        this.timer = setTimeout(loop, cfg.evaluateEveryMs).unref();
    };
    this.timer = setTimeout(loop, 10_000).unref();
  }

  async onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    // Let a successor take over without waiting LOCK_MS.
    await this.prisma.solarBridgeLock
      ?.updateMany({
        where: { name: LOCK_NAME, owner: this.instance },
        data: { until: new Date(0) },
      })
      .catch(() => undefined);
  }

  /** One evaluate + deliver pass, only while this instance holds the lock. */
  async pass(api: Pick<TelegramApi, 'sendMessage'>, cfg = telegramConfig()) {
    if (!(await this.lock())) return null;
    const holding = () => this.lock();
    const evaluated = await this.evaluate(new Date(), cfg, holding);
    if (evaluated.aborted) return { evaluated, delivered: null };
    return {
      evaluated,
      delivered: await this.deliver(api, new Date(), holding),
    };
  }

  private thresholds(cfg: TelegramConfig): Thresholds {
    return {
      ...DEFAULT_THRESHOLDS,
      staleMs: cfg.staleMs,
      offlineMs: cfg.offlineMs,
    };
  }

  /**
   * Per recently stored installation: when the platform last stored a reading
   * (Installation.lastSeenAt) and the newest measurement time it stored
   * (max SolarDevice.lastSeenAt). Public for tests.
   */
  async fleetRows(
    now: Date,
  ): Promise<(FleetRow & { installationId: string })[]> {
    const installations = await this.prisma.installation.findMany({
      where: {
        active: true,
        lastSeenAt: { gte: new Date(now.getTime() - FLEET.lookbackMs) },
      },
      select: { id: true, lastSeenAt: true },
    });
    if (!installations.length) return [];
    const measured = await this.prisma.solarDevice.groupBy({
      by: ['installationId'],
      where: { installationId: { in: installations.map((i) => i.id) } },
      _max: { lastSeenAt: true },
    });
    const byId = new Map(
      measured.map((m) => [m.installationId, m._max.lastSeenAt]),
    );
    return installations.map((i) => ({
      installationId: i.id,
      storedAt: i.lastSeenAt?.getTime() ?? null,
      measuredAt: byId.get(i.id)?.getTime() ?? null,
    }));
  }

  /**
   * The newer of the saved (Redis) and in-memory state: after a failed save
   * the copy in Redis is older and must not win; after a restart memory is
   * empty and Redis wins.
   */
  private async loadFleet(): Promise<FleetState> {
    let saved: FleetState | null = null;
    try {
      const raw = await this.redis.get(FLEET_KEY);
      if (raw) saved = { ...FLEET_IDLE, ...JSON.parse(raw) };
    } catch (e) {
      this.logger.warn(`fleet state not read: ${e.message}`);
    }
    return saved && saved.updatedAt >= this.fleet.updatedAt
      ? saved
      : this.fleet;
  }

  private async saveFleet(state: FleetState) {
    this.fleet = state;
    try {
      await this.redis.set(FLEET_KEY, JSON.stringify(state), FLEET_TTL_S);
    } catch (e) {
      this.logger.warn(`fleet state not saved: ${e.message}`);
    }
  }

  /** Is a Carbonoz-side outage, or its backlog, still going on? See fleetStatus. Public for tests. */
  async platformStatus(now: Date, t: Thresholds) {
    const rows = await this.fleetRows(now);
    const prev = await this.loadFleet();
    const r = fleetStatus(rows, now.getTime(), prev, t);
    if (r.phase !== this.fleetPhase) {
      const msg = {
        outage: `ingestion outage suspected: stale/offline alerts paused (${rows.length} installations)`,
        catching_up:
          'ingestion storing again, backlog not caught up: alerts stay paused',
        healthy: 'ingestion caught up: stale/offline alerts resume',
        gave_up: `backlog not caught up after ${
          FLEET.maxCatchUpMs / 3600_000
        } h: stale/offline alerts resume`,
      }[r.phase];
      if (r.phase === 'healthy') this.logger.log(msg);
      else this.logger.warn(msg);
      this.fleetPhase = r.phase;
    }
    await this.saveFleet(r.state);
    return {
      suppress: r.suppress,
      phase: r.phase,
      since: r.state.suspectedSince,
      liveShare: r.liveShare,
    };
  }

  /** One pass over every active link. Returns counts for logs and tests. */
  async evaluate(
    now = new Date(),
    cfg = telegramConfig(),
    /** Called before each link: false = the lock was lost, stop. */
    holding?: () => Promise<boolean>,
  ) {
    const t = this.thresholds(cfg);
    const counts = {
      opened: 0,
      resolved: 0,
      queued: 0,
      suppressed: false,
      aborted: false,
    };
    const { suppress } = await this.platformStatus(now, t);
    counts.suppressed = suppress;
    const links = await this.prisma.telegramLink.findMany({
      where: { revokedAt: null, notify: true },
    });
    for (const link of links) {
      if (holding && !(await holding())) {
        counts.aborted = true;
        this.logger.warn('evaluate stopped: notifier lock lost');
        break;
      }
      const user = await this.prisma.user.findUnique({
        where: { id: link.userId },
      });
      if (!user || user.activeStatus === false) continue;
      const sites = await this.links.alertSites(user, link);
      const siteIds = new Set(sites.map((s) => s.id));
      // Access removed (or site deselected): close its incidents silently.
      await this.prisma.telegramIncident.updateMany({
        where: {
          linkId: link.id,
          resolvedAt: null,
          siteId: { notIn: [...siteIds] },
        },
        data: { resolvedAt: now },
      });
      for (const site of sites) {
        const snapshot = await this.snapshots.of(site);
        const rows = await this.prisma.telegramIncident.findMany({
          where: { linkId: link.id, siteId: site.id, resolvedAt: null },
        });
        const open: OpenIncident[] = rows.map((r) => ({
          id: r.id,
          kind: r.kind as AlertKind,
          // key = linkId:siteId:kind:ref; an alarm ref may itself contain ':'.
          ref: r.key.split(':').slice(3).join(':') || undefined,
          detail: (r.detail as Record<string, unknown>) ?? {},
        }));
        const conditions = conditionsNow(
          snapshot,
          link,
          open,
          now.getTime(),
          t,
          { suppressData: suppress },
        );
        const tr = transition(
          conditions,
          open,
          snapshot,
          link,
          now.getTime(),
          t,
        );
        for (const u of tr.update)
          await this.prisma.telegramIncident.update({
            where: { id: u.incident.id },
            data: { detail: u.detail as Prisma.InputJsonValue },
          });
        for (const c of tr.open) {
          const key = `${link.id}:${site.id}:${c.kind}:${c.ref ?? ''}`;
          const exists = await this.prisma.telegramIncident.findFirst({
            where: { key, resolvedAt: null },
          });
          if (exists) continue;
          const incident = await this.prisma.telegramIncident.create({
            data: {
              linkId: link.id,
              siteId: site.id,
              kind: c.kind,
              key,
              openedAt: now,
              resolvedAt: null,
              detail: c.detail as Prisma.InputJsonValue,
            },
          });
          counts.opened++;
          if (
            await this.enqueue(
              link,
              { siteId: site.id, incidentId: incident.id, kind: 'open' },
              `${incident.id}:open`,
              openText(c, snapshot),
              now,
              cfg,
            )
          )
            counts.queued++;
        }
        for (const r of tr.resolve) {
          await this.prisma.telegramIncident.update({
            where: { id: r.incident.id },
            data: { resolvedAt: now },
          });
          counts.resolved++;
          if (
            r.announce &&
            (await this.enqueue(
              link,
              {
                siteId: site.id,
                incidentId: r.incident.id,
                kind: 'resolved',
              },
              `${r.incident.id}:resolved`,
              resolvedText(r.incident, snapshot, now.getTime(), t),
              now,
              cfg,
            ))
          )
            counts.queued++;
        }
      }
    }
    if (counts.opened || counts.resolved)
      this.logger.log(
        `evaluate opened=${counts.opened} resolved=${counts.resolved} queued=${counts.queued}`,
      );
    return counts;
  }

  /**
   * Into the outbox, once per dedupe key, within the per-chat hourly limit.
   * Over the limit a message is kept as DROPPED (visible to admins) and the
   * chat gets one notice per hour instead of a flood.
   */
  async enqueue(
    link: TelegramLink,
    meta: MessageMeta,
    dedupeKey: string,
    text: string,
    now: Date,
    cfg = telegramConfig(),
  ) {
    const hourAgo = new Date(now.getTime() - 3600_000);
    const recent = await this.prisma.telegramMessage.count({
      where: {
        linkId: link.id,
        createdAt: { gte: hourAgo },
        status: { in: ['PENDING', 'SENDING', 'SENT'] },
      },
    });
    const over = recent >= cfg.maxMessagesPerHour;
    try {
      await this.prisma.telegramMessage.create({
        data: {
          linkId: link.id,
          chatId: link.chatId,
          siteId: meta.siteId,
          incidentId: meta.incidentId ?? null,
          kind: meta.kind,
          dedupeKey,
          text,
          status: over ? 'DROPPED' : 'PENDING',
          createdAt: now,
          nextAttemptAt: now,
        },
      });
    } catch (e) {
      if (e?.code === 'P2002') return false; // already queued: never twice
      throw e;
    }
    if (over) {
      const hour = Math.floor(now.getTime() / 3600_000);
      await this.prisma.telegramMessage
        .create({
          data: {
            linkId: link.id,
            chatId: link.chatId,
            siteId: null,
            incidentId: null,
            kind: 'notice',
            dedupeKey: `${link.id}:ratelimit:${hour}`,
            text: 'Many alerts in the last hour: further alerts are paused for up to an hour. Please check the dashboard at https://login.carbonoz.com.',
            createdAt: now,
            nextAttemptAt: now,
          },
        })
        .catch((e) => {
          if (e?.code !== 'P2002') throw e;
        });
    }
    return !over;
  }

  /**
   * Why a queued message must not be sent any more ('wait': not yet), or null
   * if it may. Checked before every attempt, retries included:
   *
   *   unlinked / alerts_off / user_inactive / no_access
   *       the link must still be active for the same chat, its user active,
   *       and the site still one the user may see and has chosen for alerts
   *   obsolete   an alert whose incident is already resolved; a recovery whose
   *              alert was never delivered (dropped, dead or discarded)
   *   wait       a recovery whose alert is still queued: sent after it
   *   expired    older than MAX_AGE_MS for its kind
   *
   * Returns a reason code only (no site data).
   */
  async undeliverable(
    m: TelegramMessage,
    now = new Date(),
  ): Promise<string | null> {
    const link = await this.prisma.telegramLink.findUnique({
      where: { id: m.linkId },
    });
    if (!link || link.revokedAt || link.chatId !== m.chatId) return 'unlinked';
    if (!link.notify) return 'alerts_off';
    const user = await this.prisma.user.findUnique({
      where: { id: link.userId },
    });
    if (!user || user.activeStatus === false) return 'user_inactive';
    if (m.siteId) {
      const sites = await this.links.alertSites(user, link);
      if (!sites.some((s) => s.id === m.siteId)) return 'no_access';
    }
    const kind = (m.kind as MessageKind | null) ?? 'notice';
    if (kind === 'open' && m.incidentId) {
      const incident = await this.prisma.telegramIncident.findUnique({
        where: { id: m.incidentId },
      });
      if (!incident || incident.resolvedAt) return 'obsolete';
    }
    if (kind === 'resolved' && m.incidentId) {
      const alert = await this.prisma.telegramMessage.findUnique({
        where: { dedupeKey: `${m.incidentId}:open` },
      });
      if (!alert || ['DROPPED', 'DEAD'].includes(alert.status))
        return 'obsolete';
      if (alert.status !== 'SENT') return 'wait';
    }
    if (now.getTime() - m.createdAt.getTime() > MAX_AGE_MS[kind])
      return 'expired';
    return null;
  }

  /** Send due messages. At-least-once: a crash between send and save may repeat one. */
  async deliver(
    api: Pick<TelegramApi, 'sendMessage'>,
    now = new Date(),
    /** Called before each message: false = the lock was lost, stop. */
    holding?: () => Promise<boolean>,
  ) {
    const counts = {
      sent: 0,
      retried: 0,
      dead: 0,
      discarded: 0,
      aborted: false,
    };
    // A SENDING row whose lease ran out belongs to a crashed pass.
    await this.prisma.telegramMessage.updateMany({
      where: { status: 'SENDING', leaseUntil: { lt: now } },
      data: { status: 'PENDING' },
    });
    const due = await this.prisma.telegramMessage.findMany({
      where: { status: 'PENDING', nextAttemptAt: { lte: now } },
      orderBy: { createdAt: 'asc' },
      take: 25,
    });
    for (const m of due) {
      if (holding && !(await holding())) {
        counts.aborted = true;
        this.logger.warn('deliver stopped: notifier lock lost');
        break;
      }
      const reason = await this.undeliverable(m, now);
      if (reason === 'wait') continue;
      if (reason) {
        const r = await this.prisma.telegramMessage.updateMany({
          where: { id: m.id, status: 'PENDING' },
          data: { status: 'DROPPED', lastError: `discarded: ${reason}` },
        });
        if (r.count) {
          counts.discarded++;
          this.logger.log(`deliver message=${m.id} discarded: ${reason}`);
        }
        continue;
      }
      const claimed = await this.prisma.telegramMessage.updateMany({
        where: { id: m.id, status: 'PENDING' },
        data: {
          status: 'SENDING',
          leaseUntil: new Date(now.getTime() + LEASE_MS),
          attempts: { increment: 1 },
        },
      });
      if (claimed.count !== 1) continue;
      const attempts = m.attempts + 1;
      try {
        await api.sendMessage(m.chatId, m.text);
        await this.prisma.telegramMessage.update({
          where: { id: m.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            leaseUntil: null,
            lastError: null,
          },
        });
        counts.sent++;
      } catch (e) {
        const err =
          e instanceof TelegramApiError
            ? e
            : new TelegramApiError(String(e?.message ?? e), null, null, false);
        if (err.status === 403)
          // The user blocked the bot or left: stop, do not retry. Only this
          // message's own link, never a newer one of the same user.
          await this.links.revokeLink(m.linkId, m.chatId, 'blocked');
        const give = err.permanent || attempts >= MAX_ATTEMPTS;
        const waitMs =
          err.retryAfter != null
            ? err.retryAfter * 1000
            : Math.min(3600_000, 2 ** attempts * 15_000);
        await this.prisma.telegramMessage.update({
          where: { id: m.id },
          data: {
            status: give ? 'DEAD' : 'PENDING',
            leaseUntil: null,
            lastError: err.message.slice(0, 300),
            nextAttemptAt: new Date(now.getTime() + waitMs),
          },
        });
        if (give) counts.dead++;
        else counts.retried++;
        this.logger.warn(
          `deliver message=${m.id} attempt=${attempts} ${
            give ? 'gave up' : 'will retry'
          }: ${err.message}`,
        );
        if (err.retryAfter != null) break; // Telegram asked us to slow down
      }
    }
    return counts;
  }

  /** Statistics for admins: no chat ids, no texts. */
  async stats() {
    const [links, byStatus, lastErrors, fleet] = await Promise.all([
      this.prisma.telegramLink.count({ where: { revokedAt: null } }),
      this.prisma.telegramMessage.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.telegramMessage.findMany({
        where: { status: 'DEAD' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, createdAt: true, attempts: true, lastError: true },
      }),
      this.loadFleet(),
    ]);
    const iso = (ms: number | null) => (ms ? new Date(ms).toISOString() : null);
    return {
      activeLinks: links,
      ingestionOutageSuspectedSince: iso(fleet.suspectedSince),
      ingestionCatchingUpSince: iso(fleet.storingSince),
      messages: Object.fromEntries(
        byStatus.map((s) => [s.status, s._count._all]),
      ),
      lastFailures: lastErrors,
    };
  }

  /**
   * Take or renew the notifier lock (MongoDB row, as the ingest bridge's):
   * succeeds for the current owner or when it expired. Called before every
   * unit of work, so a pass that runs longer than LOCK_MS keeps it, and a
   * process that was paused past LOCK_MS and lost it stops. Public for tests.
   */
  async lock(now = new Date()) {
    const until = new Date(now.getTime() + LOCK_MS);
    const r = await this.prisma.solarBridgeLock.updateMany({
      where: {
        name: LOCK_NAME,
        OR: [{ owner: this.instance }, { until: { lt: now } }],
      },
      data: { owner: this.instance, until },
    });
    if (r.count) return true;
    try {
      await this.prisma.solarBridgeLock.create({
        data: { name: LOCK_NAME, owner: this.instance, until },
      });
      return true;
    } catch (e) {
      if (e?.code === 'P2002') return false;
      throw e;
    }
  }
}
