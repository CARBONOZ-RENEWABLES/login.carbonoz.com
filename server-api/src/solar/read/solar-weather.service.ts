import { Injectable, Logger } from '@nestjs/common';
import { Site } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/redis/redis.service';
import {
  addDays,
  localDay,
  localMidnight,
  safeTimeZone,
} from './energy-calendar';
import { calibrate, dayEnergy, parseOpenMeteo, WeatherHour } from './weather';

const H = 3600_000;
const CACHE_S = 30 * 60;
/** Last good answer, used while the weather service is slow or down. */
const LAST_GOOD_S = 12 * 3600;
const CALIBRATION_DAYS = 7;
const DEFAULT_URL = 'https://api.open-meteo.com/v1/forecast';

type Unavailable = {
  available: false;
  reason: 'disabled' | 'no_location' | 'unavailable';
};

/**
 * Weather for the site's coordinates (Open-Meteo, no key) and a PV prediction
 * calibrated on the site's own hourly generation (SolarRollupHour). Cached in
 * Redis per location for 30 minutes; the only outbound call of the API.
 */
@Injectable()
export class SolarWeatherService {
  private readonly logger = new Logger(SolarWeatherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async forSite(site: Site, now = new Date()) {
    if (process.env.WEATHER_ENABLED === 'false')
      return { available: false, reason: 'disabled' } as Unavailable;
    if (site.latitude == null || site.longitude == null)
      return { available: false, reason: 'no_location' } as Unavailable;
    const weather = await this.weather(site.latitude, site.longitude);
    if (!weather?.length)
      return { available: false, reason: 'unavailable' } as Unavailable;

    const tz = safeTimeZone(site.timezone);
    const today = localDay(now, tz);
    const start = localMidnight(addDays(today, -1), tz).getTime();
    const end = localMidnight(addDays(today, 2), tz).getTime();
    const calFrom = now.getTime() - CALIBRATION_DAYS * 24 * H;
    const pv = await this.pvByHour(
      site.id,
      Math.min(calFrom, start),
      now.getTime() + H,
    );

    const cal = calibrate(
      weather
        .filter((w) => w.t >= calFrom && w.t + H <= now.getTime())
        .map((w) => ({
          irradianceWm2: w.irradianceWm2,
          pvW: pv.get(w.t) ?? null,
        })),
    );
    const hourly = weather
      .filter((w) => w.t >= start && w.t < end)
      .map((w) => ({
        ...w,
        pvW: w.t <= now.getTime() ? pv.get(w.t) ?? null : null,
        predictedW:
          cal && w.irradianceWm2 != null
            ? Math.round(cal.factor * w.irradianceWm2)
            : null,
      }));
    const day = (offset: number) => {
      const d = addDays(today, offset);
      return dayEnergy(
        hourly,
        localMidnight(d, tz).getTime(),
        localMidnight(addDays(d, 1), tz).getTime(),
        now.getTime(),
      );
    };
    return {
      available: true as const,
      source: 'open-meteo',
      timezone: tz,
      location: { latitude: site.latitude, longitude: site.longitude },
      /** W of PV per W/m² (null: not enough sunny hours with data yet). */
      calibration: cal,
      now: now.toISOString(),
      hourly,
      days: { yesterday: day(-1), today: day(0), tomorrow: day(1) },
    };
  }

  /** Hourly weather (7 days back, 3 ahead), cached per location. */
  private async weather(
    lat: number,
    lon: number,
  ): Promise<WeatherHour[] | null> {
    const key = `solar:weather:${lat.toFixed(3)},${lon.toFixed(3)}`;
    const cached = await this.redis.get(key).catch(() => null);
    if (cached) return JSON.parse(cached);
    const url = new URL(process.env.WEATHER_URL || DEFAULT_URL);
    url.search = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      hourly:
        'temperature_2m,cloud_cover,wind_speed_10m,shortwave_radiation,precipitation',
      past_days: '7',
      forecast_days: '3',
      timeformat: 'unixtime',
      timezone: 'GMT',
    }).toString();
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const hours = parseOpenMeteo(await r.json());
      if (hours.length) {
        const json = JSON.stringify(hours);
        await this.redis.set(key, json, CACHE_S).catch(() => undefined);
        await this.redis
          .set(`${key}:last`, json, LAST_GOOD_S)
          .catch(() => undefined);
      }
      return hours;
    } catch (e) {
      this.logger.warn(`weather fetch failed: ${e.message}`);
      const last = await this.redis.get(`${key}:last`).catch(() => null);
      return last ? JSON.parse(last) : null;
    }
  }

  /**
   * Site PV per hour (mean W) from the hourly rollups: the SYSTEM value of
   * each installation, else the sum of its inverters.
   */
  private async pvByHour(siteId: string, from: number, to: number) {
    const rows = (await this.prisma.solarRollupHour.aggregateRaw({
      pipeline: [
        {
          $match: {
            siteId: { $oid: siteId },
            deviceKind: { $in: ['SYSTEM', 'INVERTER'] },
            hour: {
              $gte: { $date: new Date(from).toISOString() },
              $lt: { $date: new Date(to).toISOString() },
            },
            'metrics.pv_power_w.n': { $gt: 0 },
          },
        },
        {
          $group: {
            _id: {
              i: '$installationId',
              k: '$deviceKind',
              h: { $toLong: '$hour' },
            },
            w: {
              $sum: {
                $divide: ['$metrics.pv_power_w.sum', '$metrics.pv_power_w.n'],
              },
            },
          },
        },
      ],
      options: { maxTimeMS: 10_000 },
    })) as unknown as Array<{
      _id: { i: unknown; k: string; h: number | { $numberLong: string } };
      w: number;
    }>;
    const byInst = new Map<string, { SYSTEM?: number; INVERTER?: number }>();
    for (const r of rows) {
      const h =
        typeof r._id.h === 'object'
          ? Number(r._id.h.$numberLong)
          : Number(r._id.h);
      const key = `${JSON.stringify(r._id.i)}|${h}`;
      byInst.set(key, { ...byInst.get(key), [r._id.k]: r.w });
    }
    const out = new Map<number, number>();
    for (const [key, v] of byInst) {
      const h = Number(key.split('|')[1]);
      out.set(h, (out.get(h) ?? 0) + (v.SYSTEM ?? v.INVERTER ?? 0));
    }
    return out;
  }
}
