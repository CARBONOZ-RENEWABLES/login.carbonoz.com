/**
 * Cell drift on the real MongoDB pipeline: BMS samples with one cell that
 * runs away upwards over two days, one that sits low, and noise cells.
 */
import { randomBytes } from 'crypto';
import { startApi, TestApi } from './support/app';
import { adminToken, call, db, provision, signup } from './support/http';

const MIN = 60_000;
const oid = () => randomBytes(12).toString('hex');

let t: TestApi;
const prisma = db();
let admin: string;

beforeAll(async () => {
  t = await startApi();
  admin = await adminToken(t.api);
});
afterAll(async () => {
  await prisma.$disconnect();
  await t.close();
});

interface Drift {
  bucketSeconds: number;
  sampling: number;
  thresholds: { extremeMinSpreadMv: number; outlierMv: number };
  packs: Array<{
    bmsId: string;
    samples: number;
    unbalancedSamples: number;
    buckets: Array<{
      t: number;
      spreadMv: number;
      cells: Record<string, number>;
      peaks: Record<string, number>;
    }>;
    cells: Array<{
      id: string;
      n: number;
      meanDevMv: number;
      maxDevMv: number;
      minDevMv: number;
      highShare: number;
      lowShare: number;
      outlierShare: number;
      trendMvPerDay: number | null;
    }>;
  }>;
}

describe('cell drift (GET /solar/sites/:id/cells/drift)', () => {
  // Well in the past, so the default range (last 7 days) holds none of it.
  const to = new Date(Date.UTC(2026, 7, 31, 12));
  const from = new Date(to.getTime() - 2 * 86400_000);
  let owner: Awaited<ReturnType<typeof signup>>;
  let siteId: string;

  beforeAll(async () => {
    owner = await signup(t.api, 'drift');
    const p = await provision(t.api, admin, owner.user.id);
    siteId = p.site.id;
    const rows = [];
    // Every 10 min for 2 days; cell 3 climbs from +5 to +45 mV, cell 2 sits at −12 mV.
    for (let i = 0; i < 288; i++) {
      const ts = new Date(from.getTime() + i * 10 * MIN);
      const base = 3.3;
      const up = 0.005 + (0.04 * i) / 287;
      const cells = [
        { id: 1, voltage: base + (i % 2 ? 0.001 : -0.001) },
        { id: 2, voltage: base - 0.012 },
        { id: 3, voltage: base + up },
        { id: 4, voltage: base },
        // A cell without a number is ignored, not counted as 0 V.
        ...(i === 5 ? [{ id: 5, voltage: 'n/a' }] : []),
      ];
      rows.push({
        siteId,
        installationId: p.installation.id,
        ingestId: oid(),
        deviceKind: 'BMS' as const,
        deviceExternalId: 'pack-1-bms',
        ts,
        metrics: {},
        cells,
      });
      // A second, healthy pack.
      rows.push({
        siteId,
        installationId: p.installation.id,
        ingestId: oid(),
        deviceKind: 'BMS' as const,
        deviceExternalId: 'pack-2-bms',
        ts,
        metrics: {},
        cells: [1, 2, 3, 4].map((id) => ({
          id,
          voltage: 3.3 + (id === 1 && i % 3 === 0 ? 0.002 : 0),
        })),
      });
    }
    await prisma.solarSample.createMany({ data: rows });
  });

  const get = async (q: string, token = owner.token) =>
    call(t.api, 'GET', `/solar/sites/${siteId}/cells/drift${q}`, { token });

  it('finds the runaway cell, the low cell, and the trend', async () => {
    const r = await get(`?from=${from.toISOString()}&to=${to.toISOString()}`);
    expect(r.status).toBe(200);
    const d = r.data.data as Drift;
    expect(d.bucketSeconds).toBe(1800); // 48 h → ≤168 columns
    expect(d.sampling).toBe(1); // ≤ 2 days: every sample
    expect(d.thresholds).toEqual({ extremeMinSpreadMv: 10, outlierMv: 15 });
    expect(d.packs.map((p) => p.bmsId)).toEqual(['pack-1-bms', 'pack-2-bms']);

    const [p1, p2] = d.packs;
    expect(p1.samples).toBe(288);
    expect([p1.unbalancedSamples, p2.unbalancedSamples]).toEqual([288, 0]);
    expect(p1.buckets).toHaveLength(96);
    const c = Object.fromEntries(p1.cells.map((x) => [x.id, x]));
    expect(Object.keys(c)).toEqual(['1', '2', '3', '4']);
    expect(c['3'].highShare).toBe(1);
    expect(c['2'].lowShare).toBe(1);
    expect(c['1'].highShare + c['1'].lowShare + c['4'].highShare).toBe(0);
    expect(c['3'].meanDevMv).toBeGreaterThan(15);
    expect(c['3'].maxDevMv).toBeGreaterThan(30);
    expect(c['3'].outlierShare).toBeGreaterThan(0.4);
    // 40 mV over 2 days on the cell, ¾ of it against the average of 4 cells → ~15 mV/day.
    expect(c['3'].trendMvPerDay).toBeGreaterThan(12);
    expect(c['3'].trendMvPerDay).toBeLessThan(18);
    expect(Math.abs(c['4'].trendMvPerDay ?? 0)).toBeLessThan(6);
    // The peak of a bucket is at least as far out as its average.
    const last = p1.buckets[p1.buckets.length - 1];
    expect(last.peaks['3']).toBeGreaterThanOrEqual(last.cells['3']);
    expect(last.cells['3']).toBeGreaterThan(p1.buckets[0].cells['3']);

    // Healthy pack: spread 2 mV, nobody flagged.
    expect(
      p2.cells.every(
        (x) => x.highShare === 0 && x.lowShare === 0 && x.outlierShare === 0,
      ),
    ).toBe(true);
  });

  it('one BMS on request; default range ends now; limits enforced', async () => {
    const one = await get(
      `?bmsId=pack-2-bms&from=${from.toISOString()}&to=${to.toISOString()}`,
    );
    expect((one.data.data as Drift).packs.map((p) => p.bmsId)).toEqual([
      'pack-2-bms',
    ]);
    // 7 days: one 10-second slot in 4 (these samples sit on whole minutes, so all count).
    const week = await get(
      `?from=${new Date(
        to.getTime() - 7 * 86400_000,
      ).toISOString()}&to=${to.toISOString()}`,
    );
    expect((week.data.data as Drift).sampling).toBe(4);
    expect((week.data.data as Drift).bucketSeconds).toBe(3600);
    expect((week.data.data as Drift).packs[0].cells[2].highShare).toBe(1);
    const recent = await get('');
    expect(recent.status).toBe(200);
    expect((recent.data.data as Drift).packs).toEqual([]);
    const tooLong = await get(
      `?from=2026-01-01T00:00:00Z&to=2026-03-01T00:00:00Z`,
    );
    expect(tooLong.status).toBe(400);
  });

  it('another customer cannot read the drift of this site', async () => {
    const other = await signup(t.api, 'drift-other');
    const r = await get('', other.token);
    expect([403, 404]).toContain(r.status);
  });
});
