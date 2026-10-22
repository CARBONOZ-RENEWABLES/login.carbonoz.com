/**
 * Weather and PV prediction against a local fake of the Open-Meteo API (no
 * internet): admin sets the site location, the prediction is calibrated on
 * the site's own hourly generation, results are cached per location.
 */
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { startApi, TestApi } from './support/app';
import { adminToken, call, db, provision, signup } from './support/http';

const H = 3600_000;
let t: TestApi;
const prisma = db();
let admin: string;
let server: Server;
let hits = 0;
let fail = false;

const hourStart = (ms: number) => Math.floor(ms / H) * H;
/** Clear sky: 0 at night, up to 1000 W/m² at 12:00 UTC. */
const irr = (ms: number) =>
  Math.max(
    0,
    Math.round(
      1000 * Math.sin(((new Date(ms).getUTCHours() - 6) / 12) * Math.PI),
    ),
  );

beforeAll(async () => {
  server = createServer((req, res) => {
    hits++;
    if (fail) return res.writeHead(500).end();
    const now = hourStart(Date.now());
    const time: number[] = [];
    for (let h = now - 8 * 24 * H; h <= now + 3 * 24 * H; h += H)
      time.push(h / 1000);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        hourly: {
          time,
          temperature_2m: time.map(() => 25),
          cloud_cover: time.map(() => 10),
          wind_speed_10m: time.map(() => 12),
          // Mean of the hour BEFORE `time`.
          shortwave_radiation: time.map((s) => irr(s * 1000 - H)),
          precipitation: time.map(() => 0),
        },
      }),
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  t = await startApi({ WEATHER_URL: `http://127.0.0.1:${port}/v1/forecast` });
  admin = await adminToken(t.api);
});
afterAll(async () => {
  await prisma.$disconnect();
  await t.close();
  server.close();
});

describe('weather and PV forecast (GET /solar/sites/:id/weather)', () => {
  it("needs a site location; admin sets it; the forecast is calibrated on the site's generation", async () => {
    const owner = await signup(t.api, 'weather');
    const p = await provision(t.api, admin, owner.user.id);
    const get = () =>
      call(t.api, 'GET', `/solar/sites/${p.site.id}/weather`, {
        token: owner.token,
      });

    expect((await get()).data.data).toEqual({
      available: false,
      reason: 'no_location',
    });

    // Admin: location only, then a half pair is refused.
    const patch = (body: object) =>
      call(t.api, 'PATCH', `/admin/sites/${p.site.id}`, { token: admin, body });
    expect((await patch({ latitude: -20.16 })).status).toBe(400);
    expect((await patch({ latitude: 95, longitude: 57.5 })).status).toBe(400);
    expect((await patch({ latitude: -20.16, longitude: 57.5 })).status).toBe(
      200,
    );

    // 7 days of hourly generation: 7 W per W/m² (a ~7 kWp array).
    const now = hourStart(Date.now());
    const rows = [];
    for (let h = now - 7 * 24 * H; h < now; h += H) {
      const w = 7 * irr(h);
      rows.push({
        id: `${p.site.id}:${p.installation.id}:SYSTEM:sys:${h}`,
        siteId: p.site.id,
        installationId: p.installation.id,
        deviceKind: 'SYSTEM' as const,
        deviceExternalId: 'sys',
        hour: new Date(h),
        metrics: { pv_power_w: { sum: w * 2, n: 2, min: w, max: w } },
      });
    }
    await prisma.solarRollupHour.createMany({ data: rows });

    hits = 0;
    const r = (await get()).data.data;
    expect(r).toMatchObject({
      available: true,
      source: 'open-meteo',
      location: { latitude: -20.16, longitude: 57.5 },
    });
    expect(r.calibration.factor).toBeCloseTo(7, 5);
    const noon = r.hourly.find(
      (h: { t: number }) => new Date(h.t).getUTCHours() === 12 && h.t > now,
    );
    expect(noon).toMatchObject({
      irradianceWm2: 1000,
      predictedW: 7000,
      temperatureC: 25,
      cloudCoverPct: 10,
    });
    expect(r.days.tomorrow.predictedKwh).toBeGreaterThan(40);
    expect(r.days.yesterday.generatedKwh).toBeCloseTo(
      r.days.yesterday.predictedKwh,
      0,
    );

    // Cached per location: a second request does not call the weather API.
    await get();
    expect(hits).toBe(1);
  });

  it('weather API down: "unavailable", not an error page', async () => {
    const owner = await signup(t.api, 'weather-down');
    const p = await provision(t.api, admin, owner.user.id);
    await prisma.site.update({
      where: { id: p.site.id },
      data: { latitude: 10, longitude: 10 },
    });
    fail = true;
    const r = await call(t.api, 'GET', `/solar/sites/${p.site.id}/weather`, {
      token: owner.token,
    });
    fail = false;
    expect(r.status).toBe(200);
    expect(r.data.data).toEqual({ available: false, reason: 'unavailable' });
  });
});
