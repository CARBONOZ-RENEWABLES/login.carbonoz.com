/**
 * SolarBMS semantic mapping — the ONE place that says what the raw SolarBMS
 * power signs mean. Everything that shows a direction (Energy Flow, cards,
 * energy history) reads it from here; no component guesses.
 *
 * CONFIRMED (19 Oct 2026) from the real Raspberry data (site solarblick-main,
 * 27,830 readings since 29 Sep 2026):
 * - battery: SoC rises while battery_w > 0 in 17,076 of 17,449 moments (98 %)
 *   → + = charging;
 * - grid: at 759 moments with |grid_w| > 100 W, home = solar + grid − battery
 *   fits with a median error of 70 W (1,510 W with the opposite sign)
 *   → + = import.
 * If a future sender uses other signs, set `positive` accordingly.
 */
export const SOLARBMS_SEMANTICS = {
  /** `grid_power_w` on the SYSTEM device. */
  grid: { positive: 'import' as 'import' | 'export', confirmed: true },
  /** `battery_power_w` on the SYSTEM device (or `power_w` of a battery). */
  battery: { positive: 'charging' as 'charging' | 'discharging', confirmed: true },
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
