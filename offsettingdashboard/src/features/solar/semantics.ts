/**
 * SolarBMS semantic mapping — the ONE place that says what the raw SolarBMS
 * power signs mean. Everything that shows a direction (Energy Flow, cards,
 * energy history) reads it from here; no component guesses.
 *
 * NOT CONFIRMED YET: the repository has no real SolarBMS payload from
 * Andreas. The values below are the convention proposed in
 * docs/solarbms-ingestion.md ("+ grid = import, + battery = charging").
 * When the real payload arrives: set `positive` to what SolarBMS really
 * sends and `confirmed: true`. The UI then stops showing the
 * "sign convention not confirmed" notice; nothing else needs to change.
 */
export const SOLARBMS_SEMANTICS = {
  /** `grid_power_w` on the SYSTEM device. */
  grid: { positive: 'import' as 'import' | 'export', confirmed: false },
  /** `battery_power_w` on the SYSTEM device (or `power_w` of a battery). */
  battery: { positive: 'charging' as 'charging' | 'discharging', confirmed: false },
  /** Below this (W) a power is treated as idle: sensor noise, not a flow. */
  idleW: 20,
  /**
   * Largest mismatch between sources (solar + grid import + battery
   * discharge) and sinks (home + grid export + battery charge) still treated
   * as consistent measurements: max(absolute W, share of the total).
   * Beyond it no source → destination split is shown.
   */
  balanceTolerance: { w: 100, share: 0.05 },
}

/** Raw signed SolarBMS power → normalised: + = import / charging. */
export const normaliseGrid = (raw: number) => (SOLARBMS_SEMANTICS.grid.positive === 'import' ? raw : -raw)
export const normaliseBattery = (raw: number) => (SOLARBMS_SEMANTICS.battery.positive === 'charging' ? raw : -raw)

/** Whether every sign the flow relies on is confirmed by the real SolarBMS payload. */
export const signsConfirmed = () => SOLARBMS_SEMANTICS.grid.confirmed && SOLARBMS_SEMANTICS.battery.confirmed
