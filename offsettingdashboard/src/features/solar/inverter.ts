import type { SolarDevice } from './api'
import { num, statusTone } from './model'

const IDLE_W = 20

export type InverterState = 'producing' | 'standby' | 'fault'

export interface InverterString {
  id: string
  voltage?: number
  current?: number
  power?: number
}

const first = (m: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) {
    const v = num(m[k] as never)
    if (v != null) return { key: k, value: v }
  }
  return undefined
}

/** String/MPPT inputs from keys such as `pv1_voltage_v`, `mppt2_current_a`, `string3_power_w`, `pv_mppt_1_power_w`. */
const STRING_KEY = /^(?:pv_)?(?:pv|mppt|string)_?(\d+)_(voltage_v|current_a|power_w)$/

/** Everything the inverter card shows, from whichever keys this inverter reports. */
export function inverterFigures(d: SolarDevice) {
  const m = d.latest?.metrics ?? {}
  const output = first(m, ['power_w', 'output_power_w', 'ac_output_power_w', 'inverter_power_w', 'ac_power_w'])
  const pvInput = first(m, ['pv_power_w', 'pv_input_power_w', 'dc_power_w', 'input_power_w'])
  const acVoltage = first(m, ['ac_voltage_v', 'output_voltage_v', 'ac_output_voltage_v', 'grid_voltage_v'])
  const frequency = first(m, ['ac_frequency_hz', 'frequency_hz', 'ac_output_frequency_hz', 'grid_frequency_hz', 'output_frequency_hz'])
  const temperature = first(m, ['temperature_c', 'inverter_temperature_c', 'heatsink_temperature_c', 'internal_temperature_c'])
  const yieldToday = first(m, ['daily_yield_kwh', 'daily_energy_kwh', 'today_energy_kwh', 'energy_today_kwh'])
  const yieldTotal = first(m, ['total_yield_kwh', 'total_energy_kwh', 'lifetime_energy_kwh', 'energy_total_kwh'])
  const rated = first(m, ['rated_power_w', 'nominal_power_w', 'max_power_w'])
  const loadPct = first(m, ['load_percentage', 'load_pct', 'output_load_pct'])
  const homeLoad = first(m, ['load_power_w', 'load_w'])
  const battery = first(m, ['battery_power_w', 'battery_w'])

  const strings = new Map<string, InverterString>()
  for (const [k, v] of Object.entries(m)) {
    const hit = k.match(STRING_KEY)
    if (!hit || typeof v !== 'number') continue
    const s = strings.get(hit[1]) ?? { id: hit[1] }
    if (hit[2] === 'voltage_v') s.voltage = v
    else if (hit[2] === 'current_a') s.current = v
    else s.power = v
    strings.set(hit[1], s)
  }

  const out = output?.value
  const state: InverterState = statusTone(d.latest?.status) === 'critical' ? 'fault' : out != null && Math.abs(out) > IDLE_W ? 'producing' : 'standby'
  // Load against the rated power, or the inverter's own load percentage.
  const load = rated && out != null && rated.value > 0 ? Math.max(0, Math.min(1, Math.abs(out) / rated.value)) : loadPct ? Math.max(0, Math.min(1, loadPct.value / 100)) : undefined
  const efficiency = out != null && pvInput && pvInput.value > IDLE_W && out > IDLE_W ? Math.min(100, (out / pvInput.value) * 100) : undefined

  const used = new Set(
    [output, pvInput, acVoltage, frequency, temperature, yieldToday, yieldTotal, rated, loadPct, homeLoad, battery].filter(Boolean).map((x) => x!.key),
  )
  for (const k of Object.keys(m)) if (STRING_KEY.test(k)) used.add(k)

  return {
    output: out,
    pvInput: pvInput?.value,
    acVoltage: acVoltage?.value,
    frequency: frequency?.value,
    temperature: temperature?.value,
    yieldToday: yieldToday?.value,
    yieldTotal: yieldTotal?.value,
    rated: rated?.value,
    load,
    /** Reported by the inverter itself (not derived from rated power). */
    loadPct: loadPct?.value,
    homeLoad: homeLoad?.value,
    /** Signed as the plant's battery power: + = charging, − = discharging. */
    battery: battery?.value,
    efficiency,
    state,
    strings: [...strings.values()].sort((a, b) => Number(a.id) - Number(b.id)),
    /** Keys shown above; the rest go to "All inverter values". */
    used,
  }
}
