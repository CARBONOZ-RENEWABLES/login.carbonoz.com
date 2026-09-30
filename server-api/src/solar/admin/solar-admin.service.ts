import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ESolarDeviceKind,
  ESolarEventSeverity,
  ESolarIngestStatus,
  Prisma,
} from '@prisma/client';
import { IAppConfig } from 'src/__shared__/interfaces';
import { containsFilter } from 'src/__shared__/utils/query';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/redis/redis.service';
import { installationStatus } from 'src/tenancy/installation-status';
import { LIVE_STALE_MS, SolarKeys } from '../solar.keys';
import { LiveDevice } from '../store/solar-store.service';

const DAY_MS = 24 * 3600_000;

/** Fields of SolarIngest safe and cheap to list (the payload is fetched per record). */
const INGEST_SUMMARY = {
  id: true,
  installationId: true,
  siteId: true,
  messageId: true,
  schemaVersion: true,
  sourceTimestamp: true,
  receivedAt: true,
  processedAt: true,
  status: true,
  error: true,
} as const;

/** XINFO / XPENDING replies are flat [key, value, …] arrays. */
function pairs(reply: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (Array.isArray(reply))
    for (let i = 0; i + 1 < reply.length; i += 2)
      out[String(reply[i])] = reply[i + 1];
  return out;
}

const n = (v: unknown): number | null =>
  v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null;

/**
 * Read-only monitoring for the admin panel: pipeline health, per-installation
 * ingestion statistics and cross-site lists of raw ingests, devices, events
 * and the metric catalogue. Never used by customer endpoints.
 */
@Injectable()
export class SolarAdminService {
  private readonly streamKey: string;
  private readonly workerEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    config: ConfigService<IAppConfig>,
  ) {
    const cfg = config.get('solar');
    this.streamKey = cfg.streamKey;
    this.workerEnabled = cfg.workerEnabled;
  }

  /** Redis calls must not queue while disconnected; null means "unavailable". */
  private async r<T>(fn: () => Promise<T>): Promise<T | null> {
    if (!this.redis.ready) return null;
    try {
      return await fn();
    } catch {
      return null;
    }
  }

  async health() {
    const since = new Date(Date.now() - DAY_MS);
    const mongoStart = Date.now();
    const mongoOk = await this.prisma
      .$runCommandRaw({ ping: 1 })
      .then(() => true)
      .catch(() => false);
    const mongoMs = Date.now() - mongoStart;

    const [length, groups, pending, redisDeadLetters] = await Promise.all([
      this.r(() => this.redis.raw.xLen(this.streamKey)),
      this.r(async () =>
        (
          (await this.redis.raw.sendCommand([
            'XINFO',
            'GROUPS',
            this.streamKey,
          ])) as unknown[]
        ).map(pairs),
      ),
      this.r(
        async () =>
          (await this.redis.raw.sendCommand([
            'XPENDING',
            this.streamKey,
            SolarKeys.group,
          ])) as unknown[],
      ),
      this.r(() => this.redis.raw.xLen(SolarKeys.deadLetters)),
    ]);
    const group = groups?.find((g) => g.name === SolarKeys.group);

    const [byStatus, deadLetters, lastIngest, installations] =
      await Promise.all([
        mongoOk
          ? this.prisma.solarIngest.groupBy({
              by: ['status'],
              where: { receivedAt: { gte: since } },
              _count: { _all: true },
            })
          : [],
        mongoOk ? this.prisma.solarDeadLetter.count() : null,
        mongoOk
          ? this.prisma.solarIngest.findFirst({
              orderBy: { receivedAt: 'desc' },
              select: { receivedAt: true },
            })
          : null,
        mongoOk
          ? this.prisma.installation.findMany({
              select: { active: true, lastSeenAt: true },
            })
          : [],
      ]);
    const last24h = Object.fromEntries(
      Object.values(ESolarIngestStatus).map((s) => [
        s,
        byStatus.find((b) => b.status === s)?._count._all ?? 0,
      ]),
    ) as Record<ESolarIngestStatus, number>;
    const statuses = installations.map((i) => installationStatus(i));

    return {
      checkedAt: new Date().toISOString(),
      mongo: { ok: mongoOk, latencyMs: mongoOk ? mongoMs : null },
      redis: { ok: this.redis.ready },
      worker: {
        enabled: this.workerEnabled,
        consumerGroup: group ? SolarKeys.group : null,
        consumers: n(group?.consumers),
        lag: n(group?.lag),
      },
      stream: {
        key: this.streamKey,
        length,
        pending: n(pending?.[0]),
      },
      deadLetters: { stored: deadLetters, redisFallback: redisDeadLetters },
      ingests24h: last24h,
      lastReceivedAt: lastIngest?.receivedAt ?? null,
      installations: {
        total: installations.length,
        online: statuses.filter((s) => s === 'online').length,
        offline: statuses.filter((s) => s === 'offline').length,
        never: statuses.filter((s) => s === 'never').length,
        inactive: statuses.filter((s) => s === 'inactive').length,
      },
      staleAfterSeconds: LIVE_STALE_MS / 1000,
    };
  }

  /** Per-installation ingestion view: traffic, failures, devices, cells, alarms. */
  async installationStats(filter: { siteId?: string; customerId?: string }) {
    const since = new Date(Date.now() - DAY_MS);
    const installations = await this.prisma.installation.findMany({
      where: {
        ...(filter.siteId && { siteId: filter.siteId }),
        ...(filter.customerId && { site: { customerId: filter.customerId } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        site: {
          select: {
            id: true,
            name: true,
            customer: { select: { id: true, name: true } },
          },
        },
      },
    });
    const ids = installations.map((i) => i.id);
    if (!ids.length) return [];

    const [recent, failedTotal, queued, devices] = await Promise.all([
      this.prisma.solarIngest.groupBy({
        by: ['installationId', 'status'],
        where: { installationId: { in: ids }, receivedAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.solarIngest.groupBy({
        by: ['installationId'],
        where: { installationId: { in: ids }, status: 'FAILED' },
        _count: { _all: true },
      }),
      this.prisma.solarIngest.groupBy({
        by: ['installationId'],
        where: { installationId: { in: ids }, status: 'QUEUED' },
        _count: { _all: true },
      }),
      this.prisma.solarDevice.groupBy({
        by: ['installationId', 'kind'],
        where: { installationId: { in: ids } },
        _count: { _all: true },
      }),
    ]);

    return Promise.all(
      installations.map(async (inst) => {
        const [lastIngest, lastProcessed, counters, alarms, live] =
          await Promise.all([
            this.prisma.solarIngest.findFirst({
              where: { installationId: inst.id },
              orderBy: { receivedAt: 'desc' },
              select: INGEST_SUMMARY,
            }),
            this.prisma.solarIngest.findFirst({
              where: { installationId: inst.id, status: 'PROCESSED' },
              orderBy: { receivedAt: 'desc' },
              select: { processedAt: true },
            }),
            this.r(
              async () =>
                (await this.redis.raw.hGetAll(
                  SolarKeys.stats(inst.id),
                )) as unknown as Record<string, string>,
            ),
            this.r(
              async () =>
                (await this.redis.raw.sMembers(
                  SolarKeys.alarms(inst.siteId, inst.id),
                )) as unknown as string[],
            ),
            this.r(
              async () =>
                (await this.redis.raw.hGetAll(
                  SolarKeys.live(inst.siteId, inst.id),
                )) as unknown as Record<string, string>,
            ),
          ]);
        const count = (s: ESolarIngestStatus) =>
          recent.find((r) => r.installationId === inst.id && r.status === s)
            ?._count._all ?? 0;
        const deviceCounts = Object.fromEntries(
          Object.values(ESolarDeviceKind).map((k) => [
            k,
            devices.find((d) => d.installationId === inst.id && d.kind === k)
              ?._count._all ?? 0,
          ]),
        ) as Record<ESolarDeviceKind, number>;
        return {
          installation: {
            id: inst.id,
            name: inst.name,
            kind: inst.kind,
            active: inst.active,
            externalSystemId: inst.externalSystemId,
            lastSeenAt: inst.lastSeenAt,
            status: installationStatus(inst),
          },
          site: { id: inst.site.id, name: inst.site.name },
          customer: inst.site.customer,
          lastReceivedAt: lastIngest?.receivedAt ?? null,
          lastProcessedAt: lastProcessed?.processedAt ?? null,
          latest: lastIngest,
          last24h: {
            received: count('PROCESSED') + count('FAILED') + count('QUEUED'),
            processed: count('PROCESSED'),
            failed: count('FAILED'),
          },
          failedTotal:
            failedTotal.find((f) => f.installationId === inst.id)?._count
              ._all ?? 0,
          queued:
            queued.find((q) => q.installationId === inst.id)?._count._all ?? 0,
          // Counted by the ingest API since this feature was deployed; null if Redis is down.
          accepted: counters ? n(counters.accepted) ?? 0 : null,
          duplicates: counters ? n(counters.duplicate) ?? 0 : null,
          devices: deviceCounts,
          cells: await this.cellCount(inst.siteId, inst.id, live),
          activeAlarms: alarms ? alarms.length : null,
        };
      }),
    );
  }

  /** Cells currently reported by all BMS of an installation (live snapshot, else last samples). */
  private async cellCount(
    siteId: string,
    installationId: string,
    live: Record<string, string> | null,
  ): Promise<number> {
    const fromLive = Object.entries(live ?? {})
      .filter(([k]) => k.startsWith('BMS:'))
      .map(([, v]) => {
        try {
          return (JSON.parse(v) as LiveDevice).cells?.length ?? 0;
        } catch {
          return 0;
        }
      });
    if (fromLive.length) return fromLive.reduce((a, b) => a + b, 0);
    const samples = await this.prisma.solarSample.findMany({
      where: { siteId, installationId, deviceKind: 'BMS' },
      orderBy: { ts: 'desc' },
      take: 50,
      select: { deviceExternalId: true, cells: true },
    });
    const seen = new Map<string, number>();
    for (const s of samples)
      if (!seen.has(s.deviceExternalId))
        seen.set(
          s.deviceExternalId,
          Array.isArray(s.cells) ? (s.cells as unknown[]).length : 0,
        );
    return [...seen.values()].reduce((a, b) => a + b, 0);
  }

  async ingests(f: {
    status?: ESolarIngestStatus;
    installationId?: string;
    siteId?: string;
    q?: string;
    page: number;
    size: number;
  }) {
    const where: Prisma.SolarIngestWhereInput = {
      ...(f.status && { status: f.status }),
      ...(f.installationId && { installationId: f.installationId }),
      ...(f.siteId && { siteId: f.siteId }),
      ...(f.q && { messageId: containsFilter(f.q) }),
    };
    const [items, total] = await Promise.all([
      this.prisma.solarIngest.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        skip: f.page * f.size,
        take: f.size,
        select: INGEST_SUMMARY,
      }),
      this.prisma.solarIngest.count({ where }),
    ]);
    return { items, total, page: f.page, size: f.size };
  }

  async ingest(id: string) {
    const row = await this.prisma.solarIngest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Ingest not found');
    const inst = await this.prisma.installation.findUnique({
      where: { id: row.installationId },
      select: {
        id: true,
        name: true,
        externalSystemId: true,
        site: { select: { id: true, name: true } },
      },
    });
    return { ...row, installation: inst };
  }

  async devices(f: {
    siteId?: string;
    installationId?: string;
    kind?: ESolarDeviceKind;
  }) {
    const rows = await this.prisma.solarDevice.findMany({
      where: {
        ...(f.siteId && { siteId: f.siteId }),
        ...(f.installationId && { installationId: f.installationId }),
        ...(f.kind && { kind: f.kind }),
      },
      orderBy: [{ kind: 'asc' }, { externalId: 'asc' }],
      take: 1000,
    });
    const now = Date.now();
    return rows.map((d) => ({
      ...d,
      stale: now - d.lastSeenAt.getTime() > LIVE_STALE_MS,
    }));
  }

  events(f: {
    siteId?: string;
    installationId?: string;
    severity?: ESolarEventSeverity;
    active?: boolean;
    limit: number;
  }) {
    return this.prisma.solarEvent.findMany({
      where: {
        ...(f.siteId && { siteId: f.siteId }),
        ...(f.installationId && { installationId: f.installationId }),
        ...(f.severity && { severity: f.severity }),
        ...(f.active !== undefined && { active: f.active }),
      },
      orderBy: { ts: 'desc' },
      take: f.limit,
    });
  }

  metrics(f: { siteId?: string; kind?: ESolarDeviceKind; q?: string }) {
    return this.prisma.solarMetric.findMany({
      where: {
        ...(f.siteId && { siteId: f.siteId }),
        ...(f.kind && { deviceKind: f.kind }),
        ...(f.q && { key: containsFilter(f.q) }),
      },
      orderBy: [{ deviceKind: 'asc' }, { key: 'asc' }],
      take: 5000,
    });
  }
}
