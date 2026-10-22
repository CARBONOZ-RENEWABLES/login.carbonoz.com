import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { hostname } from 'os';
import { PrismaService } from 'src/prisma/prisma.service';

export const HOUR_MS = 3600_000;
/** Hours rolled up per step while catching up on history. */
const CHUNK_HOURS = 24;
/** The most recent hours are rebuilt on every pass: readings arrive with a delay. */
const REDO_HOURS = 2;
const IDLE_MS = 5 * 60_000;
const BUSY_MS = 1_000;
const LOCK_MS = 10 * 60_000;
const STATE = 'hourly';
const LOCK = 'solar-rollup';
/** Late hours looked up per query (a back-filled outbox can touch weeks). */
const LATE_HOURS_PER_PASS = 72;

const floorHour = (ms: number) => Math.floor(ms / HOUR_MS) * HOUR_MS;
/** ObjectIds start with their creation time: "inserted after t" without a createdAt field. */
const objectIdAt = (d: Date) =>
  Math.floor(d.getTime() / 1000)
    .toString(16)
    .padStart(8, '0') + '0000000000000000';

/**
 * Hourly rollups of every device's numeric metrics into SolarRollupHour.
 * One MongoDB pipeline per time window, $merge'd by a deterministic _id, so
 * a pass can be repeated or interrupted without double counting. Catches up
 * on old history by itself, a day per step; hours that receive late samples
 * (an outbox delivered days later) are rebuilt as well.
 */
@Injectable()
export class SolarRollupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SolarRollupService.name);
  private readonly instance = `${hostname()}-${process.pid}`;
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private running?: Promise<unknown>;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.SOLAR_ROLLUP_ENABLED === 'false') return;
    this.schedule(5_000);
  }

  async onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running?.catch(() => undefined);
    await this.prisma.solarBridgeLock
      ?.updateMany({
        where: { name: LOCK, owner: this.instance },
        data: { until: new Date(0) },
      })
      .catch(() => undefined);
  }

  private schedule(ms: number) {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.tick()
        .catch((e) => {
          this.logger.error(`rollup: ${e.message}`);
          return IDLE_MS;
        })
        .then((next) => this.schedule(next));
    }, ms);
    this.timer.unref?.();
  }

  /** One pass; returns the delay before the next. Public for tests. */
  async tick(now = new Date()): Promise<number> {
    if (!(await this.lock(now))) return IDLE_MS;
    const nowHour = floorHour(now.getTime());
    let state = await this.prisma.solarRollupState.findUnique({
      where: { name: STATE },
    });
    if (!state) {
      const first = await this.prisma.solarSample.findFirst({
        orderBy: { ts: 'asc' },
        select: { ts: true },
      });
      if (!first) return IDLE_MS;
      state = await this.prisma.solarRollupState.create({
        data: {
          name: STATE,
          doneUntil: new Date(floorHour(first.ts.getTime())),
          scannedAt: now,
        },
      });
    }

    // 1. Hours already done that received samples since the last pass, in
    //    batches (a back-filled outbox can touch hundreds of hours).
    let after = -1;
    for (;;) {
      const late = await this.lateHours(
        state.scannedAt,
        state.doneUntil.getTime() - REDO_HOURS * HOUR_MS,
        after,
      );
      for (const h of late)
        await this.rollup(new Date(h), new Date(h + HOUR_MS));
      if (late.length < LATE_HOURS_PER_PASS || this.stopped) break;
      after = late[late.length - 1];
    }

    // 2. Move forward: the next chunk, always including the last hours.
    const start = Math.min(
      state.doneUntil.getTime(),
      nowHour - REDO_HOURS * HOUR_MS,
    );
    const end = Math.min(start + CHUNK_HOURS * HOUR_MS, nowHour + HOUR_MS);
    if (end > start) await this.rollup(new Date(start), new Date(end));
    const doneUntil = Math.max(
      state.doneUntil.getTime(),
      Math.min(end, nowHour - REDO_HOURS * HOUR_MS),
    );
    await this.prisma.solarRollupState.update({
      where: { name: STATE },
      data: { doneUntil: new Date(doneUntil), scannedAt: now },
    });
    return doneUntil < nowHour - REDO_HOURS * HOUR_MS ? BUSY_MS : IDLE_MS;
  }

  /** Hours before `before` (and after hour `after`) with samples inserted after `since`. */
  private async lateHours(since: Date, before: number, after: number) {
    const rows = (await this.prisma.solarSample.aggregateRaw({
      pipeline: [
        {
          $match: {
            _id: { $gt: { $oid: objectIdAt(since) } },
            ts: { $lt: { $date: new Date(before).toISOString() } },
          },
        },
        {
          $group: {
            _id: {
              $subtract: [
                { $toLong: '$ts' },
                { $mod: [{ $toLong: '$ts' }, HOUR_MS] },
              ],
            },
          },
        },
        { $match: { _id: { $gt: after } } },
        { $sort: { _id: 1 } },
        { $limit: LATE_HOURS_PER_PASS },
      ],
      options: { maxTimeMS: 30_000 },
    })) as unknown as Array<{ _id: number | { $numberLong: string } }>;
    return rows.map((r) =>
      typeof r._id === 'object' ? Number(r._id.$numberLong) : Number(r._id),
    );
  }

  /** Rebuilds every device-hour in [from, to) from the raw samples. */
  async rollup(from: Date, to: Date) {
    const t = { $toLong: '$ts' };
    await this.prisma.solarSample.aggregateRaw({
      pipeline: [
        {
          $match: {
            ts: {
              $gte: { $date: from.toISOString() },
              $lt: { $date: to.toISOString() },
            },
          },
        },
        {
          $project: {
            s: '$siteId',
            i: '$installationId',
            k: '$deviceKind',
            d: '$deviceExternalId',
            h: { $subtract: [t, { $mod: [t, HOUR_MS] }] },
            kv: { $objectToArray: { $ifNull: ['$metrics', {}] } },
          },
        },
        { $unwind: '$kv' },
        {
          $match: {
            'kv.v': { $type: ['double', 'int', 'long', 'decimal'] },
          },
        },
        {
          $group: {
            _id: { s: '$s', i: '$i', k: '$k', d: '$d', h: '$h', m: '$kv.k' },
            sum: { $sum: '$kv.v' },
            n: { $sum: 1 },
            min: { $min: '$kv.v' },
            max: { $max: '$kv.v' },
          },
        },
        {
          $group: {
            _id: {
              s: '$_id.s',
              i: '$_id.i',
              k: '$_id.k',
              d: '$_id.d',
              h: '$_id.h',
            },
            metrics: {
              $push: {
                k: '$_id.m',
                v: { sum: '$sum', n: '$n', min: '$min', max: '$max' },
              },
            },
          },
        },
        {
          $project: {
            _id: {
              $concat: [
                { $toString: '$_id.s' },
                ':',
                { $toString: '$_id.i' },
                ':',
                '$_id.k',
                ':',
                '$_id.d',
                ':',
                { $toString: '$_id.h' },
              ],
            },
            siteId: '$_id.s',
            installationId: '$_id.i',
            deviceKind: '$_id.k',
            deviceExternalId: '$_id.d',
            hour: { $toDate: '$_id.h' },
            metrics: { $arrayToObject: '$metrics' },
          },
        },
        {
          $merge: {
            into: 'SolarRollupHour',
            on: '_id',
            whenMatched: 'replace',
            whenNotMatched: 'insert',
          },
        },
      ],
      options: { maxTimeMS: 120_000, allowDiskUse: true },
    });
  }

  private async lock(now: Date) {
    const until = new Date(now.getTime() + LOCK_MS);
    const r = await this.prisma.solarBridgeLock.updateMany({
      where: {
        name: LOCK,
        OR: [{ owner: this.instance }, { until: { lt: now } }],
      },
      data: { owner: this.instance, until },
    });
    if (r.count) return true;
    try {
      await this.prisma.solarBridgeLock.create({
        data: { name: LOCK, owner: this.instance, until },
      });
      return true;
    } catch (e) {
      if (e?.code === 'P2002') return false;
      throw e;
    }
  }
}
