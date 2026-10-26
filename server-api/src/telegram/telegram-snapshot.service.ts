import { Injectable } from '@nestjs/common';
import { Site } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { SolarReadService } from 'src/solar/read/solar-read.service';
import { SiteSnapshot, SnapshotDevice } from './telegram-alerts';

/**
 * A site's current state for Telegram, from the SAME read model as the
 * dashboard: the live snapshot (or newest stored sample) per device, the
 * site's installations, and its active SolarEvent alarms. No other data
 * source, no fallback values.
 */
@Injectable()
export class TelegramSnapshotService {
  constructor(
    private readonly read: SolarReadService,
    private readonly prisma: PrismaService,
  ) {}

  async of(site: Site): Promise<SiteSnapshot> {
    const [latest, installations, alarms] = await Promise.all([
      this.read.latest(site),
      this.prisma.installation.findMany({
        where: { siteId: site.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, active: true },
      }),
      this.prisma.solarEvent.findMany({
        where: { siteId: site.id, active: true },
        orderBy: { ts: 'desc' },
        take: 50,
        select: {
          id: true,
          installationId: true,
          deviceKind: true,
          deviceExternalId: true,
          severity: true,
          code: true,
          message: true,
          ts: true,
        },
      }),
    ]);
    return {
      siteId: site.id,
      siteName: site.name,
      timezone: site.timezone,
      updatedAt: latest.updatedAt,
      installations,
      devices: latest.devices.map(
        (d): SnapshotDevice => ({
          installationId: d.installationId,
          kind: d.kind as SnapshotDevice['kind'],
          externalId: d.externalId,
          ts: d.ts,
          metrics: d.metrics,
        }),
      ),
      alarms: alarms.map((a) => ({
        id: a.id,
        installationId: a.installationId,
        deviceKind: a.deviceKind,
        deviceExternalId: a.deviceExternalId,
        severity: a.severity,
        code: a.code,
        message: a.message,
        ts: a.ts.toISOString(),
      })),
    };
  }
}
