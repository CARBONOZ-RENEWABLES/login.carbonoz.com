import type { MetricValue } from './api'
import { num } from './model'

/**
 * Health of the monitoring device itself (the Raspberry Pi): CPU, memory,
 * storage, network. Kept in "All values" but never charted — customers care
 * about their solar system, not the computer that reads it.
 */
const HOST_KEY = /^(?:(?:pi|host|raspberry|device|system|monitor)_)?(?:cpu|memory|mem|ram|swap|disk|storage|sd_card|uptime|load_avg|loadavg|wifi|wlan|rssi|signal|network|net|boot|throttl)|(?:^|_)(?:free|used)_(?:memory|storage|disk|ram)/

export const isHostMetric = (key: string) => HOST_KEY.test(key)

/**
 * Read-only inverter settings reported as values: work mode, energy pattern,
 * work-mode timer, automations, inverter clock. Shown as a settings list, not as measurements.
 */
const SETTING_KEY = /(?:^|_)(?:mode|pattern|priority|timer|schedule|automation|automations|rule|rules|setting|settings|program|time_of_use|tou)(?:_|$)|(?:^|_)(?:inverter_)?(?:time|clock)$/

export const isSettingKey = (key: string, v: MetricValue | undefined) => SETTING_KEY.test(key) && (typeof v === 'string' || typeof v === 'boolean' || /(?:^|_)(?:time|clock)$/.test(key))

export function settingsOf(metrics: Record<string, MetricValue>): [string, MetricValue][] {
  return Object.entries(metrics)
    .filter(([k, v]) => isSettingKey(k, v))
    .sort(([a], [b]) => a.localeCompare(b))
}

/** First numeric value among candidate keys, with the key it came from. */
export function pick(m: Record<string, MetricValue>, keys: string[]) {
  for (const k of keys) {
    const v = num(m[k])
    if (v != null) return { key: k, value: v }
  }
  return undefined
}

/** First text value among candidate keys. */
export function pickText(m: Record<string, MetricValue>, keys: string[]) {
  for (const k of keys) {
    const v = m[k]
    if (typeof v === 'string' && v.trim()) return { key: k, value: v.trim() }
  }
  return undefined
}

/** Key lists for values SolarBMS may report under different names. */
export const KEYS = {
  deviceMode: ['device_mode', 'work_mode', 'operating_mode', 'inverter_mode', 'mode'],
  gridPower: ['grid_power_w', 'grid_w'],
  gridVoltage: ['grid_voltage_v', 'grid_voltage_l1_v', 'ac_input_voltage_v'],
  gridFrequency: ['grid_frequency_hz', 'ac_input_frequency_hz'],
  gridLd: ['grid_power_ld_w', 'grid_ld_power_w'],
  gridCt: ['grid_power_ct_w', 'grid_ct_power_w', 'ct_power_w'],
  generator: ['generator_power_w', 'gen_power_w', 'aux_power_w', 'auxiliary_power_w'],
  loadEssential: ['load_power_essential_w', 'essential_load_power_w'],
  loadNonEssential: ['load_power_non_essential_w', 'non_essential_load_power_w', 'load_power_nonessential_w'],
  temperatureAc: ['temperature_ac_c', 'ac_temperature_c', 'inverter_temperature_ac_c'],
  temperatureDc: ['temperature_dc_c', 'dc_temperature_c', 'inverter_temperature_dc_c'],
  soh: ['soh_pct', 'state_of_health_pct'],
  cycles: ['cycle_count', 'cycles'],
  mosTemp: ['temperature_mos_c', 'mos_temperature_c', 'mosfet_temperature_c'],
  envTemp: ['temperature_env_c', 'env_temperature_c', 'ambient_temperature_c'],
  cellTempMax: ['cell_temperature_max_c', 'cell_temperature_highest_c', 'temperature_cell_max_c'],
  cellTempAvg: ['cell_temperature_avg_c', 'cell_temperature_average_c'],
  cellTempMin: ['cell_temperature_min_c', 'cell_temperature_lowest_c', 'temperature_cell_min_c'],
}

/**
 * State-of-charge change in %/hour: least-squares slope over the points,
 * when they span at least 15 minutes. Positive = filling up.
 */
export function socRatePerHour(points: Array<{ t: number; v: number }>): number | undefined {
  const p = points.filter((x) => Number.isFinite(x.v))
  if (p.length < 3 || p[p.length - 1].t - p[0].t < 15 * 60e3) return undefined
  const mt = p.reduce((a, x) => a + x.t, 0) / p.length
  const mv = p.reduce((a, x) => a + x.v, 0) / p.length
  let sxy = 0,
    sxx = 0
  for (const x of p) {
    sxy += (x.t - mt) * (x.v - mv)
    sxx += (x.t - mt) ** 2
  }
  return sxx > 0 ? (sxy / sxx) * 3600e3 : undefined
}
