import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
export type MonthlyKwh = Record<(typeof MONTHS)[number], number>;

/**
 * Energy totals derived from SolarBMS samples, for consumers that need
 * production figures (Redex reporting).
 *
 * PV energy is integrated from the SYSTEM `pv_power_w` readings: the average
 * power of every UTC hour × 1 h, summed per month. Hours without readings
 * count as zero, so gaps can only under-report, never over-report. If SolarBMS
 * later sends an energy counter, prefer it here.
 */
@Injectable()
export class SolarEnergyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Sites of every customer the user belongs to. */
  private async siteIdsOf(userId: string): Promise<string[]> {
    const members = await this.prisma.customerMember.findMany({
      where: { userId },
      select: { customerId: true },
    });
    if (!members.length) return [];
    const sites = await this.prisma.site.findMany({
      where: { customerId: { in: members.map((m) => m.customerId) } },
      select: { id: true },
    });
    return sites.map((s) => s.id);
  }

  async monthlyPvKwh(userId: string, year: number): Promise<MonthlyKwh> {
    const out = Object.fromEntries(MONTHS.map((m) => [m, 0])) as MonthlyKwh;
    const siteIds = await this.siteIdsOf(userId);
    if (!siteIds.length) return out;
    const hourMs = 3600_000;
    const t = { $toLong: '$ts' };
    const rows = (await this.prisma.solarSample.aggregateRaw({
      pipeline: [
        {
          $match: {
            siteId: { $in: siteIds.map((id) => ({ $oid: id })) },
            deviceKind: 'SYSTEM',
            ts: {
              $gte: { $date: new Date(Date.UTC(year, 0, 1)).toISOString() },
              $lt: { $date: new Date(Date.UTC(year + 1, 0, 1)).toISOString() },
            },
            'metrics.pv_power_w': { $type: 'number' },
          },
        },
        {
          $project: {
            _id: 0,
            i: '$installationId',
            ts: 1,
            w: '$metrics.pv_power_w',
          },
        },
        // Average power per installation per hour…
        {
          $group: {
            _id: { i: '$i', h: { $subtract: [t, { $mod: [t, hourMs] }] } },
            w: { $avg: '$w' },
          },
        },
        // …× 1 h = Wh, summed per month over all installations.
        {
          $group: {
            _id: { $month: { $toDate: '$_id.h' } },
            wh: { $sum: { $max: ['$w', 0] } },
          },
        },
      ],
      options: { maxTimeMS: 60_000 },
    })) as unknown as Array<{ _id: number; wh: number }>;
    for (const r of rows) {
      const month = MONTHS[r._id - 1];
      if (month) out[month] = Math.round((r.wh / 1000) * 1000) / 1000;
    }
    return out;
  }
}
