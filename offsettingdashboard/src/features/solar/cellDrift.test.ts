import { describe, expect, it } from 'vitest'
import type { CellDriftStats, PackDrift } from './api'
import { cellVerdict, devColor, rankCells, scaleMv, voltageWindow } from './cellDrift'

const cell = (id: string, o: Partial<CellDriftStats> = {}): CellDriftStats => ({ id, n: 1000, meanDevMv: 0, maxDevMv: 3, minDevMv: -3, highShare: 1 / 16, lowShare: 1 / 16, outlierShare: 0, trendMvPerDay: 0, ...o })

const PACK = { cellCount: 16, unbalancedSamples: 500, spanDays: 7 }

describe('cell verdicts', () => {
  it('flags a cell that is regularly the highest and far from the pack', () => {
    expect(cellVerdict(cell('3', { highShare: 0.6, maxDevMv: 42 }), PACK)).toBe('runawayHigh')
    expect(cellVerdict(cell('2', { lowShare: 0.4, minDevMv: -25 }), PACK)).toBe('runawayLow')
  })

  it('does not flag an "often highest" cell that never gets far (noise in a tight pack)', () => {
    expect(cellVerdict(cell('1', { highShare: 0.6, maxDevMv: 6 }), PACK)).toBe('ok')
  })

  it('in a small pack being the extreme needs 3× the fair share', () => {
    // 4 cells: 50 % highest is only twice the fair 25 %.
    expect(cellVerdict(cell('1', { highShare: 0.5, maxDevMv: 30 }), { ...PACK, cellCount: 4 })).not.toBe('runawayHigh')
    expect(cellVerdict(cell('1', { highShare: 0.8, maxDevMv: 30 }), { ...PACK, cellCount: 4 })).toBe('runawayHigh')
  })

  it('needs enough unbalanced moments before naming the highest/lowest cell', () => {
    expect(cellVerdict(cell('3', { highShare: 1, maxDevMv: 42 }), { ...PACK, unbalancedSamples: 3 })).toBe('ok')
  })

  it('flags steady drift only over 2+ days, then frequent out-of-band as watch', () => {
    expect(cellVerdict(cell('5', { trendMvPerDay: -3.2 }), PACK)).toBe('drifting')
    expect(cellVerdict(cell('5', { trendMvPerDay: -7 }), { ...PACK, spanDays: 1 })).toBe('ok')
    expect(cellVerdict(cell('6', { outlierShare: 0.08 }), PACK)).toBe('watch')
  })

  it('ranks worst first and keeps every cell', () => {
    const p: PackDrift = { installationId: 'i', bmsId: 'pack-1-bms', samples: 10, unbalancedSamples: 100, buckets: Array.from({ length: 20 }, (_, i) => ({ t: i, spreadMv: 5, spreadMaxMv: 8, cells: { '1': 1, '2': -2, '3': 18 }, peaks: { '1': 2, '2': -4, '3': 23 } })), cells: [cell('1'), cell('2', { outlierShare: 0.1 }), cell('3', { highShare: 0.9, maxDevMv: 30 })] }
    expect(rankCells(p).map((c) => [c.id, c.verdict])).toEqual([
      ['3', 'runawayHigh'],
      ['2', 'watch'],
      ['1', 'ok'],
    ])
    expect(scaleMv(p)).toBe(25)
  })
})

describe('cell drift colours and bar window', () => {
  it('gray at zero, red above, blue below, saturating at the bound', () => {
    expect(devColor(0, 10)).toContain('0%')
    expect(devColor(20, 10)).toMatch(/cell-high.*100%/)
    expect(devColor(-5, 10)).toMatch(/cell-low.*50%/)
    expect(devColor(undefined, 10)).toBe('transparent')
  })

  it('LiFePO4 window unless the cells are clearly NMC', () => {
    expect(voltageWindow(3.4)).toEqual({ lo: 2.5, hi: 3.65 })
    expect(voltageWindow(4.1)).toEqual({ lo: 3.0, hi: 4.25 })
  })
})
