import { SERIES } from '../../../design/theme'
import type { MessageKey } from '../../../i18n'

/** One colour and label per energy quantity, shared by the charts and the table. */
export const COLORS = {
  pv: SERIES.pv,
  consumption: SERIES.load,
  gridImport: SERIES.grid,
  gridExport: SERIES.voltage,
  batteryCharged: SERIES.soc,
  batteryDischarged: SERIES.temp,
  coverage: SERIES.export,
}

export type Series = 'pv' | 'consumption' | 'gridImport' | 'gridExport' | 'batteryCharged' | 'batteryDischarged'

export const SERIES_LABEL: Record<Series | 'coverage', MessageKey> = {
  pv: 'energy.pv',
  consumption: 'energy.consumption',
  gridImport: 'energy.gridImport',
  gridExport: 'energy.gridExport',
  batteryCharged: 'energy.batteryCharged',
  batteryDischarged: 'energy.batteryDischarged',
  coverage: 'energy.coverage',
}
