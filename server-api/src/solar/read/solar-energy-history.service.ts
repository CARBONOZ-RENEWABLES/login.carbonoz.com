import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, Site } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/redis/redis.service';
import { SolarKeys } from '../solar.keys';
import {
  addDays,
  EnergyRange,
  localDay,
  localMidnight,
  planRange,
  safeTimeZone,
  validAnchor,
} from './energy-calendar';

/**
 * The only metrics energy history uses, all on the SYSTEM device. Their
 * meaning is fixed by the normalizer's aliases; unknown metrics are never
 * interpreted as energy.
 */
export const ENERGY_SOURCES = {
  device: 'SYSTEM',
  pv: 'pv_power_w',
  load: 'load_power_w',
  grid: 'grid_power_w',
  battery: 'battery_power_w',
} as const;

/** A day is final (cached) once it ended this long ago; the Pi may still backfill before that. */
const SETTLE_MS = 48 * 3600_000;
const HOUR_MS = 3600_000;

/** Per local day: Wh by signed part, and installation-hours with readings. */
interface DayValues {
  pvWh: number;
  pvHours: number;
  loadWh: number;
  loadHours: number;
  gridPositiveWh: number;
  gridNegativeWh: number;
  gridHours: number;
  batteryPositiveWh: number;
  batteryNegativeWh: number;
  batteryHours: number;
}
const EMPTY: DayValues = {
  pvWh: 0,
  pvHours: 0,
  loadWh: 0,
  loadHours: 0,
  gridPositiveWh: 0,
  gridNegativeWh: 0,
  gridHours: 0,
  batteryPositiveWh: 0,
  batteryNegativeWh: 0,
  batteryHours: 0,
};
const KEYS = Object.keys(EMPTY) as (keyof DayValues)[];

export interface EnergyBucket {
  key: string;
  start: string;
  end: string;
  /** The bucket isn't over yet, or data started inside it. */
  partial: boolean;
  /** Hours of the bucket that lie in the past and after the first reading. */
  expectedHours: number;
  /** Share of expected installation-hours with readings (0–1); null without any expectation. */
  completeness: number | null;
  /** kWh; null = no reading of that metric in the bucket (not zero). */
  pvKwh: number | null;
  loadKwh: number | null;
  /** Energy while grid_power_w > 0 / < 0. Which is import depends on the SolarBMS sign convention. */
  gridPositiveKwh: number | null;
  gridNegativeKwh: number | null;
  /** Energy while battery_power_w > 0 / < 0. Which is charging depends on the sign convention. */
  batteryPositiveKwh: number | null;
  batteryNegativeKwh: number | null;
}

const kwh = (wh: number, hours: number) =>
  hours > 0 ? Math.round(wh) / 1000 : null;

/**
 * Energy history of a site: daily (30 days), monthly (12 months) or yearly
 * (10 years) totals in the site's time zone.
 *
 * SolarBMS reports power, not energy counters, so energy is integrated: the
 * average power of every installation-hour with readings × 1 h. Hours without
 * readings add nothing and are reported through `completeness`, so gaps
 * never turn into invented energy. Settled days are cached (SolarEnergyDay);
 * months and years are sums of days, which keeps month/year boundaries and
 * DST exact.
 */
@Injectable()
export class SolarEnergyHistoryService {
  private readonly logger = new Logger(SolarEnergyHistoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Current invalidation marker of a site; null when Redis can't be asked (then nothing is cached). */
  private async dirtyMark(siteId: string): Promise<string | null> {
    if (!this.redis.ready) return null;
    try {
      return (await this.redis.get(SolarKeys.energyDirty(siteId))) ?? '';
    } catch {
      return null;
    }
  }

  async history(
    site: Pick<Site, 'id' | 'timezone'>,
    range: EnergyRange,
    anchor?: string,
    now = new Date(),
  ) {
    if (anchor !== undefined && !validAnchor(range, anchor))
      throw new BadRequestException(
        range === '30d'
          ? 'anchor must be YYYY-MM-DD'
          : range === '1y'
          ? 'anchor must be YYYY-MM'
          : 'anchor must be YYYY',
      );
    const tz = safeTimeZone(site.timezone);
    const plan = planRange(range, anchor, tz, now);

    const [first, installations] = await Promise.all([
      this.prisma.solarSample.findFirst({
        where: { siteId: site.id, deviceKind: ENERGY_SOURCES.device },
        orderBy: { ts: 'asc' },
        select: { ts: true },
      }),
      this.prisma.installation.count({
        where: { siteId: site.id, lastSeenAt: { not: null } },
      }),
    ]);

    const today = localDay(now, tz);
    const firstDay = first ? localDay(first.ts, tz) : null;
    const needed = firstDay
      ? plan.buckets
          .flatMap((b) => b.days)
          .filter((d) => d >= firstDay && d <= today)
      : [];
    const days = await this.daysOf(site.id, tz, needed, now);

    const buckets: EnergyBucket[] = plan.buckets.map((b) => {
      const sum = { ...EMPTY };
      for (const d of b.days) {
        const v = days.get(d);
        if (v) for (const k of KEYS) sum[k] += v[k];
      }
      const from = Math.max(b.start.getTime(), first?.ts.getTime() ?? Infinity);
      const to = Math.min(b.end.getTime(), now.getTime());
      const expectedHours = to > from ? (to - from) / HOUR_MS : 0;
      const maxHours = Math.max(
        sum.pvHours,
        sum.loadHours,
        sum.gridHours,
        sum.batteryHours,
      );
      return {
        key: b.key,
        start: b.start.toISOString(),
        end: b.end.toISOString(),
        partial:
          b.end.getTime() > now.getTime() ||
          (!!first && b.start.getTime() < first.ts.getTime()),
        expectedHours: Math.round(expectedHours * 100) / 100,
        completeness:
          expectedHours > 0 && installations > 0
            ? Math.min(
                1,
                Math.round(
                  (maxHours / (expectedHours * installations)) * 1000,
                ) / 1000,
              )
            : null,
        pvKwh: kwh(sum.pvWh, sum.pvHours),
        loadKwh: kwh(sum.loadWh, sum.loadHours),
        gridPositiveKwh: kwh(sum.gridPositiveWh, sum.gridHours),
        gridNegativeKwh: kwh(sum.gridNegativeWh, sum.gridHours),
        batteryPositiveKwh: kwh(sum.batteryPositiveWh, sum.batteryHours),
        batteryNegativeKwh: kwh(sum.batteryNegativeWh, sum.batteryHours),
      };
    });

    return {
      range: plan.range,
      resolution: plan.resolution,
      timezone: tz,
      anchor: plan.anchor,
      previousAnchor: plan.previousAnchor,
      nextAnchor: plan.nextAnchor,
      firstDataAt: first?.ts.toISOString() ?? null,
      installations,
      sources: ENERGY_SOURCES,
      method: 'hourly-average-power',
      buckets,
    };
  }

  /** Values of the given local days: settled ones from the cache, the rest computed. */
  private async daysOf(
    siteId: string,
    tz: string,
    needed: string[],
    now: Date,
  ): Promise<Map<string, DayValues>> {
    const out = new Map<string, DayValues>();
    if (!needed.length) return out;
    const cached = await this.prisma.solarEnergyDay.findMany({
      where: {
        siteId,
        timezone: tz,
        day: { gte: needed[0], lte: needed[needed.length - 1] },
      },
      select: { day: true, values: true },
    });
    for (const c of cached)
      out.set(c.day, { ...EMPTY, ...(c.values as unknown as DayValues) });

    const missing = needed.filter((d) => !out.has(d));
    if (!missing.length) return out;
    const markBefore = await this.dirtyMark(siteId);
    const computed = await this.compute(siteId, tz, missing);
    const settleBefore = now.getTime() - SETTLE_MS;
    const settled: Prisma.SolarEnergyDayCreateManyInput[] = [];
    for (const d of missing) {
      const v = computed.get(d) ?? { ...EMPTY };
      out.set(d, v);
      if (localMidnight(addDays(d, 1), tz).getTime() <= settleBefore)
        settled.push({
          siteId,
          timezone: tz,
          day: d,
          start: localMidnight(d, tz),
          values: v as unknown as Prisma.InputJsonValue,
        });
    }
    if (settled.length && markBefore !== null) {
      // A concurrent request may have cached the same days; the unique index decides.
      await this.prisma.solarEnergyDay
        .createMany({ data: settled })
        .catch((e) =>
          this.logger.debug(`Energy day cache write skipped: ${e.message}`),
        );
      // The worker marks, then deletes. If it marked while we computed, our
      // rows may miss its readings: remove them (its delete may have run first).
      if ((await this.dirtyMark(siteId)) !== markBefore)
        await this.prisma.solarEnergyDay.deleteMany({
          where: {
            siteId,
            timezone: tz,
            day: { in: settled.map((r) => r.day) },
          },
        });
    }
    return out;
  }

  /** Integrates SYSTEM power per local day for contiguous runs of `days`. */
  private async compute(
    siteId: string,
    tz: string,
    days: string[],
  ): Promise<Map<string, DayValues>> {
    const runs: string[][] = [];
    for (const d of days) {
      const run = runs[runs.length - 1];
      if (run && addDays(run[run.length - 1], 1) === d) run.push(d);
      else runs.push([d]);
    }
    const out = new Map<string, DayValues>();
    const has = (f: string) => ({ $ne: [f, null] });
    const pos = (f: string) => ({ $cond: [has(f), { $max: [f, 0] }, 0] });
    const neg = (f: string) => ({
      $cond: [has(f), { $max: [{ $multiply: [f, -1] }, 0] }, 0],
    });
    const hours = (f: string) => ({ $cond: [has(f), 1, 0] });
    for (const run of runs) {
      const from = localMidnight(run[0], tz);
      const to = localMidnight(addDays(run[run.length - 1], 1), tz);
      const rows = (await this.prisma.solarSample.aggregateRaw({
        pipeline: [
          {
            $match: {
              siteId: { $oid: siteId },
              deviceKind: ENERGY_SOURCES.device,
              ts: {
                $gte: { $date: from.toISOString() },
                $lt: { $date: to.toISOString() },
              },
            },
          },
          {
            $project: {
              _id: 0,
              i: '$installationId',
              // The site's local hour with its UTC offset ("2026-10-25T02+0100"):
              // never straddles local midnight, also in +05:30 / +05:45 zones,
              // and the repeated hour of a DST fall-back stays two hours.
              h: {
                $dateToString: {
                  format: '%Y-%m-%dT%H%z',
                  date: '$ts',
                  timezone: tz,
                },
              },
              pv: `$metrics.${ENERGY_SOURCES.pv}`,
              load: `$metrics.${ENERGY_SOURCES.load}`,
              grid: `$metrics.${ENERGY_SOURCES.grid}`,
              bat: `$metrics.${ENERGY_SOURCES.battery}`,
            },
          },
          // Average power per installation-hour ($avg ignores non-numbers;
          // repeated or duplicated readings don't inflate the result)…
          {
            $group: {
              _id: { i: '$i', h: '$h' },
              pv: { $avg: '$pv' },
              load: { $avg: '$load' },
              grid: { $avg: '$grid' },
              bat: { $avg: '$bat' },
            },
          },
          // …× 1 h = Wh, summed per local day of the site.
          {
            $group: {
              _id: { $substrBytes: ['$_id.h', 0, 10] },
              pvWh: { $sum: pos('$pv') },
              pvHours: { $sum: hours('$pv') },
              loadWh: { $sum: pos('$load') },
              loadHours: { $sum: hours('$load') },
              gridPositiveWh: { $sum: pos('$grid') },
              gridNegativeWh: { $sum: neg('$grid') },
              gridHours: { $sum: hours('$grid') },
              batteryPositiveWh: { $sum: pos('$bat') },
              batteryNegativeWh: { $sum: neg('$bat') },
              batteryHours: { $sum: hours('$bat') },
            },
          },
        ],
        options: { maxTimeMS: 30_000 },
      })) as unknown as Array<{ _id: string } & DayValues>;
      for (const { _id, ...v } of rows) out.set(_id, { ...EMPTY, ...v });
    }
    return out;
  }

  /**
   * Drops cached days a newly stored reading may change (backfill, reprocess).
   * Called by the worker for SYSTEM samples older than the settle window.
   */
  async invalidate(siteId: string, from: Date, to: Date) {
    // Mark first, delete second: see the cache-write guard in daysOf().
    await this.redis
      .set(
        SolarKeys.energyDirty(siteId),
        randomBytes(8).toString('hex'),
        7 * 24 * 3600,
      )
      .catch(() => undefined);
    await this.prisma.solarEnergyDay.deleteMany({
      where: {
        siteId,
        // A local day starts at most ~26 h before any instant inside it.
        start: {
          gte: new Date(from.getTime() - 26 * HOUR_MS),
          lte: to,
        },
      },
    });
  }
}

export const ENERGY_SETTLE_MS = SETTLE_MS;
