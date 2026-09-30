import { formatFixed } from '../../i18n'

/** Power for display: watts below 1 kW, kilowatts above (device values arrive in W). */
export function power(w: number | null | undefined): { value: string; unit: string; num: number; decimals: number } {
  if (w == null || Number.isNaN(w)) return { value: '—', unit: '', num: 0, decimals: 0 }
  const a = Math.abs(w)
  if (a < 1000) return { value: formatFixed(Math.round(a), 0), unit: 'W', num: Math.round(a), decimals: 0 }
  const kw = a / 1000
  const decimals = kw < 10 ? 2 : 1
  return { value: formatFixed(kw, decimals), unit: 'kW', num: kw, decimals }
}

export const powerText = (w: number | null | undefined) => {
  const p = power(w)
  return p.unit ? `${p.value} ${p.unit}` : p.value
}

export const kwh = (v: string | number | null | undefined, digits = 1) => {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return n == null || Number.isNaN(n) ? '—' : formatFixed(n, digits)
}
