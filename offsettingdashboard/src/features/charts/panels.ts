
export type PanelKind = 'area' | 'line' | 'bar'
export type StatKind = 'max' | 'min' | 'avg' | 'total' | 'import' | 'export' | 'last'

export interface SeriesDef {
  key: string
  name: string
  color: string
  /** Dashed line (e.g. a prediction next to the measured value). */
  dashed?: boolean
}

export interface PanelDef {
  id: string
  title: string
  /** Display unit; power panels convert device watts to kW. */
  unit: 'kW' | '%' | 'V' | 'A' | '°C' | 'km/h' | 'W/m²' | 'mm'
  kind: PanelKind
  series: SeriesDef[]
  stats: StatKind[]
  decimals: number
  domain?: [number | 'auto' | 'nice', number | 'auto' | 'nice']
  /** Ignore zero samples when averaging (e.g. PV at night). */
  avgNonZero?: boolean
  /** Short explanation of sign conventions shown under the legend. */
  note?: string
}

/** Divisor from device units to display units. */
export const scaleOf = (p: PanelDef) => (p.unit === 'kW' ? 1000 : 1)
