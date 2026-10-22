import { calibrate, dayEnergy, parseOpenMeteo } from './weather';

describe('weather and PV prediction', () => {
  it('parses Open-Meteo hourly data; each value belongs to the hour before its time', () => {
    const h = parseOpenMeteo({
      hourly: {
        time: [1792670400, 1792674000],
        temperature_2m: [24.5, 'x'],
        cloud_cover: [10, 90],
        wind_speed_10m: [12, 15],
        shortwave_radiation: [650, 0],
        precipitation: [0, 1.2],
      },
    });
    expect(h).toEqual([
      {
        t: 1792670400000 - 3600_000,
        temperatureC: 24.5,
        cloudCoverPct: 10,
        windSpeedKmh: 12,
        irradianceWm2: 650,
        precipitationMm: 0,
      },
      {
        t: 1792674000000 - 3600_000,
        temperatureC: null,
        cloudCoverPct: 90,
        windSpeedKmh: 15,
        irradianceWm2: 0,
        precipitationMm: 1.2,
      },
    ]);
    expect(parseOpenMeteo({})).toEqual([]);
  });

  it('calibrates on sunny hours with a high percentile (curtailed hours do not pull it down)', () => {
    // 7 kWp-ish: 7 W per W/m²; a few hours curtailed (battery full) at 2 W per W/m².
    const pairs = [
      ...Array.from({ length: 16 }, (_, i) => ({
        irradianceWm2: 300 + i * 40,
        pvW: 7 * (300 + i * 40),
      })),
      ...Array.from({ length: 4 }, () => ({ irradianceWm2: 800, pvW: 1600 })),
      { irradianceWm2: 50, pvW: 10 }, // too dim
      { irradianceWm2: 700, pvW: null },
    ];
    expect(calibrate(pairs)).toEqual({ factor: 7, hours: 20 });
    expect(calibrate(pairs.slice(0, 5))).toBeNull(); // not enough sunny hours
  });

  it('day energy: generated so far, predicted for the day, remaining from now', () => {
    const t0 = Date.UTC(2026, 9, 22);
    const hours = Array.from({ length: 24 }, (_, i) => ({
      t: t0 + i * 3600_000,
      pvW: i >= 6 && i < 18 ? 2000 : 0,
      predictedW: i >= 6 && i < 18 ? 3000 : 0,
    }));
    // Now 12:30: measured 06–12 (6 h × 2 kW; the running hour 12 counts), predicted 36 kWh,
    // remaining = half of 12:00 + 13..17 = 0.5×3 + 5×3 = 16.5 kWh.
    const now = t0 + 12.5 * 3600_000;
    expect(dayEnergy(hours, t0, t0 + 86400_000, now)).toEqual({
      generatedKwh: 14,
      predictedKwh: 36,
      remainingKwh: 16.5,
    });
  });
});
