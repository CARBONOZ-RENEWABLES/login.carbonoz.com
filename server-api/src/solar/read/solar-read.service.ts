import { BadRequestException, Injectable } from '@nestjs/common';
import { ESolarDeviceKind, Site } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/redis/redis.service';
import { LIVE_STALE_MS, SolarKeys } from '../solar.keys';
import { LiveDevice } from '../store/solar-store.service';

/** Data older than this is flagged stale in the overview. */
const STALE_MS = LIVE_STALE_MS;
const BUCKETS_S = [10, 30, 60, 300, 900, 1800, 3600, 3 * 3600, 6 * 3600, 86400];
const MAX_POINTS = 400;
/** Longest raw-history range per request (the dashboard offers up to 30 days). */
export const MAX_HISTORY_DAYS = 31;

export interface HistoryQuery {
  metric: string;
  kind: ESolarDeviceKind;
  deviceId?: string;
  from?: Date;
  to?: Date;
  bucketSeconds?: number;
}

/**
 * Read model for the Solar dashboard. Every method takes a Site that
 * SiteAccessGuard has already authorised; queries are always scoped to it.
 */
@Injectable()
export class SolarReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Latest reading per device: the Redis live snapshot of each installation,
   * falling back to the newest MongoDB sample for installations whose
   * snapshot expired. `updatedAt` is the newest reading's own timestamp.
   */
  async latest(site: Site): Promise<{
    updatedAt: string | null;
    source: 'live' | 'archive' | 'none';
    devices: LiveDevice[];
  }> {
    const installations = await this.prisma.installation.findMany({
      where: { siteId: site.id },
      select: { id: true },
    });
    let live = false;
    const devices: LiveDevice[] = [];
    for (const { id: installationId } of installations) {
      const hash = (await this.redis.raw.hGetAll(
        SolarKeys.live(site.id, installationId),
      )) as unknown as Record<string, string>;
      const entries = Object.entries(hash ?? {}).filter(([k]) => k !== '_meta');
      if (entries.length) {
        live = true;
        for (const [, v] of entries)
          devices.push({ installationId, ...JSON.parse(String(v)) });
        continue;
      }
      devices.push(...(await this.archived(site.id, installationId)));
    }
    const updatedAt = devices.reduce<string | null>(
      (a, d) => (!a || d.ts > a ? d.ts : a),
      null,
    );
    return {
      updatedAt,
      source: live ? 'live' : devices.length ? 'archive' : 'none',
      devices,
    };
  }

  private async archived(
    siteId: string,
    installationId: string,
  ): Promise<LiveDevice[]> {
    const registry = await this.prisma.solarDevice.findMany({
      where: { siteId, installationId },
    });
    const rows = await Promise.all(
      registry.map((d) =>
        this.prisma.solarSample.findFirst({
          where: {
            siteId,
            installationId,
            deviceKind: d.kind,
            deviceExternalId: d.externalId,
          },
          orderBy: { ts: 'desc' },
        }),
      ),
    );
    return rows.filter(Boolean).map((s) => ({
      installationId,
      kind: s.deviceKind,
      externalId: s.deviceExternalId,
      ts: s.ts.toISOString(),
      metrics: s.metrics as Record<string, unknown>,
      cells: (s.cells as unknown[]) ?? undefined,
      status: s.status ?? undefined,
    }));
  }

  async devices(site: Site, kind?: ESolarDeviceKind) {
    const [registry, latest] = await Promise.all([
      this.prisma.solarDevice.findMany({
        where: { siteId: site.id, ...(kind && { kind }) },
        orderBy: [{ kind: 'asc' }, { externalId: 'asc' }],
      }),
      this.latest(site),
    ]);
    const k = (i: string, kd: string, e: string) => `${i}:${kd}:${e}`;
    const byKey = new Map(
      latest.devices.map((d) => [k(d.installationId, d.kind, d.externalId), d]),
    );
    const now = Date.now();
    return registry.map((d) => {
      const live = byKey.get(k(d.installationId, d.kind, d.externalId));
      return {
        installationId: d.installationId,
        kind: d.kind,
        externalId: d.externalId,
        parentExternalId: d.parentExternalId,
        name: d.name,
        manufacturer: d.manufacturer,
        model: d.model,
        attributes: d.attributes,
        firstSeenAt: d.firstSeenAt,
        lastSeenAt: d.lastSeenAt,
        latest: live
          ? {
              ts: live.ts,
              // Per device: one installation can go quiet while another is live.
              stale: now - Date.parse(live.ts) > STALE_MS,
              status: live.status,
              metrics: live.metrics,
              cells: live.cells,
            }
          : null,
      };
    });
  }

  async overview(site: Site) {
    const [devices, latest, metrics, activeAlarms, forecast] =
      await Promise.all([
        this.devices(site),
        this.latest(site),
        this.metrics(site),
        this.prisma.solarEvent.count({
          where: { siteId: site.id, active: true },
        }),
        this.prisma.solarForecast.count({ where: { siteId: site.id } }),
      ]);
    const age = latest.updatedAt
      ? Date.now() - Date.parse(latest.updatedAt)
      : null;
    return {
      site: { id: site.id, name: site.name, timezone: site.timezone },
      updatedAt: latest.updatedAt,
      source: latest.source,
      stale: age == null ? true : age > STALE_MS,
      activeAlarms,
      hasForecast: forecast > 0,
      metrics,
      devices,
    };
  }

  /** Flat cell list across every BMS (or one), from the latest sample. */
  async cells(site: Site, bmsId?: string) {
    const latest = await this.latest(site);
    return latest.devices
      .filter((d) => d.kind === 'BMS' && (!bmsId || d.externalId === bmsId))
      .flatMap((d) =>
        ((d.cells as Array<Record<string, unknown>>) ?? []).map((c) => ({
          installationId: d.installationId,
          bmsId: d.externalId,
          sampleTs: d.ts,
          ...c,
        })),
      );
  }

  metrics(site: Site) {
    return this.prisma.solarMetric.findMany({
      where: { siteId: site.id },
      select: {
        deviceKind: true,
        key: true,
        unit: true,
        valueType: true,
        firstSeenAt: true,
      },
      orderBy: [{ deviceKind: 'asc' }, { key: 'asc' }],
    });
  }

  async events(
    site: Site,
    opts: { active?: boolean; limit?: number; before?: Date },
  ) {
    return this.prisma.solarEvent.findMany({
      where: {
        siteId: site.id,
        ...(opts.active !== undefined && { active: opts.active }),
        ...(opts.before && { ts: { lt: opts.before } }),
      },
      orderBy: { ts: 'desc' },
      take: Math.min(opts.limit ?? 50, 500),
      select: {
        id: true,
        ts: true,
        severity: true,
        code: true,
        message: true,
        active: true,
        deviceKind: true,
        deviceExternalId: true,
      },
    });
  }

  async forecast(site: Site) {
    const f = await this.prisma.solarForecast.findFirst({
      where: { siteId: site.id },
      orderBy: { generatedAt: 'desc' },
      select: { generatedAt: true, source: true, points: true },
    });
    return f ?? null;
  }

  /** Time-bucketed min/avg/max of one metric, one series per device. */
  async history(site: Site, q: HistoryQuery) {
    // Also enforced by the DTO; the key is used as a document path below.
    if (!/^[a-z0-9_]{1,100}$/.test(q.metric))
      throw new BadRequestException('Invalid metric');
    const to = q.to ?? new Date();
    const from = q.from ?? new Date(to.getTime() - 24 * 3600_000);
    if (from >= to) throw new BadRequestException('from must be before to');
    // History is aggregated from raw samples: at a 10 s reporting interval a
    // month is ~260k documents per device. Longer ranges need rollups first.
    if (to.getTime() - from.getTime() > MAX_HISTORY_DAYS * 86400_000)
      throw new BadRequestException('Range too large');
    const spanS = (to.getTime() - from.getTime()) / 1000;
    const bucketS =
      q.bucketSeconds && q.bucketSeconds >= 10
        ? q.bucketSeconds
        : BUCKETS_S.find((b) => spanS / b <= MAX_POINTS) ?? 86400;
    const bucketMs = bucketS * 1000;
    const field = `$metrics.${q.metric}`;
    // $toLong/$mod bucketing works on MongoDB 4.x as well as 5+ (no $dateTrunc).
    const t = { $toLong: '$ts' };
    const rows = (await this.prisma.solarSample.aggregateRaw({
      pipeline: [
        {
          $match: {
            siteId: { $oid: site.id },
            deviceKind: q.kind,
            ...(q.deviceId && { deviceExternalId: q.deviceId }),
            ts: {
              $gte: { $date: from.toISOString() },
              $lte: { $date: to.toISOString() },
            },
            [`metrics.${q.metric}`]: { $type: 'number' },
          },
        },
        // Only the fields needed below travel through the pipeline.
        {
          $project: {
            _id: 0,
            i: '$installationId',
            d: '$deviceExternalId',
            ts: 1,
            v: field,
          },
        },
        {
          $group: {
            _id: {
              i: '$i',
              d: '$d',
              t: { $subtract: [t, { $mod: [t, bucketMs] }] },
            },
            avg: { $avg: '$v' },
            min: { $min: '$v' },
            max: { $max: '$v' },
            n: { $sum: 1 },
          },
        },
        { $sort: { '_id.t': 1 } },
      ],
      // Hard stop for a pathological query instead of holding a connection.
      options: { maxTimeMS: 10_000 },
    })) as unknown as Array<{
      _id: {
        i: string | { $oid: string };
        d: string;
        t: number | { $numberLong: string };
      };
      avg: number;
      min: number;
      max: number;
      n: number;
    }>;

    // One series per device per installation (two Pis on a site may reuse ids).
    const series = new Map<
      string,
      {
        installationId: string;
        deviceId: string;
        points: Array<{
          t: number;
          avg: number;
          min: number;
          max: number;
          n: number;
        }>;
      }
    >();
    for (const r of rows) {
      const tt =
        typeof r._id.t === 'object'
          ? Number(r._id.t.$numberLong)
          : Number(r._id.t);
      const inst = typeof r._id.i === 'object' ? r._id.i.$oid : String(r._id.i);
      const key = `${inst}:${r._id.d}`;
      const entry = series.get(key) ?? {
        installationId: inst,
        deviceId: r._id.d,
        points: [],
      };
      entry.points.push({ t: tt, avg: r.avg, min: r.min, max: r.max, n: r.n });
      series.set(key, entry);
    }
    const unit = await this.prisma.solarMetric.findUnique({
      where: {
        siteId_deviceKind_key: {
          siteId: site.id,
          deviceKind: q.kind,
          key: q.metric,
        },
      },
      select: { unit: true },
    });
    return {
      metric: q.metric,
      kind: q.kind,
      unit: unit?.unit ?? null,
      from: from.toISOString(),
      to: to.toISOString(),
      bucketSeconds: bucketS,
      series: [...series.values()],
    };
  }
}
