/**
 * Energy-flow model and chart types shared by the Solar dashboard, the
 * Energy Flow house diagram and the time-series chart. Values come from the
 * Carbonoz Solar API (SolarBMS); sign conventions are normalised by the caller
 * (see SOLAR_SIGN in features/solar/model.ts) to: battery + = charging,
 * grid + = importing.
 */

/** Freshness of the data shown in the header pill and the flow card. */
export type LiveStatus = 'loading' | 'live' | 'no-data' | 'error'

/** Chart time ranges. */
export type RangeId = '1h' | '6h' | '24h' | '7d' | '30d'

/** One chart row: a timestamp plus one value per series key. */
export type HistoryPoint = { t: number } & { [series: string]: number }

export interface FlowValues {
  pv?: number
  load?: number
  /** + charging, − discharging (W) */
  battery?: number
  /** + importing, − exporting (W) */
  grid?: number
  soc?: number
}

export interface FlowState {
  pv: number
  load: number
  /** + charging, − discharging (W) */
  battery: number
  /** + importing, − exporting (W) */
  grid: number
  soc: number | null
  flows: {
    solarToHome: number
    solarToBattery: number
    solarToGrid: number
    gridToHome: number
    gridToBattery: number
    batteryToHome: number
    batteryToGrid: number
  }
  battery_state: 'charging' | 'discharging' | 'idle'
  grid_state: 'importing' | 'exporting' | 'idle'
  solar_state: 'producing' | 'idle'
}

/** Below this (W) a flow is treated as idle — sensor noise, not a real flow. */
export const IDLE_W = 20

/**
 * Splits the four measured powers into source → destination flows for the diagram.
 * It does not change any CARBONOZ calculation: it only apportions the measured
 * values (solar first to the home, then to the battery, then export).
 */
export function deriveFlows(v: FlowValues): FlowState | null {
  if (v.pv == null && v.load == null && v.battery == null && v.grid == null) return null
  const pv = Math.max(0, v.pv ?? 0)
  const load = Math.max(0, v.load ?? 0)
  const battery = v.battery ?? 0
  const grid = v.grid ?? 0
  const charge = battery > IDLE_W ? battery : 0
  const discharge = battery < -IDLE_W ? -battery : 0
  const gridIn = grid > IDLE_W ? grid : 0
  const gridOut = grid < -IDLE_W ? -grid : 0

  const solarToHome = Math.min(pv, load)
  let solarLeft = pv - solarToHome
  const solarToBattery = Math.min(solarLeft, charge)
  solarLeft -= solarToBattery
  const solarToGrid = Math.min(solarLeft, gridOut)

  const gridToBattery = Math.min(Math.max(0, charge - solarToBattery), gridIn)
  const homeLeft = Math.max(0, load - solarToHome)
  const batteryToHome = Math.min(discharge, homeLeft)
  const gridToHome = Math.min(Math.max(0, gridIn - gridToBattery), Math.max(0, homeLeft - batteryToHome))
  const batteryToGrid = Math.min(Math.max(0, discharge - batteryToHome), Math.max(0, gridOut - solarToGrid))

  return {
    pv,
    load,
    battery,
    grid,
    soc: v.soc ?? null,
    flows: { solarToHome, solarToBattery, solarToGrid, gridToHome, gridToBattery, batteryToHome, batteryToGrid },
    battery_state: charge ? 'charging' : discharge ? 'discharging' : 'idle',
    grid_state: gridIn ? 'importing' : gridOut ? 'exporting' : 'idle',
    solar_state: pv > IDLE_W ? 'producing' : 'idle',
  }
}

/** All-zero flow state, used to draw the diagram when no readings are available. */
export const idleFlow = (): FlowState => deriveFlows({ pv: 0, load: 0, battery: 0, grid: 0 })!
