import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import {
  exhaustMap,
  finalize,
  map,
  Observable,
  share,
  takeUntil,
  timer,
} from 'rxjs';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/redis/redis.service';
import { SolarKeys } from '../solar.keys';

/** How often the live state is read and a frame (snapshot or heartbeat) sent. */
export const LIVE_TICK_MS = 1000;
/** A stream ends after this; the client reconnects, which re-checks the session and site access. */
export const LIVE_STREAM_MAX_MS = 10 * 60_000;
/** Installation list of a site is re-read this often (new installations appear without reconnecting). */
const INSTALLATIONS_REFRESH_MS = 30_000;
/** Kinds whose latest readings make up the live energy state (BMS cells stay out: large, not needed). */
const LIVE_KINDS = new Set(['SYSTEM', 'INVERTER', 'BATTERY']);

export interface LiveFrameDevice {
  installationId: string;
  kind: string;
  externalId: string;
  /** Time of the reading (SolarBMS timestamp), ISO. */
  ts: string;
  metrics: Record<string, unknown>;
  status?: string;
}

interface Frame {
  /** null: the live state could not be read (Redis unavailable). */
  devices: LiveFrameDevice[] | null;
  serverTime: string;
}

/**
 * Realtime state of a site for the Energy Flow, as server-sent events.
 *
 * Source: the Redis live snapshot the worker writes for every processed
 * SolarBMS message (`solar:live:<site>:<installation>`), i.e. the same data
 * the overview reads. One 1-second reader per site and API instance is
 * shared by all its viewers. Each connection gets a `snapshot` when the
 * readings changed and a `heartbeat` otherwise, both with the server time,
 * so the client can tell "connection alive" from "readings fresh" and needs
 * no trust in its own clock.
 */
@Injectable()
export class SolarLiveService {
  private readonly logger = new Logger(SolarLiveService.name);
  private readonly sites = new Map<string, Observable<Frame>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private site$(siteId: string): Observable<Frame> {
    const existing = this.sites.get(siteId);
    if (existing) return existing;
    let installations: string[] = [];
    let fetchedAt = 0;
    const read = async (): Promise<Frame> => {
      const serverTime = () => new Date().toISOString();
      try {
        if (Date.now() - fetchedAt > INSTALLATIONS_REFRESH_MS) {
          installations = (
            await this.prisma.installation.findMany({
              where: { siteId },
              select: { id: true },
            })
          ).map((i) => i.id);
          fetchedAt = Date.now();
        }
        if (!this.redis.ready)
          return { devices: null, serverTime: serverTime() };
        const devices: LiveFrameDevice[] = [];
        for (const installationId of installations) {
          const hash = (await this.redis.raw.hGetAll(
            SolarKeys.live(siteId, installationId),
          )) as unknown as Record<string, string>;
          for (const [field, raw] of Object.entries(hash ?? {})) {
            if (field === '_meta') continue;
            const d = JSON.parse(String(raw));
            if (!LIVE_KINDS.has(d.kind)) continue;
            devices.push({
              installationId,
              kind: d.kind,
              externalId: d.externalId,
              ts: d.ts,
              metrics: d.metrics ?? {},
              ...(d.status && { status: d.status }),
            });
          }
        }
        devices.sort((a, b) =>
          `${a.installationId}${a.kind}${a.externalId}`.localeCompare(
            `${b.installationId}${b.kind}${b.externalId}`,
          ),
        );
        return { devices, serverTime: serverTime() };
      } catch (e) {
        this.logger.warn(
          `Live state of site ${siteId} unavailable: ${e.message}`,
        );
        return { devices: null, serverTime: serverTime() };
      }
    };
    const shared = timer(0, LIVE_TICK_MS).pipe(
      // A slow read skips ticks instead of piling up.
      exhaustMap(read),
      finalize(() => this.sites.delete(siteId)),
      share(),
    );
    this.sites.set(siteId, shared);
    return shared;
  }

  /** Server-sent events for one viewer of a site. */
  stream(siteId: string): Observable<MessageEvent> {
    let last: string | undefined;
    return this.site$(siteId).pipe(
      map((f): MessageEvent => {
        if (f.devices === null)
          return {
            type: 'heartbeat',
            data: { serverTime: f.serverTime, available: false },
          };
        const key = JSON.stringify(f.devices);
        if (key === last)
          return {
            type: 'heartbeat',
            data: { serverTime: f.serverTime, available: true },
          };
        last = key;
        return { type: 'snapshot', data: f };
      }),
      takeUntil(timer(LIVE_STREAM_MAX_MS)),
    );
  }
}
