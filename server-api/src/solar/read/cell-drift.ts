/**
 * Cell drift: how far each cell of a BMS sits from its pack average over time,
 * and how often it is the pack's highest or lowest cell. Aggregated in MongoDB
 * from the raw BMS samples (`cells: [{ id, voltage }]`); this file holds the
 * pipeline and the pure assembly of its rows, so both are testable alone.
 */

/** A cell counts as the pack's highest/lowest only when the pack spread is at least this (V). */
export const EXTREME_MIN_SPREAD_V = 0.01;
/** A cell is "out" in a sample when it sits at least this far from the pack average (V). */
export const OUTLIER_DEV_V = 0.015;
/** Heatmap columns: the smallest bucket that keeps a range at or under this many columns. */
const MAX_BUCKETS = 168;
const BUCKETS_S = [
  60,
  300,
  600,
  900,
  1800,
  3600,
  2 * 3600,
  3 * 3600,
  6 * 3600,
  12 * 3600,
  86400,
];

/**
 * Beyond 2 days, every Nth 10-second slot only (7 d → 1 in 4, 30 d → 1 in 15):
 * shares and averages stay representative, the pipeline stays small.
 */
export const driftStride = (spanMs: number) =>
  Math.max(1, Math.ceil(spanMs / (2 * 86400_000)));

export const driftBucketSeconds = (spanMs: number) =>
  BUCKETS_S.find((b) => spanMs / 1000 / b <= MAX_BUCKETS) ?? 86400;

const NUMERIC = ['double', 'int', 'long', 'decimal'];

/** One row per (installation, BMS, bucket, cell). Works on MongoDB 4.x (no $isNumber/$dateTrunc). */
export function cellDriftPipeline(o: {
  siteId: string;
  bmsId?: string;
  from: Date;
  to: Date;
  bucketMs: number;
  stride?: number;
}) {
  const t = { $toLong: '$ts' };
  const stride = o.stride ?? 1;
  return [
    {
      $match: {
        siteId: { $oid: o.siteId },
        deviceKind: 'BMS',
        ...(o.bmsId && { deviceExternalId: o.bmsId }),
        ts: {
          $gte: { $date: o.from.toISOString() },
          $lte: { $date: o.to.toISOString() },
        },
        'cells.1': { $exists: true },
        ...(stride > 1 && {
          $expr: {
            $eq: [{ $mod: [{ $floor: { $divide: [t, 10_000] } }, stride] }, 0],
          },
        }),
      },
    },
    {
      $project: {
        _id: 0,
        i: '$installationId',
        d: '$deviceExternalId',
        b: { $subtract: [t, { $mod: [t, o.bucketMs] }] },
        cells: {
          $filter: {
            input: {
              $map: {
                input: '$cells',
                as: 'c',
                in: { id: { $toString: '$$c.id' }, v: '$$c.voltage' },
              },
            },
            as: 'c',
            cond: { $in: [{ $type: '$$c.v' }, NUMERIC] },
          },
        },
      },
    },
    { $match: { 'cells.1': { $exists: true } } },
    {
      $addFields: {
        avg: { $avg: '$cells.v' },
        mn: { $min: '$cells.v' },
        mx: { $max: '$cells.v' },
      },
    },
    { $addFields: { spread: { $subtract: ['$mx', '$mn'] } } },
    { $unwind: '$cells' },
    {
      $project: {
        i: 1,
        d: 1,
        b: 1,
        spread: 1,
        c: '$cells.id',
        v: '$cells.v',
        dev: { $subtract: ['$cells.v', '$avg'] },
        wide: { $cond: [{ $gte: ['$spread', EXTREME_MIN_SPREAD_V] }, 1, 0] },
        hi: {
          $cond: [
            {
              $and: [
                { $eq: ['$cells.v', '$mx'] },
                { $gte: ['$spread', EXTREME_MIN_SPREAD_V] },
              ],
            },
            1,
            0,
          ],
        },
        lo: {
          $cond: [
            {
              $and: [
                { $eq: ['$cells.v', '$mn'] },
                { $gte: ['$spread', EXTREME_MIN_SPREAD_V] },
              ],
            },
            1,
            0,
          ],
        },
      },
    },
    {
      $group: {
        _id: { i: '$i', d: '$d', b: '$b', c: '$c' },
        n: { $sum: 1 },
        v: { $avg: '$v' },
        dev: { $avg: '$dev' },
        devMax: { $max: '$dev' },
        devMin: { $min: '$dev' },
        wide: { $sum: '$wide' },
        hi: { $sum: '$hi' },
        lo: { $sum: '$lo' },
        out: {
          $sum: { $cond: [{ $gte: [{ $abs: '$dev' }, OUTLIER_DEV_V] }, 1, 0] },
        },
        spread: { $avg: '$spread' },
        spreadMax: { $max: '$spread' },
      },
    },
    { $sort: { '_id.b': 1 } },
  ];
}

type Id = string | { $oid: string };
type Long = number | { $numberLong: string };
export interface DriftRow {
  _id: { i: Id; d: string; b: Long; c: string };
  n: number;
  v: number;
  dev: number;
  devMax: number;
  devMin: number;
  wide: number;
  hi: number;
  lo: number;
  out: number;
  spread: number;
  spreadMax: number;
}

export interface CellDriftStats {
  id: string;
  /** Samples this cell was measured in. */
  n: number;
  /** Average distance from the pack average, mV (+ = above). */
  meanDevMv: number;
  /** Furthest above / below the pack average in any sample, mV. */
  maxDevMv: number;
  minDevMv: number;
  /**
   * Of the moments the pack was unbalanced (spread ≥ 10 mV), the share (0..1)
   * in which this cell was the highest / lowest: who causes the imbalance.
   */
  highShare: number;
  lowShare: number;
  /** Share of samples at least 15 mV from the pack average. */
  outlierShare: number;
  /** Least-squares trend of its bucket deviation, mV per day (+ = drifting up). */
  trendMvPerDay: number | null;
}

export interface BmsDrift {
  installationId: string;
  bmsId: string;
  samples: number;
  /** Samples in which the pack spread was at least 10 mV. */
  unbalancedSamples: number;
  buckets: Array<{
    t: number;
    spreadMv: number;
    spreadMaxMv: number;
    /** Average mV from the pack average per cell. */
    cells: Record<string, number>;
    /** Furthest excursion per cell within the bucket, mV (signed). */
    peaks: Record<string, number>;
  }>;
  cells: CellDriftStats[];
}

const mv = (v: number) => Math.round(v * 10000) / 10;
const cellOrder = (a: string, b: string) => {
  const na = Number(a),
    nb = Number(b);
  return Number.isFinite(na) && Number.isFinite(nb)
    ? na - nb
    : a.localeCompare(b);
};

/** Weighted least-squares slope of (t ms, y) in y per day; null with fewer than 3 points or no time span. */
function slopePerDay(points: Array<{ t: number; y: number; w: number }>) {
  if (points.length < 3) return null;
  const W = points.reduce((s, p) => s + p.w, 0);
  const mt = points.reduce((s, p) => s + p.w * p.t, 0) / W;
  const my = points.reduce((s, p) => s + p.w * p.y, 0) / W;
  let num = 0,
    den = 0;
  for (const p of points) {
    num += p.w * (p.t - mt) * (p.y - my);
    den += p.w * (p.t - mt) ** 2;
  }
  return den > 0 ? Math.round((num / den) * 86400_000 * 10) / 10 : null;
}

export function assembleCellDrift(rows: DriftRow[]): BmsDrift[] {
  const packs = new Map<
    string,
    {
      installationId: string;
      bmsId: string;
      buckets: Map<
        number,
        {
          n: number;
          spread: number;
          spreadMax: number;
          cells: Record<string, number>;
          peaks: Record<string, number>;
        }
      >;
      cells: Map<
        string,
        {
          n: number;
          dev: number;
          max: number;
          min: number;
          wide: number;
          hi: number;
          lo: number;
          out: number;
          pts: Array<{ t: number; y: number; w: number }>;
        }
      >;
    }
  >();
  for (const r of rows) {
    const inst = typeof r._id.i === 'object' ? r._id.i.$oid : String(r._id.i);
    const t =
      typeof r._id.b === 'object'
        ? Number(r._id.b.$numberLong)
        : Number(r._id.b);
    const key = `${inst}:${r._id.d}`;
    const p = packs.get(key) ?? {
      installationId: inst,
      bmsId: r._id.d,
      buckets: new Map(),
      cells: new Map(),
    };
    packs.set(key, p);
    const b = p.buckets.get(t) ?? {
      n: 0,
      spread: r.spread,
      spreadMax: r.spreadMax,
      cells: {},
      peaks: {},
    };
    // Every cell row of a bucket carries the same pack spread; n = most samples seen for a cell.
    b.n = Math.max(b.n, r.n);
    b.cells[r._id.c] = mv(r.dev);
    b.peaks[r._id.c] = mv(
      Math.abs(r.devMax) >= Math.abs(r.devMin) ? r.devMax : r.devMin,
    );
    p.buckets.set(t, b);
    const c = p.cells.get(r._id.c) ?? {
      n: 0,
      dev: 0,
      max: -Infinity,
      min: Infinity,
      wide: 0,
      hi: 0,
      lo: 0,
      out: 0,
      pts: [],
    };
    c.n += r.n;
    c.dev += r.dev * r.n;
    c.max = Math.max(c.max, r.devMax);
    c.min = Math.min(c.min, r.devMin);
    c.wide += r.wide;
    c.hi += r.hi;
    c.lo += r.lo;
    c.out += r.out;
    c.pts.push({ t, y: r.dev * 1000, w: r.n });
    p.cells.set(r._id.c, c);
  }
  return [...packs.values()]
    .sort(
      (a, b) =>
        cellOrder(a.bmsId, b.bmsId) ||
        a.installationId.localeCompare(b.installationId),
    )
    .map((p) => ({
      installationId: p.installationId,
      bmsId: p.bmsId,
      samples: [...p.buckets.values()].reduce((s, b) => s + b.n, 0),
      unbalancedSamples: Math.max(
        0,
        ...[...p.cells.values()].map((c) => c.wide),
      ),
      buckets: [...p.buckets]
        .sort(([x], [y]) => x - y)
        .map(([t, b]) => ({
          t,
          spreadMv: mv(b.spread),
          spreadMaxMv: mv(b.spreadMax),
          cells: b.cells,
          peaks: b.peaks,
        })),
      cells: [...p.cells]
        .sort(([x], [y]) => cellOrder(x, y))
        .map(([id, c]) => ({
          id,
          n: c.n,
          meanDevMv: mv(c.dev / c.n),
          maxDevMv: mv(c.max),
          minDevMv: mv(c.min),
          highShare: c.wide ? c.hi / c.wide : 0,
          lowShare: c.wide ? c.lo / c.wide : 0,
          outlierShare: c.out / c.n,
          trendMvPerDay: slopePerDay(c.pts),
        })),
    }));
}
