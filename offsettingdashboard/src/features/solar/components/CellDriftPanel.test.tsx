// @vitest-environment jsdom
import '../../../test/dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '../../../i18n'
import { store } from '../../../lib/redux/store'
import type { CellDrift } from '../api'
import { CellDriftPanel } from './CellDriftPanel'

const t0 = Date.UTC(2026, 9, 20)
const drift: CellDrift = {
  from: new Date(t0).toISOString(),
  to: new Date(t0 + 7 * 86400e3).toISOString(),
  bucketSeconds: 3600,
  sampling: 4,
  thresholds: { extremeMinSpreadMv: 10, outlierMv: 15 },
  packs: [
    {
      installationId: 'i1',
      bmsId: 'pack-1-bms',
      samples: 15120,
      unbalancedSamples: 9000,
      buckets: Array.from({ length: 24 }, (_, i) => ({ t: t0 + i * 3600e3, spreadMv: 20 + i, spreadMaxMv: 30 + i, cells: { '1': -2, '2': -1, '3': 5 + i }, peaks: { '1': -4, '2': -3, '3': 9 + i } })),
      cells: [
        { id: '1', n: 15120, meanDevMv: -2, maxDevMv: 1, minDevMv: -6, highShare: 0, lowShare: 0.7, outlierShare: 0, trendMvPerDay: 0 },
        { id: '2', n: 15120, meanDevMv: -1, maxDevMv: 2, minDevMv: -5, highShare: 0, lowShare: 0.3, outlierShare: 0, trendMvPerDay: 0 },
        { id: '3', n: 15120, meanDevMv: 16, maxDevMv: 31, minDevMv: 3, highShare: 1, lowShare: 0, outlierShare: 0.5, trendMvPerDay: 24 },
      ],
    },
  ],
}

const wrap = (ui: ReactNode) =>
  render(
    <Provider store={store}>
      <I18nProvider>{ui}</I18nProvider>
    </Provider>,
  )

describe('cell drift panel', () => {
  it('names the runaway cell, ranks it first and explains the sampling', () => {
    wrap(<CellDriftPanel pack={drift.packs[0]} drift={drift} />)
    expect(screen.getAllByText('Runs high').length).toBeGreaterThan(0)
    const rows = screen.getAllByRole('row')
    expect(rows[1].textContent).toMatch(/^3/)
    expect(rows[1].textContent).toContain('100 %')
    expect(screen.getByText(/1 in 4 analysed/)).toBeTruthy()
    // Low share without distance is not a verdict: cell 1 never gets 15 mV low.
    expect(rows[2].textContent).toContain('OK')
  })

  it('shows the value of a heatmap cell on hover', () => {
    const { container } = wrap(<CellDriftPanel pack={drift.packs[0]} drift={drift} />)
    const svg = container.querySelectorAll('svg.cursor-crosshair')[2] as SVGSVGElement
    svg.getBoundingClientRect = () => ({ left: 0, width: 240, top: 0, height: 12, right: 240, bottom: 12, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.mouseMove(svg, { clientX: 235 })
    const tip = screen.getByRole('tooltip')
    expect(tip.textContent).toContain('Cell 3')
    expect(tip.textContent).toContain('Peak +32.0 mV')
    expect(tip.textContent).toContain('Average +28.0 mV')
  })

  it('says so when there is no history', () => {
    wrap(<CellDriftPanel pack={undefined} drift={drift} />)
    expect(screen.getByText(/No cell history/)).toBeTruthy()
  })
})
