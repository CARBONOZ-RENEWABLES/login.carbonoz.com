/**
 * Weather and PV prediction for a site, without anything from the Raspberry:
 * hourly weather for the site's coordinates (Open-Meteo) and a prediction
 * calibrated on the site's own generation. Pure functions, no I/O.
 */

export interface WeatherHour {
  /** Start of the hour, epoch ms (UTC). */
  t: number;
  temperatureC: number | null;
  cloudCoverPct: number | null;
  windSpeedKmh: number | null;
  /** Mean global horizontal irradiance over the hour, W/m². */
  irradianceWm2: number | null;
  precipitationMm: number | null;
}

/** Open-Meteo `hourly` (timeformat=unixtime): values marked for the hour ending at `time`. */
export function parseOpenMeteo(body: unknown): WeatherHour[] {
  const h = (body as { hourly?: Record<string, unknown[]> })?.hourly;
  if (!h || !Array.isArray(h.time)) return [];
  const col = (k: string, i: number) => {
    const v = (h[k] as unknown[] | undefined)?.[i];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  return h.time.map((s, i) => ({
    // Radiation is the mean of the PRECEDING hour: store it at that hour's start.
    t: Number(s) * 1000 - 3600_000,
    temperatureC: col('temperature_2m', i),
    cloudCoverPct: col('cloud_cover', i),
    windSpeedKmh: col('wind_speed_10m', i),
    irradianceWm2: col('shortwave_radiation', i),
    precipitationMm: col('precipitation', i),
  }));
}

/** Hours with good sun count for calibration; dimmer hours are dominated by angle/shade. */
const MIN_IRRADIANCE = 200;
const MIN_HOURS = 12;

/**
 * W of PV per W/m² of irradiance for this site: the 80th percentile of the
 * hourly ratios (sunny hours only). A high percentile, because a full battery
 * or export limit curtails PV below what the panels could give.
 */
export function calibrate(
  pairs: Array<{ irradianceWm2: number | null; pvW: number | null }>,
): { factor: number; hours: number } | null {
  const ratios = pairs
    .filter(
      (p) =>
        p.irradianceWm2 != null &&
        p.irradianceWm2 >= MIN_IRRADIANCE &&
        p.pvW != null &&
        p.pvW >= 0,
    )
    .map((p) => (p.pvW as number) / (p.irradianceWm2 as number))
    .sort((a, b) => a - b);
  if (ratios.length < MIN_HOURS) return null;
  const factor =
    ratios[Math.min(ratios.length - 1, Math.floor(ratios.length * 0.8))];
  return factor > 0 ? { factor, hours: ratios.length } : null;
}

export interface DayEnergy {
  generatedKwh: number | null;
  predictedKwh: number | null;
}

/**
 * kWh per day from hourly mean powers (W × 1 h). `generated` counts measured
 * hours only (up to now); `remaining` = predicted for hours still to come today.
 */
export function dayEnergy(
  hours: Array<{ t: number; pvW: number | null; predictedW: number | null }>,
  from: number,
  to: number,
  now: number,
) {
  let gen = 0,
    genN = 0,
    pred = 0,
    predN = 0,
    remaining = 0;
  for (const h of hours) {
    if (h.t < from || h.t >= to) continue;
    if (h.pvW != null && h.t < now) (gen += h.pvW / 1000), genN++;
    if (h.predictedW != null) {
      pred += h.predictedW / 1000;
      predN++;
      // Rest of the current hour, then every later hour.
      if (h.t + 3600_000 > now)
        remaining +=
          (h.predictedW / 1000) *
          Math.min(1, (h.t + 3600_000 - Math.max(now, h.t)) / 3600_000);
    }
  }
  const r = (x: number) => Math.round(x * 10) / 10;
  return {
    generatedKwh: genN ? r(gen) : null,
    predictedKwh: predN ? r(pred) : null,
    remainingKwh: predN ? r(remaining) : null,
  };
}
