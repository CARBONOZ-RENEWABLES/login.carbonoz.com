import type { SolarDevice } from './api'
import { num, SOLAR_SIGN } from './model'

const IDLE_W = 20

export type BatteryState = 'charging' | 'discharging' | 'idle'

/** Readings a battery card needs, from whichever keys this SolarBMS reports. */
export function batteryFigures(d: SolarDevice) {
  const m = d.latest?.metrics ?? {}
  const voltage = num(m.voltage_v) ?? num(m.battery_voltage_v)
  const current = num(m.current_a) ?? num(m.battery_current_a)
  const power = num(m.power_w) ?? num(m.battery_power_w) ?? (voltage != null && current != null ? voltage * current : undefined)
  const state: BatteryState = power == null || Math.abs(power) <= IDLE_W ? 'idle' : (power > 0) === SOLAR_SIGN.batteryChargingPositive ? 'charging' : 'discharging'
  const remainingAh = num(m.remaining_capacity_ah)
  const fullAh = num(m.full_capacity_ah)
  // Estimate from reported capacity and the present power; shown only when every input exists.
  let etaHours: number | undefined
  if (power != null && state !== 'idle' && voltage != null && remainingAh != null && fullAh != null && fullAh > 0) {
    const kwh = ((state === 'charging' ? fullAh - remainingAh : remainingAh) * voltage) / 1000
    const h = kwh / (Math.abs(power) / 1000)
    if (h > 0 && h < 100) etaHours = h
  }
  return {
    soc: num(m.soc_pct),
    voltage,
    current,
    power,
    state,
    temperature: num(m.temperature_c) ?? num(m.battery_temperature_c),
    soh: num(m.soh_pct),
    cycles: num(m.cycle_count),
    remainingAh,
    fullAh,
    etaHours,
  }
}
