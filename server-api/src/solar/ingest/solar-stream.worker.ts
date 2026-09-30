import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hostname } from 'os';
import { IAppConfig, SolarConfig } from 'src/__shared__/interfaces';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisClient, RedisService } from 'src/redis/redis.service';
import { SolarKeys } from '../solar.keys';
import { SolarStoreService } from '../store/solar-store.service';
import { StreamMessage } from './solar-ingest.service';

const BLOCK_MS = 5000;
const BATCH = 20;
/** Upper bound for processing one entry; the lock expires after this. */
const LOCK_MS = 5 * 60_000;

type Entry = { id: string; message: Record<string, string> };

/**
 * Redis stream consumer (group "solar-store"). Runs inside the API process by
 * default; set SOLAR_WORKER_ENABLED=false on API nodes and run a dedicated
 * worker process when ingestion volume grows — the group spreads the load.
 *
 * Guarantees:
 * - an entry is acknowledged only once its outcome is stored in MongoDB
 *   (processed, FAILED with the raw payload, or dead-lettered);
 * - an entry that keeps failing is dead-lettered after `maxDeliveries`, so it
 *   can't block trimming (and with it ingestion) for everyone;
 * - a per-entry lock keeps two workers from processing one entry at once;
 * - Redis being down at startup doesn't block the API: the worker connects
 *   in the background and starts consuming when Redis is reachable.
 */
@Injectable()
export class SolarStreamWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(SolarStreamWorker.name);
  private readonly cfg: SolarConfig;
  private readonly consumer = `${hostname()}-${process.pid}`;
  private running = false;
  private loop?: Promise<void>;
  private client?: RedisClient;
  private lastReclaim = 0;

  constructor(
    config: ConfigService<IAppConfig>,
    private readonly redis: RedisService,
    private readonly store: SolarStoreService,
    private readonly prisma: PrismaService,
  ) {
    this.cfg = config.get('solar');
  }

  onApplicationBootstrap() {
    if (!this.cfg.workerEnabled) return;
    this.running = true;
    // Not awaited: bootstrap (and every route) must not wait for Redis.
    this.loop = this.run();
  }

  async onModuleDestroy() {
    this.running = false;
    // A connect still waiting for Redis never resolves; don't hang shutdown on it.
    await Promise.race([
      this.loop,
      new Promise((r) => setTimeout(r, BLOCK_MS + 1000)),
    ]);
  }

  /** Waits (with backoff) until Redis is reachable and the consumer group exists. */
  private async connect(): Promise<boolean> {
    let delay = 1000;
    while (this.running) {
      try {
        this.client = await this.redis.dedicated();
        await this.client
          .xGroupCreate(this.cfg.streamKey, SolarKeys.group, '0', {
            MKSTREAM: true,
          })
          .catch((e) => {
            if (!String(e.message).includes('BUSYGROUP')) throw e;
          });
        this.logger.log(
          `Solar worker consuming ${this.cfg.streamKey} as ${this.consumer}`,
        );
        return true;
      } catch (e) {
        this.logger.warn(`Solar worker waiting for Redis: ${e.message}`);
        await this.client?.disconnect().catch(() => undefined);
        this.client = undefined;
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 30_000);
      }
    }
    return false;
  }

  private async run() {
    if (!(await this.connect())) return;
    while (this.running) {
      try {
        if (Date.now() - this.lastReclaim > this.cfg.reclaimIdleMs) {
          await this.reclaim();
          await this.maintain().catch((e) =>
            this.logger.warn(`Stream maintenance failed: ${e.message}`),
          );
        }
        const res = await this.client.xReadGroup(
          SolarKeys.group,
          this.consumer,
          [{ key: this.cfg.streamKey, id: '>' }],
          { COUNT: BATCH, BLOCK: BLOCK_MS },
        );
        for (const stream of (res as unknown as Array<{ messages: Entry[] }>) ??
          []) {
          for (const msg of stream.messages)
            await this.handle(msg.id, msg.message, 1);
        }
      } catch (e) {
        if (!this.running) break;
        this.logger.error(`Solar worker error: ${e.message}`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  /**
   * Claims entries pending longer than `reclaimIdleMs` (crashed consumer,
   * MongoDB down, failed attempt) and tries them again; handle() decides,
   * from the delivery count and the kind of failure, when to dead-letter.
   */
  private async reclaim() {
    this.lastReclaim = Date.now();
    const pending = (await this.client.sendCommand([
      'XPENDING',
      this.cfg.streamKey,
      SolarKeys.group,
      'IDLE',
      String(this.cfg.reclaimIdleMs),
      '-',
      '+',
      String(BATCH),
    ])) as unknown as Array<[string, string, number, number]>;
    for (const [id, , , deliveries] of pending ?? []) {
      const claimed = (await this.client.xClaim(
        this.cfg.streamKey,
        SolarKeys.group,
        this.consumer,
        this.cfg.reclaimIdleMs,
        id,
      )) as unknown as Array<Entry | null>;
      const entry = claimed?.[0];
      if (!entry) {
        // Claimed by another consumer meanwhile, or the entry is gone.
        continue;
      }
      await this.handle(entry.id, entry.message, Number(deliveries) + 1);
    }
  }

  /** Records the entry verbatim, then acknowledges it — never the other way round. */
  private async deadLetter(entry: Entry, deliveries: number, reason: string) {
    const m = entry.message as unknown as Partial<StreamMessage>;
    let recorded = false;
    try {
      await this.prisma.solarDeadLetter.upsert({
        where: { streamId: entry.id },
        create: {
          streamId: entry.id,
          installationId: m.installationId,
          siteId: m.siteId,
          messageId: m.messageId,
          receivedAt: m.receivedAt ? new Date(m.receivedAt) : undefined,
          rawText: m.payload ?? JSON.stringify(entry.message),
          error: reason,
          deliveries,
        },
        update: { deliveries, error: reason },
      });
      recorded = true;
    } catch (e) {
      // MongoDB unreachable: keep it in Redis instead (same durability as the stream).
      try {
        await this.client.xAdd(SolarKeys.deadLetters, '*', {
          ...entry.message,
          streamId: entry.id,
          error: reason,
          deliveries: String(deliveries),
        });
        recorded = true;
      } catch (e2) {
        this.logger.error(
          `Could not dead-letter ${entry.id}: ${e.message} / ${e2.message}`,
        );
      }
    }
    if (recorded) {
      await this.client.xAck(this.cfg.streamKey, SolarKeys.group, entry.id);
      this.logger.warn(
        `Dead-lettered stream entry ${entry.id} (${m.messageId}) after ${deliveries} deliveries: ${reason}`,
      );
    }
  }

  /**
   * Trims entries every group has acknowledged (ingestion never trims, so
   * unprocessed messages are never dropped) and removes consumer names left
   * behind by restarts once they are idle and hold nothing.
   */
  private async maintain() {
    const key = this.cfg.streamKey;
    const flat = (a: unknown) => {
      const o: Record<string, unknown> = {};
      const arr = a as unknown[];
      for (let i = 0; i + 1 < arr.length; i += 2)
        o[String(arr[i])] = arr[i + 1];
      return o;
    };
    const groups = (
      (await this.client.sendCommand(['XINFO', 'GROUPS', key])) as unknown[]
    ).map(flat);
    let minId: string | null = null;
    const older = (a: string, b: string) => {
      const [am, as] = a.split('-').map(BigInt);
      const [bm, bs] = b.split('-').map(BigInt);
      return am < bm || (am === bm && as < bs);
    };
    for (const g of groups) {
      const summary = (await this.client.sendCommand([
        'XPENDING',
        key,
        String(g.name),
      ])) as unknown[];
      const keep =
        Number(summary?.[0]) > 0
          ? String(summary[1])
          : String(g['last-delivered-id']);
      if (!minId || older(keep, minId)) minId = keep;
    }
    if (minId && minId !== '0-0')
      await this.client.sendCommand(['XTRIM', key, 'MINID', '~', minId]);

    const consumers = (
      (await this.client.sendCommand([
        'XINFO',
        'CONSUMERS',
        key,
        SolarKeys.group,
      ])) as unknown[]
    ).map(flat);
    for (const c of consumers) {
      if (
        c.name !== this.consumer &&
        Number(c.pending) === 0 &&
        Number(c.idle) > 3600_000
      ) {
        await this.client.sendCommand([
          'XGROUP',
          'DELCONSUMER',
          key,
          SolarKeys.group,
          String(c.name),
        ]);
      }
    }
  }

  private async handle(
    id: string,
    fields: Record<string, string>,
    delivery: number,
  ) {
    // Another worker may still be processing this entry (it was reclaimed while
    // slow): skip it; that worker acknowledges it, or it is reclaimed later.
    const lock = SolarKeys.lock(id);
    if (!(await this.redis.setIfAbsentMs(lock, this.consumer, LOCK_MS))) return;
    try {
      const { stored, error, transient } =
        await this.store.processStreamMessage(
          fields as unknown as StreamMessage,
        );
      if (stored) {
        await this.client.xAck(this.cfg.streamKey, SolarKeys.group, id);
      } else if (!transient && delivery >= this.cfg.maxDeliveries) {
        // Permanently failing message: record it and move on so it can't
        // block trimming (and so ingestion) for every installation.
        await this.deadLetter(
          { id, message: fields },
          delivery,
          error ?? 'not stored',
        );
      }
      // Otherwise it stays pending: reclaimed after reclaimIdleMs. MongoDB
      // outages (transient) retry until it is back — nothing is dead-lettered.
    } catch (e) {
      this.logger.error(`Processing ${id} failed: ${e.message}`);
    } finally {
      await this.redis.del(lock).catch(() => undefined);
    }
  }
}
