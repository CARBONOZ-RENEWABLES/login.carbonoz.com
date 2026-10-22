import type { CellDriftStats, PackDrift } from './api'

export type DriftRange = '24h' | '7d' | '30d'
export const DRIFT_MS: Record<DriftRange, number> = { '24h': 86400e3, '7d': 7 * 86400e3, '30d': 30 * 86400e3 }

export type CellVerdict = 'runawayHigh' | 'runawayLow' | 'drifting' | 'watch' | 'ok'

/** Worst first; also the order of the "cells to watch" list. */
export const VERDICT_ORDER: CellVerdict[] = ['runawayHigh', 'runawayLow', 'drifting', 'watch', 'ok']

/** A cell "runs away" when it is the extreme cell this often (and at least 3× its fair share). */
const OFTEN = 0.25
/** …and actually gets this far from the pack average at some point (mV). */
const FAR_MV = 15
/** Highest/lowest shares mean something only with this many unbalanced moments. */
const MIN_UNBALANCED = 20
/** Steady drift worth flagging (mV/day), measured over at least this many days (a day has its own charge cycle). */
const TREND_MV_PER_DAY = 3
const TREND_MIN_DAYS = 2
/** Share of samples out of band (beyond the outlier threshold) that deserves a look. */
const WATCH_SHARE = 0.05

/**
 * What a cell's history says, from the drift statistics alone:
 *  runawayHigh / runawayLow  regularly the highest / lowest cell, and far from the others
 *  drifting                  moving steadily away from the pack average
 *  watch                     often out of band, no clear pattern
 */
export function cellVerdict(c: CellDriftStats, pack: { cellCount: number; unbalancedSamples: number; spanDays: number }): CellVerdict {
  // 3× the fair share, but never more than 75 % (a 3-cell pack could otherwise never qualify).
  const often = (share: number) => pack.unbalancedSamples >= MIN_UNBALANCED && share >= Math.min(0.75, Math.max(OFTEN, pack.cellCount > 0 ? 3 / pack.cellCount : OFTEN))
  if (often(c.highShare) && c.maxDevMv >= FAR_MV) return 'runawayHigh'
  if (often(c.lowShare) && c.minDevMv <= -FAR_MV) return 'runawayLow'
  if (c.trendMvPerDay != null && pack.spanDays >= TREND_MIN_DAYS && Math.abs(c.trendMvPerDay) >= TREND_MV_PER_DAY) return 'drifting'
  if (c.outlierShare >= WATCH_SHARE) return 'watch'
  return 'ok'
}

/** Ranking inside a verdict: how far and how often it leaves the pack. */
const score = (c: CellDriftStats) => Math.max(c.highShare, c.lowShare) + c.outlierShare + Math.abs(c.meanDevMv) / 50 + Math.abs(c.trendMvPerDay ?? 0) / 20

export interface RankedCell extends CellDriftStats {
  verdict: CellVerdict
}

/** Every cell of a pack with its verdict, worst first. */
export function rankCells(p: PackDrift): RankedCell[] {
  const spanDays = p.buckets.length > 1 ? (p.buckets[p.buckets.length - 1].t - p.buckets[0].t) / 86400e3 : 0
  const ctx = { cellCount: p.cells.length, unbalancedSamples: p.unbalancedSamples, spanDays }
  return p.cells
    .map((c) => ({ ...c, verdict: cellVerdict(c, ctx) }))
    .sort((a, b) => VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict) || score(b) - score(a))
}

/** Symmetric colour scale bound for a pack's heatmap: the largest excursion seen, at least 10 mV, rounded up to 5. */
export function scaleMv(p: PackDrift) {
  let m = 0
  for (const b of p.buckets) for (const v of Object.values(b.peaks)) m = Math.max(m, Math.abs(v))
  return Math.max(10, Math.ceil(m / 5) * 5)
}

/** Heatmap fill: gray at 0, toward red above / blue below the pack average. Follows the theme via CSS tokens. */
export function devColor(mv: number | undefined, bound: number) {
  if (mv == null) return 'transparent'
  const k = Math.min(1, Math.abs(mv) / bound)
  const pole = mv >= 0 ? 'var(--c-cell-high)' : 'var(--c-cell-low)'
  return `color-mix(in oklab, rgb(${pole}) ${Math.round(k * 100)}%, rgb(var(--c-panel-3)))`
}

/** Chip colours for "low" cells: the heatmap's blue, not the theme's info (brand yellow). */
export const CELL_LOW_CHIP = '!border-[rgb(var(--c-cell-low)/0.35)] !bg-[rgb(var(--c-cell-low)/0.10)] !text-[rgb(var(--c-cell-low))]'

/** Bar window for cell voltages: LiFePO4 unless the cells are clearly higher (NMC/NCA). */
export function voltageWindow(maxV: number) {
  return maxV > 3.75 ? { lo: 3.0, hi: 4.25 } : { lo: 2.5, hi: 3.65 }
}
