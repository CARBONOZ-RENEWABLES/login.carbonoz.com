import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ESolarDeviceKind, Prisma } from '@prisma/client';
import { IAppConfig, SolarConfig } from 'src/__shared__/interfaces';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/redis/redis.service';
import { StreamMessage } from '../ingest/solar-ingest.service';
import {
  NormalizedBatch,
  NormalizedSample,
  normalizeSolarBms,
} from '../normalize/solarbms.normalizer';
import { toMongoSafe } from '../normalize/mongo-safe';
import { MAX_METRICS_PER_SITE, SolarKeys } from '../solar.keys';

export interface LiveDevice {
  installationId: string;
  kind: ESolarDeviceKind;
  externalId: string;
  ts: string;
  metrics: Record<string, unknown>;
  cells?: unknown[];
  status?: string;
}

const json = (v: unknown) => v as Prisma.InputJsonValue;

/**
 * MongoDB unreachable/slow (retry forever — the stream is the buffer) versus a
 * permanent failure of this message (retry a few times, then dead-letter).
 */
export function isTransient(e: unknown): boolean {
  if (
    e instanceof Prisma.PrismaClientInitializationError ||
    e instanceof Prisma.PrismaClientRustPanicError
  )
    return true;
  if (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    ['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2034'].includes(e.code)
  )
    return true;
  return /server selection|timed out|timeout|ECONNREFUSED|ECONNRESET|connection (closed|refused)|not connected|topology/i.test(
    String((e as Error)?.message ?? e),
  );
}

/**
 * Worker side: raw payload → MongoDB (always first), then the normalized
 * devices, samples, events, forecast and metric catalogue, then the Redis live
 * snapshot. Idempotent per (installationId, messageId): a retry removes what a
 * previous attempt derived before writing again.
 */
@Injectable()
export class SolarStoreService {
  private readonly logger = new Logger(SolarStoreService.name);
  private readonly cfg: SolarConfig;

  constructor(
    config: ConfigService<IAppConfig>,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.cfg = config.get('solar');
  }

  /**
   * `stored: false` only when not even the raw payload could be saved; the
   * worker then leaves the entry pending (bounded retries, then dead-letter).
   */
  async processStreamMessage(
    m: StreamMessage,
  ): Promise<{ stored: boolean; error?: string; transient?: boolean }> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m.payload);
    } catch {
      parsed = { unparseable: m.payload };
    }
    // Field names MongoDB can't store are rewritten; the original text is kept.
    const { value: payload, changed } = toMongoSafe(parsed);
    const sourceTs = (payload as Record<string, unknown>)?.timestamp;
    const where = {
      installationId_messageId: {
        installationId: m.installationId,
        messageId: m.messageId,
      },
    };
    let ingest;
    // Created by this attempt → nothing derived yet. Already there → an earlier
    // attempt may have written part of the derived rows, so derive() clears them.
    let created = true;
    try {
      ingest = await this.prisma.solarIngest.create({
        data: {
          installationId: m.installationId,
          siteId: m.siteId,
          messageId: m.messageId,
          receivedAt: new Date(m.receivedAt),
          schemaVersion:
            String((payload as Record<string, unknown>)?.schemaVersion ?? '') ||
            null,
          sourceTimestamp:
            typeof sourceTs === 'string' && !isNaN(Date.parse(sourceTs))
              ? new Date(sourceTs)
              : null,
          payload: json(payload),
          rawText: changed ? m.payload : undefined,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        created = false;
        ingest = await this.prisma.solarIngest
          .findUnique({ where })
          .catch(() => null);
      }
      if (!ingest) {
        this.logger.error(
          `Could not store raw ingest ${m.messageId}: ${e.message}`,
        );
        return {
          stored: false,
          error: String(e.message).slice(0, 2000),
          transient: isTransient(e),
        };
      }
    }
    if (ingest.status === 'PROCESSED') return { stored: true };
    const derived = await this.derive(ingest.id, !created);
    // derive() records its own failures; `false` means MongoDB was unreachable.
    return derived
      ? { stored: true }
      : {
          stored: false,
          error: 'derive outcome not recorded',
          transient: true,
        };
  }

  /** (Re)builds everything derived from one stored raw payload. */
  /** True once the outcome is stored: PROCESSED, or FAILED with the raw payload kept. */
  async derive(ingestId: string, clearPrevious = true): Promise<boolean> {
    const ingest = await this.prisma.solarIngest
      .findUnique({ where: { id: ingestId } })
      .catch(() => undefined);
    if (ingest === undefined) return false;
    if (!ingest) return true;
    const { siteId, installationId } = ingest;
    try {
      if (clearPrevious) {
        await Promise.all([
          this.prisma.solarSample.deleteMany({ where: { ingestId } }),
          this.prisma.solarEvent.deleteMany({ where: { ingestId } }),
          this.prisma.solarForecast.deleteMany({ where: { ingestId } }),
        ]);
      }
      const n = normalizeSolarBms(ingest.payload, ingest.receivedAt);
      // Catalogue first: names beyond the per-site cap are dropped from the
      // normalized data (they stay in the raw payload).
      const rejected = await this.catalogueMetrics(siteId, n);
      if (rejected.size) {
        for (const smp of n.samples)
          for (const k of Object.keys(smp.metrics))
            if (rejected.has(`${smp.kind}|${k}`)) delete smp.metrics[k];
        n.warnings.push(
          `metric catalogue full (${MAX_METRICS_PER_SITE}); ${rejected.size} new metric name(s) kept in the raw payload only`,
        );
      }

      await this.upsertDevices(siteId, installationId, n);
      if (n.samples.length) {
        await this.prisma.solarSample.createMany({
          data: n.samples.map((s) => ({
            siteId,
            installationId,
            ingestId,
            deviceKind: s.kind,
            deviceExternalId: s.externalId,
            ts: s.ts,
            metrics: json(s.metrics),
            cells: s.cells ? json(s.cells) : undefined,
            status: s.status,
          })),
        });
      }
      await this.storeEvents(siteId, installationId, ingestId, n);
      if (n.forecast) {
        await this.prisma.solarForecast.create({
          data: {
            siteId,
            installationId,
            ingestId,
            generatedAt: n.forecast.generatedAt,
            source: n.forecast.source,
            points: json(n.forecast.points),
          },
        });
      }
      await this.updateLive(siteId, installationId, n.samples);
      await this.prisma.installation.update({
        where: { id: installationId },
        data: { lastSeenAt: new Date() },
      });
      await this.prisma.solarIngest.update({
        where: { id: ingestId },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
          error: n.warnings.length
            ? `warnings: ${n.warnings.slice(0, 20).join('; ')}`
            : null,
        },
      });
      return true;
    } catch (e) {
      // Raw payload stays; an admin can reprocess once the cause is fixed.
      this.logger.error(`Normalizing ingest ${ingestId} failed: ${e.message}`);
      return this.prisma.solarIngest
        .update({
          where: { id: ingestId },
          data: { status: 'FAILED', error: String(e.message).slice(0, 2000) },
        })
        .then(() => true)
        .catch(() => false);
    }
  }

  private async upsertDevices(
    siteId: string,
    installationId: string,
    n: NormalizedBatch,
  ) {
    await Promise.all(
      n.devices.map((d) => {
        const fields = {
          parentExternalId: d.parentExternalId,
          name: d.name,
          manufacturer: d.manufacturer,
          model: d.model,
          ...(d.attributes && { attributes: json(d.attributes) }),
        };
        const defined = Object.fromEntries(
          Object.entries(fields).filter(([, v]) => v !== undefined),
        );
        return this.prisma.solarDevice
          .upsert({
            where: {
              installationId_kind_externalId: {
                installationId,
                kind: d.kind,
                externalId: d.externalId,
              },
            },
            create: {
              siteId,
              installationId,
              kind: d.kind,
              externalId: d.externalId,
              ...defined,
              lastSeenAt: n.ts,
            },
            update: defined,
          })
          .then((row) =>
            // lastSeenAt only moves forward: an older (backfilled) reading never rewinds it.
            row.lastSeenAt < n.ts
              ? this.prisma.solarDevice.updateMany({
                  where: { id: row.id, lastSeenAt: { lt: n.ts } },
                  data: { lastSeenAt: n.ts },
                })
              : undefined,
          );
      }),
    );
  }

  /**
   * One-off events are stored as they come. Alarms are state: an event is
   * written when an alarm appears and marked inactive when a device that is
   * reporting in this batch stops reporting it.
   */
  private async storeEvents(
    siteId: string,
    installationId: string,
    ingestId: string,
    n: NormalizedBatch,
  ) {
    const oneOff = n.events.filter((e) => !e.isAlarm);
    if (oneOff.length) {
      await this.prisma.solarEvent.createMany({
        data: oneOff.map((e) => ({
          siteId,
          installationId,
          ingestId,
          deviceKind: e.kind,
          deviceExternalId: e.externalId,
          ts: e.ts,
          severity: e.severity,
          code: e.code,
          message: e.message,
          active: false,
          raw: e.raw === undefined ? undefined : json(e.raw),
        })),
      });
    }

    const key = SolarKeys.alarms(siteId, installationId);
    const alarmId = (kind: string, ext: string, code: string) =>
      `${kind}|${ext}|${code}`;

    // Alarm state follows the newest reading per device: a reading older than
    // the one the current state reflects (backfill, out of order) changes nothing.
    const stateKey = SolarKeys.alarmState(siteId, installationId);
    const deviceTs = new Map<string, Date>();
    for (const smp of n.samples) {
      const d = `${smp.kind}|${smp.externalId}`;
      if (!deviceTs.has(d) || deviceTs.get(d) < smp.ts) deviceTs.set(d, smp.ts);
    }
    const devices = [...deviceTs.keys()];
    const prevTs = devices.length
      ? ((await this.redis.raw.hmGet(stateKey, devices)) as unknown as Array<
          string | null
        >)
      : [];
    const current = new Set(
      devices.filter(
        (d, i) =>
          !prevTs[i] || deviceTs.get(d).toISOString() >= String(prevTs[i]),
      ),
    );
    if (current.size) {
      await this.redis.raw.hSet(
        stateKey,
        Object.fromEntries(
          [...current].map((d) => [d, deviceTs.get(d).toISOString()]),
        ),
      );
    }

    const reported = new Map(
      n.events
        .filter((e) => e.isAlarm && current.has(`${e.kind}|${e.externalId}`))
        .map((e) => [alarmId(e.kind, e.externalId, e.code ?? e.message), e]),
    );
    const known = new Set<string>(
      [...(await this.redis.raw.sMembers(key))].map(String),
    );

    for (const [id, e] of reported) {
      if (known.has(id)) continue;
      await this.prisma.solarEvent.create({
        data: {
          siteId,
          installationId,
          ingestId,
          deviceKind: e.kind,
          deviceExternalId: e.externalId,
          ts: e.ts,
          severity: e.severity,
          code: e.code,
          message: e.message,
          active: true,
          raw: e.raw === undefined ? undefined : json(e.raw),
        },
      });
      await this.redis.raw.sAdd(key, id);
    }

    for (const id of known) {
      if (reported.has(id)) continue;
      const [kind, ext, code] = id.split('|');
      // Only devices whose alarm state this (newest) reading defines can clear.
      if (!current.has(`${kind}|${ext}`)) continue;
      await this.prisma.solarEvent.updateMany({
        where: {
          siteId,
          installationId,
          deviceKind: kind as ESolarDeviceKind,
          deviceExternalId: ext,
          code,
          active: true,
        },
        data: { active: false },
      });
      await this.redis.raw.sRem(key, id);
    }
  }

  /** Catalogues new metric names; returns the `<KIND>|<key>` names refused by the per-site cap. */
  private async catalogueMetrics(
    siteId: string,
    n: NormalizedBatch,
  ): Promise<Set<string>> {
    const key = SolarKeys.metrics(siteId);
    const seen = new Map<
      string,
      { kind: ESolarDeviceKind; key: string; type: string }
    >();
    for (const s of n.samples) {
      for (const [k, v] of Object.entries(s.metrics))
        seen.set(`${s.kind}|${k}`, { kind: s.kind, key: k, type: typeof v });
    }
    if (n.forecast) {
      for (const p of n.forecast.points) {
        for (const [k, v] of Object.entries(p))
          if (k !== 'ts')
            seen.set(`FORECAST|${k}`, {
              kind: 'SYSTEM',
              key: `forecast_${k}`,
              type: typeof v,
            });
      }
    }
    const ids = [...seen.keys()];
    const rejected = new Set<string>();
    if (!ids.length) return rejected;
    // The catalogue is written once per key; Redis remembers which keys are known.
    const known = (await this.redis.raw.smIsMember(
      key,
      ids,
    )) as unknown as number[];
    let fresh = ids.filter((_, i) => !known[i]);
    if (!fresh.length) return rejected;
    // A broken device inventing names (e.g. timestamps in keys) can't grow the
    // catalogue — and the normalized samples — without bound.
    const count = await this.prisma.solarMetric.count({ where: { siteId } });
    const room = Math.max(0, MAX_METRICS_PER_SITE - count);
    if (fresh.length > room) {
      for (const id of fresh.slice(room))
        if (!id.startsWith('FORECAST|')) rejected.add(id);
      this.logger.warn(
        `Site ${siteId}: metric catalogue full, ${
          fresh.length - room
        } new name(s) refused`,
      );
      fresh = fresh.slice(0, room);
      if (!fresh.length) return rejected;
    }
    await Promise.all(
      fresh.map((id) => {
        const m = seen.get(id);
        return this.prisma.solarMetric.upsert({
          where: {
            siteId_deviceKind_key: { siteId, deviceKind: m.kind, key: m.key },
          },
          create: {
            siteId,
            deviceKind: m.kind,
            key: m.key,
            unit: n.units[m.key.replace(/^forecast_/, '')],
            valueType: m.type,
          },
          update: { lastSeenAt: new Date() },
        });
      }),
    );
    await this.redis.raw.sAdd(key, fresh);
    return rejected;
  }

  private async updateLive(
    siteId: string,
    installationId: string,
    samples: NormalizedSample[],
  ) {
    if (!samples.length) return;
    const key = SolarKeys.live(siteId, installationId);
    const fields = samples.map((s) => `${s.kind}:${s.externalId}`);
    const prev = (await this.redis.raw.hmGet(key, fields)) as unknown as Array<
      string | null
    >;
    const next: Record<string, string> = {};
    samples.forEach((s, i) => {
      // Ignore backfilled history arriving after newer data.
      if (prev[i] && JSON.parse(String(prev[i])).ts > s.ts.toISOString())
        return;
      const live: LiveDevice = {
        installationId,
        kind: s.kind,
        externalId: s.externalId,
        ts: s.ts.toISOString(),
        metrics: s.metrics,
        cells: s.cells,
        status: s.status,
      };
      next[fields[i]] = JSON.stringify(live);
    });
    if (Object.keys(next).length) {
      next._meta = JSON.stringify({
        updatedAt: new Date().toISOString(),
        installationId,
      });
      await this.redis.raw.hSet(key, next);
    }
    await this.redis.raw.expire(key, this.cfg.liveTtlSeconds);
  }
}
