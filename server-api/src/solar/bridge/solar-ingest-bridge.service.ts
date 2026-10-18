import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { hostname } from 'os';
import { createClient } from 'redis';
import { IAppConfig, IngestBridgeConfig } from 'src/__shared__/interfaces';
import { PrismaService } from 'src/prisma/prisma.service';
import { SolarStoreService } from '../store/solar-store.service';
import {
  parseDelivery,
  safeFields,
  toSolarBmsMessages,
} from '../normalize/ingest-readings.adapter';

type Client = ReturnType<typeof createClient>;
type Fields = Record<string, string>;
type StreamEntry = { id: string; message: Fields };
/** XREAD / XREADGROUP reply (node-redis): one item per stream; null on timeout. */
type StreamReply = { name: string; messages: StreamEntry[] }[] | null;
type Resolved =
  | { id: string; siteId: string; active: boolean }
  | 'ambiguous'
  | null;

const INSTALLATION_CACHE_MS = 60_000;
const GAP_CHECK_MS = 60_000;
const BACKOFF_MS = [1000, 2000, 5000, 10_000, 30_000];
/** An entry failing this often for a non-transient reason is dead-lettered instead of blocking the stream. */
const MAX_ATTEMPTS = 5;
/** Single active bridge per stream: lock lifetime, renewed on every read and entry. */
export const LOCK_MS = 30_000;

/** Retry later; never counts towards MAX_ATTEMPTS (MongoDB/Redis unavailable). */
class Transient extends Error {}

const idMs = (id: string) => Number(id.split('-')[0]);
/**
 * INGEST_BRIDGE_START: where the FIRST start (no stored cursor) begins.
 * `0-0` = everything still in the stream; `<ms>-<seq>` = after that entry;
 * `$` = after the newest entry present at the first start (resolved once
 * and stored, so later restarts never skip). Anything else is refused.
 */
export function parseStartId(v: string | undefined): string | null {
  const s = (v ?? '').trim();
  if (s === '$') return '$';
  if (s === '0' || s === '') return '0-0';
  return /^\d{1,15}-\d{1,15}$/.test(s) ? s : null;
}

/** Stream ids compare as (ms, seq). */
export function cmpId(a: string, b: string) {
  const [am, as] = a.split('-').map(Number);
  const [bm, bs] = b.split('-').map(Number);
  return am - bm || as - bs;
}

/**
 * Bridge from Felix's ingest pipeline into the Carbonoz SolarBMS pipeline:
 *
 *   Raspberry → api.carbonoz.com → ingest API → Redis `ingest:readings`
 *     → this bridge → SolarStoreService (the worker's own idempotent store:
 *       raw payload + samples + alarms in MongoDB, live state in Redis)
 *     → Carbonoz API → dashboard
 *
 * Delivery guarantee: AT-LEAST-ONCE reading of the stream, made effectively
 * once in MongoDB. A stream entry is acknowledged (cursor saved, or XACK in
 * group mode) only after every reading in it is durably stored. Each reading
 * has a content id (`<site>@<ts>#<metrics hash>`) and the store's unique
 * (installationId, messageId) index skips what is already PROCESSED and
 * clears partial rows of an interrupted attempt, so a replay, a retry or a
 * re-sent batch never doubles a reading. Not exactly-once at the transport
 * level: an entry can be read again after a crash; dedupe absorbs that.
 *
 * Modes (INGEST_BRIDGE_MODE):
 * - `xread` (default): read-only on the ingest Redis (XREAD, XRANGE, XLEN,
 *   XINFO). Acknowledgement = cursor in MongoDB (SolarIngestCursor).
 * - `group`: Felix's intended consumer group. Needs XREADGROUP, XACK,
 *   XAUTOCLAIM (write-class commands) and a group created by Felix. Own
 *   pending entries are re-read first after a restart; entries left by a
 *   crashed consumer are claimed after INGEST_CLAIM_IDLE_MS.
 *
 * Never: XGROUP CREATE/DESTROY, XDEL, XTRIM, DEL, or any config command.
 * Unprocessable entries (invalid, unknown/ambiguous site, deactivated
 * installation, failing MAX_ATTEMPTS times) and trimmed-before-processing
 * gaps are recorded in SolarDeadLetter (admin only, secret-looking fields
 * removed) and the stream keeps flowing.
 */
@Injectable()
export class SolarIngestBridge
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(SolarIngestBridge.name);
  private readonly cfg: IngestBridgeConfig;
  private client?: Client;
  private stopped = false;
  private loop?: Promise<void>;
  private installations = new Map<string, { at: number; value: Resolved }>();
  private lastErrorLog = 0;
  private failing: { id: string; attempts: number } | null = null;
  private lastGapCheck = 0;
  private lastClaim = 0;
  private readonly instance = `${hostname()}:${
    process.pid
  }:${randomUUID().slice(0, 8)}`;
  /** Waits between retries (ms); shortened in tests. */
  protected backoffMs = BACKOFF_MS;
  readonly stats = {
    running: false,
    cursor: null as string | null,
    entries: 0,
    readings: 0,
    deadLettered: 0,
    gaps: 0,
    lastEntryId: null as string | null,
    lastEntryAt: null as string | null,
    lastError: null as string | null,
    lastErrorAt: null as string | null,
    /** Another instance holds the bridge lock: this one waits. */
    standby: false,
    configError: null as string | null,
  };

  constructor(
    config: ConfigService<IAppConfig>,
    private readonly prisma: PrismaService,
    private readonly store: SolarStoreService,
  ) {
    this.cfg = config.get('ingestBridge');
  }

  private get mode(): 'xread' | 'group' {
    return this.cfg?.mode === 'group' ? 'group' : 'xread';
  }

  private get lockName() {
    return `solar-ingest-bridge:${this.cfg.streamKey}`;
  }

  private get consumer() {
    return this.cfg.consumer || `carbonoz-${hostname()}`;
  }

  onApplicationBootstrap() {
    if (!this.cfg?.enabled) return;
    if (!this.cfg.redisUrl) {
      this.logger.warn(
        'INGEST_BRIDGE_ENABLED but INGEST_REDIS_URL is empty: bridge not started',
      );
      return;
    }
    if (this.mode === 'xread' && parseStartId(this.cfg.startId) === null) {
      this.stats.configError = `INGEST_BRIDGE_START "${String(
        this.cfg.startId,
      ).slice(0, 40)}" is not 0-0, <ms>-<seq> or $: bridge not started`;
      this.logger.error(this.stats.configError);
      return;
    }
    this.logger.log(
      `ingest bridge starting: stream=${this.cfg.streamKey} mode=${this.mode}${
        this.mode === 'group'
          ? ` group=${this.cfg.group} consumer=${this.consumer}`
          : ''
      }`,
    );
    this.loop = this.run();
  }

  async onModuleDestroy() {
    this.stopped = true;
    // Unblock a pending blocking read (disconnect throws if never connected).
    try {
      if (this.client?.isOpen) await this.client.disconnect();
    } catch {
      /* already closed */
    }
    await this.loop?.catch(() => undefined);
    // Let a successor (pm2 reload/restart) take over without waiting LOCK_MS.
    await this.prisma.solarBridgeLock
      ?.updateMany({
        where: { name: this.lockName, owner: this.instance },
        data: { until: new Date(0) },
      })
      .catch(() => undefined);
  }

  /**
   * Only one bridge reads at a time (pm2 reload/scale, a second server): a
   * lock row in MongoDB, renewed while working, taken over when expired.
   */
  private async holdLock(): Promise<boolean> {
    const now = new Date();
    const until = new Date(now.getTime() + LOCK_MS);
    try {
      const r = await this.prisma.solarBridgeLock.updateMany({
        where: {
          name: this.lockName,
          OR: [{ owner: this.instance }, { until: { lt: now } }],
        },
        data: { owner: this.instance, until },
      });
      if (r.count) return (this.stats.standby = false), true;
      await this.prisma.solarBridgeLock.create({
        data: { name: this.lockName, owner: this.instance, until },
      });
      return (this.stats.standby = false), true;
    } catch (e) {
      if (e?.code === 'P2002') return (this.stats.standby = true), false;
      throw new Transient(`bridge lock: ${e.message}`);
    }
  }

  private error(e: Error, where: string) {
    this.stats.lastError = `${where}: ${e.message}`.slice(0, 300);
    this.stats.lastErrorAt = new Date().toISOString();
    if (Date.now() - this.lastErrorLog > 10_000) {
      this.lastErrorLog = Date.now();
      this.logger.error(`ingest bridge ${where}: ${e.message}`);
    }
  }

  /** Connection to the ingest Redis (least-privilege account). Overridden in tests. */
  protected makeClient(): Client {
    return createClient({
      url: this.cfg.redisUrl,
      socket: { reconnectStrategy: (n) => Math.min(500 * (n + 1), 10_000) },
    });
  }

  private async run() {
    this.client = this.makeClient();
    this.client.on('error', (e) => this.error(e, 'redis'));
    let attempt = 0;
    // Group mode: own pending entries first (left by a crash or a failed attempt).
    let ownPending = true;
    this.stats.running = true;
    while (!this.stopped) {
      try {
        if (!(await this.holdLock())) {
          await new Promise((r) => setTimeout(r, Math.min(LOCK_MS / 3, 5000)));
          continue;
        }
        if (!this.client.isOpen) await this.client.connect();
        if (this.mode === 'group')
          ownPending = await this.groupStep(ownPending);
        else await this.xreadStep();
        attempt = 0;
      } catch (e) {
        if (this.stopped) break;
        ownPending = true;
        const nogroup = /NOGROUP/.test(String(e.message));
        this.error(
          nogroup
            ? new Error(
                `consumer group "${this.cfg.group}" does not exist on ${this.cfg.streamKey} (to be created by the Redis admin)`,
              )
            : e,
          e instanceof Transient ? 'retry' : 'read',
        );
        const wait = nogroup
          ? this.backoffMs[this.backoffMs.length - 1]
          : this.backoffMs[Math.min(attempt++, this.backoffMs.length - 1)];
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    this.stats.running = false;
  }

  // ── xread mode ────────────────────────────────────────────────────────

  private async xreadStep() {
    const cursor = this.stats.cursor ?? (await this.loadCursor());
    await this.checkGap(cursor);
    const res = (await this.client.xRead(
      { key: this.cfg.streamKey, id: cursor },
      { COUNT: this.cfg.batchSize, BLOCK: this.cfg.blockMs },
    )) as unknown as StreamReply;
    for (const s of res ?? [])
      for (const entry of s.messages) {
        if (this.stopped) return;
        await this.process(entry, () => this.saveCursor(entry.id));
      }
  }

  /**
   * Entries the stream trimmed before we read them can't be recovered from
   * Redis. Detected when the cursor's entry is gone and the oldest entry is
   * newer than it; recorded once as an audit dead letter (count unknown).
   */
  private async checkGap(cursor: string) {
    if (cursor === '0-0' || Date.now() - this.lastGapCheck < GAP_CHECK_MS)
      return;
    this.lastGapCheck = Date.now();
    const first = (
      (await this.client.xRange(this.cfg.streamKey, '-', '+', {
        COUNT: 1,
      })) as unknown as StreamEntry[]
    )[0];
    if (!first || cmpId(first.id, cursor) <= 0) return;
    const self = await this.client.xRange(this.cfg.streamKey, cursor, cursor);
    if (self.length) return;
    await this.audit(
      `${this.cfg.streamKey}/gap/${cursor}..${first.id}`,
      `stream trimmed past the bridge position: entries after ${cursor} and before ${first.id} were never processed`,
    );
    this.stats.gaps++;
  }

  private async loadCursor(): Promise<string> {
    const row = await this.prisma.solarIngestCursor.findUnique({
      where: { stream: this.cfg.streamKey },
    });
    if (row) return (this.stats.cursor = row.lastId);
    let start = parseStartId(this.cfg.startId) ?? '0-0';
    if (start === '$') {
      // Resolve once to a concrete id and store it before reading: a restart
      // continues from there instead of re-resolving `$` and skipping.
      const last = (await this.client.xRevRange(this.cfg.streamKey, '+', '-', {
        COUNT: 1,
      })) as unknown as StreamEntry[];
      start = last[0]?.id ?? '0-0';
      await this.prisma.solarIngestCursor.upsert({
        where: { stream: this.cfg.streamKey },
        create: { stream: this.cfg.streamKey, lastId: start, entries: 0 },
        update: {},
      });
      this.logger.warn(
        `ingest bridge first start with INGEST_BRIDGE_START=$: starting after ${start}; earlier entries are not processed`,
      );
    }
    return (this.stats.cursor = start);
  }

  private async saveCursor(id: string) {
    try {
      await this.prisma.solarIngestCursor.upsert({
        where: { stream: this.cfg.streamKey },
        create: { stream: this.cfg.streamKey, lastId: id, entries: 1 },
        update: { lastId: id, entries: { increment: 1 } },
      });
    } catch (e) {
      // The readings are already stored; the entry is replayed and deduplicated.
      throw new Transient(`cursor not saved: ${e.message}`);
    }
    this.stats.cursor = id;
  }

  // ── group mode ────────────────────────────────────────────────────────

  /** One round; returns whether own pending entries remain to be re-read. */
  private async groupStep(ownPending: boolean): Promise<boolean> {
    const { streamKey: key, group } = this.cfg;
    if (Date.now() - this.lastClaim > this.cfg.claimIdleMs) {
      this.lastClaim = Date.now();
      await this.claimStale();
    }
    const res = (await this.client.xReadGroup(
      group,
      this.consumer,
      { key, id: ownPending ? '0' : '>' },
      ownPending
        ? { COUNT: this.cfg.batchSize }
        : { COUNT: this.cfg.batchSize, BLOCK: this.cfg.blockMs },
    )) as unknown as StreamReply;
    const entries = (res ?? []).flatMap((s) => s.messages);
    for (const entry of entries) {
      if (this.stopped) return true;
      // A pending entry that was trimmed meanwhile comes back without fields.
      if (!entry.message) {
        await this.audit(
          `${key}/${entry.id}`,
          'trimmed from the stream before it was processed',
        );
        await this.ack(entry.id);
        this.stats.gaps++;
        continue;
      }
      await this.process(entry, () => this.ack(entry.id));
    }
    return ownPending ? entries.length > 0 : false;
  }

  /** Entries another (crashed) consumer left pending longer than claimIdleMs. */
  private async claimStale() {
    const { streamKey: key, group } = this.cfg;
    let start = '0-0';
    do {
      const r = (await this.client.xAutoClaim(
        key,
        group,
        this.consumer,
        this.cfg.claimIdleMs,
        start,
        { COUNT: this.cfg.batchSize },
      )) as unknown as {
        nextId: string;
        messages: (StreamEntry | null)[];
        deletedMessages?: string[];
      };
      for (const id of r.deletedMessages ?? []) {
        await this.audit(
          `${key}/${id}`,
          'trimmed from the stream while pending (never processed)',
        );
        this.stats.gaps++;
      }
      for (const entry of r.messages) {
        if (!entry || this.stopped) continue;
        await this.process(entry, () => this.ack(entry.id));
      }
      start = r.nextId;
    } while (start !== '0-0' && !this.stopped);
  }

  private async ack(id: string) {
    await this.client.xAck(this.cfg.streamKey, this.cfg.group, id);
    this.stats.cursor = id;
  }

  // ── shared ────────────────────────────────────────────────────────────

  /** handle() then acknowledge; a poison entry is dead-lettered after MAX_ATTEMPTS. */
  private async process(entry: StreamEntry, acknowledge: () => Promise<void>) {
    // Lost the lock (paused longer than LOCK_MS): stop; the holder continues.
    if (!(await this.holdLock())) throw new Transient('bridge lock lost');
    try {
      await this.handle(entry.id, entry.message);
    } catch (e) {
      if (e instanceof Transient) throw e;
      const attempts =
        this.failing?.id === entry.id ? this.failing.attempts + 1 : 1;
      this.failing = { id: entry.id, attempts };
      if (attempts < MAX_ATTEMPTS) throw e;
      await this.deadLetter(
        entry.id,
        entry.message,
        `failed ${attempts} times: ${e.message}`,
      );
    }
    this.failing = null;
    await acknowledge();
  }

  /** The installation of a Raspberry `site` — refused when ambiguous (tenant safety). */
  private async installation(site: string): Promise<Resolved> {
    const hit = this.installations.get(site);
    if (hit && Date.now() - hit.at < INSTALLATION_CACHE_MS) return hit.value;
    const rows = await this.prisma.installation.findMany({
      where: { externalSystemId: site },
      select: { id: true, siteId: true, active: true },
      take: 2,
    });
    const value: Resolved =
      rows.length === 1 ? rows[0] : rows.length ? 'ambiguous' : null;
    this.installations.set(site, { at: Date.now(), value });
    return value;
  }

  /** One stream entry → stored readings. Throws Transient when it should be retried. */
  async handle(
    entryId: string,
    fields: Fields,
  ): Promise<'stored' | 'dead-lettered'> {
    const d = parseDelivery(fields, this.cfg.payloadField);
    if ('error' in d) return this.deadLetter(entryId, fields, d.error);
    let inst: Resolved;
    try {
      inst = await this.installation(d.site);
    } catch (e) {
      throw new Transient(`installation lookup: ${e.message}`);
    }
    if (inst === null)
      return this.deadLetter(
        entryId,
        fields,
        `no installation with systemId "${d.site}"`,
      );
    if (inst === 'ambiguous')
      return this.deadLetter(
        entryId,
        fields,
        `systemId "${d.site}" is used by more than one installation`,
      );
    if (!inst.active)
      return this.deadLetter(
        entryId,
        fields,
        `installation for "${d.site}" is deactivated`,
        inst,
      );

    const receivedAt = new Date(idMs(entryId)).toISOString();
    const messages = toSolarBmsMessages(this.cfg.streamKey, entryId, d);
    // Sequential and idempotent: after a failure the whole entry is retried and
    // readings already PROCESSED are skipped by the store.
    for (const m of messages) {
      const r = await this.store.processStreamMessage({
        installationId: inst.id,
        siteId: inst.siteId,
        messageId: String(m.messageId),
        receivedAt,
        payload: JSON.stringify(m),
      });
      if (!r.stored) {
        if (r.transient !== false)
          throw new Transient(`store: ${r.error ?? 'not stored'}`);
        throw new Error(`store: ${r.error ?? 'not stored'}`);
      }
    }
    this.stats.entries++;
    this.stats.readings += messages.length;
    this.stats.lastEntryId = entryId;
    this.stats.lastEntryAt = new Date().toISOString();
    this.logger.log(
      `ingest entry=${entryId} site=${d.site} readings=${messages.length} stored`,
    );
    return 'stored';
  }

  private async deadLetter(
    entryId: string,
    fields: Fields,
    reason: string,
    inst?: { id: string; siteId: string },
  ): Promise<'dead-lettered'> {
    await this.audit(`${this.cfg.streamKey}/${entryId}`, reason, fields, inst);
    return 'dead-lettered';
  }

  /** Auditable record, admin-only (SolarDeadLetter), never with secret-looking fields. */
  private async audit(
    streamId: string,
    reason: string,
    fields?: Fields,
    inst?: { id: string; siteId: string },
  ) {
    try {
      await this.prisma.solarDeadLetter.upsert({
        where: { streamId },
        create: {
          streamId,
          installationId: inst?.id,
          siteId: inst?.siteId,
          // No messageId: the generic requeue (worker stream) refuses these; use replay().
          rawText: fields ? JSON.stringify(safeFields(fields)) : '',
          error: reason,
          deliveries: 1,
        },
        update: { deliveries: { increment: 1 }, error: reason },
      });
    } catch (e) {
      throw new Transient(`dead letter not stored: ${e.message}`);
    }
    this.stats.deadLettered++;
    this.logger.warn(`ingest ${streamId}: ${reason}`);
  }

  /**
   * Admin: run a bridge dead letter again (e.g. after registering the missing
   * installation). Removed once its readings are stored; idempotent.
   */
  async replay(deadLetterId: string) {
    const dl = await this.prisma.solarDeadLetter.findUnique({
      where: { id: deadLetterId },
    });
    const prefix = `${this.cfg?.streamKey}/`;
    if (
      !dl ||
      !dl.streamId.startsWith(prefix) ||
      dl.streamId.startsWith(`${prefix}gap/`) ||
      !dl.rawText
    )
      throw new NotFoundException('Not a replayable ingest-bridge dead letter');
    const entryId = dl.streamId.slice(prefix.length);
    // The installation was probably just registered: don't trust the lookup cache.
    this.installations.clear();
    const outcome = await this.handle(
      entryId,
      JSON.parse(dl.rawText) as Fields,
    );
    if (outcome === 'dead-lettered')
      return {
        replayed: false,
        reason: 'still not processable (see the updated error)',
      };
    await this.prisma.solarDeadLetter.delete({ where: { id: dl.id } });
    return { replayed: true };
  }

  /** For the admin health page: position, backlog, last error (no payloads). */
  async status() {
    const base = {
      enabled: !!this.cfg?.enabled,
      configured: !!this.cfg?.redisUrl,
      mode: this.mode,
      stream: this.cfg?.streamKey,
      ...(this.cfg?.enabled &&
        this.mode === 'group' && {
          group: this.cfg.group,
          consumer: this.consumer,
        }),
      ...this.stats,
    };
    const client = this.client;
    if (!client?.isReady) return { ...base, connected: false };
    const read = async <T>(fn: () => Promise<T>) => fn().catch(() => null);
    const cursor = this.stats.cursor;
    const [length, info, groups, after] = await Promise.all([
      read(() => client.xLen(this.cfg.streamKey)),
      read(
        async () =>
          (await client.sendCommand([
            'XINFO',
            'STREAM',
            this.cfg.streamKey,
          ])) as unknown[],
      ),
      this.mode === 'group'
        ? read(
            async () =>
              (await client.sendCommand([
                'XINFO',
                'GROUPS',
                this.cfg.streamKey,
              ])) as unknown[][],
          )
        : null,
      // Entries not yet processed (xread mode), counted up to 1000.
      this.mode === 'xread' && cursor
        ? read(
            async () =>
              (await client.xRange(this.cfg.streamKey, cursor, '+', {
                COUNT: 1001,
              })) as unknown as StreamEntry[],
          )
        : null,
    ]);
    const backlog =
      after === null ? null : after.filter((e) => e.id !== cursor).length;
    const field = (list: unknown[] | null | undefined, name: string) =>
      Array.isArray(list) && list.includes(name)
        ? list[list.indexOf(name) + 1] ?? null
        : null;
    const lastId = field(info, 'last-generated-id') as string | null;
    const g = (groups ?? []).find((x) => field(x, 'name') === this.cfg.group);
    const upToDate = !lastId
      ? null // XINFO not allowed for this account
      : this.mode === 'group'
      ? field(g, 'last-delivered-id') === lastId &&
        Number(field(g, 'pending') ?? 0) === 0
      : lastId === this.stats.cursor;
    return {
      ...base,
      connected: true,
      streamLength: length,
      streamLastId: lastId,
      upToDate,
      instance: this.instance,
      ...(this.mode === 'xread' && {
        backlog: backlog === null ? null : backlog >= 1000 ? '1000+' : backlog,
      }),
      ...(this.mode === 'group' && {
        groupPending: g ? Number(field(g, 'pending')) : null,
        groupLag: g ? field(g, 'lag') : null,
      }),
    };
  }
}
