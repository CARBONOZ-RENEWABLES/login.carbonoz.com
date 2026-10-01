/**
 * Words for the semantic Energy Flow state (flowState.ts), in the current
 * language. Everything here is derived from that state; nothing is inferred.
 */
import { getLocale, translate as t } from '../../i18n'
import { relativeTime } from '../../layout/ShellContext'
import type { Tone } from '../../design'
import { powerText } from '../dashboard/format'
import type { EnergyFlowState, LiveStatus } from './flowState'

const list = (items: string[]) => {
  const LF = (Intl as unknown as { ListFormat?: new (l: string, o: object) => { format: (x: string[]) => string } }).ListFormat
  return LF ? new LF(getLocale(), { style: 'long', type: 'conjunction' }).format(items) : items.join(', ')
}

/** "Solar is supplying the home and the battery." … or why it can't be said. */
export function summaryText(s: EnergyFlowState): string[] {
  const sum = s.summary
  if (sum.kind === 'idle') return [t('flow.summary.idle')]
  if (sum.kind === 'unavailable') {
    if (sum.reason === 'inconsistent') return [t('flow.summary.inconsistent', { w: powerText(Math.abs(s.balance?.residual ?? 0)) })]
    return [t(sum.reason === 'incomplete' ? 'flow.summary.incomplete' : 'flow.summary.unavailable')]
  }
  const out = sum.clauses
    .map((c) => (c.targets == null ? t(`flow.summary.${c.source}Unknown`) : c.targets.length ? t(`flow.summary.${c.source}`, { targets: list(c.targets.map((x) => t(`flow.target.${x as 'home'}`))) }) : null))
    .filter((x): x is string => !!x)
  return out.length ? out : [t('flow.summary.idle')]
}

/** "Charging from solar", "Discharging · destination unavailable", "Idle"… */
export function batteryLabel(b: EnergyFlowState['battery']): string {
  if (b.state === 'unknown') return t('flow.batteryLabel.unknown')
  if (b.state === 'idle') return t('flow.batteryLabel.idle')
  if (b.state === 'charging') {
    if (!b.sources) return t('flow.batteryLabel.chargingUnknown')
    const s = new Set(b.sources)
    return t(s.has('solar') && s.has('grid') ? 'flow.batteryLabel.fromBoth' : s.has('grid') ? 'flow.batteryLabel.fromGrid' : 'flow.batteryLabel.fromSolar')
  }
  if (!b.destinations) return t('flow.batteryLabel.dischargingUnknown')
  const d = new Set(b.destinations)
  return t(d.has('home') && d.has('grid') ? 'flow.batteryLabel.toBoth' : d.has('grid') ? 'flow.batteryLabel.toGrid' : 'flow.batteryLabel.toHome')
}

export const gridLabel = (g: EnergyFlowState['grid']) => t(`flow.gridLabel.${g.direction}`)

/** Signed normalised power: "+2.40 kW" (import / charging), "−1.80 kW" (export / discharging). */
export function signedPower(w: number | null) {
  if (w == null) return '—'
  return `${w > 0 ? '+' : w < 0 ? '−' : ''}${powerText(Math.abs(w))}`
}

/** "just now", "3s ago", "2 min ago". */
export function agoText(ms: number) {
  if (ms < 2000) return t('time.justNow')
  if (ms < 60_000) return t('time.secondsAgo', { n: Math.round(ms / 1000) })
  return relativeTime(Date.now() - ms)
}

/** Badge text + tone, and the freshness line ("Updated 1s ago" / "Last update 8s ago"). */
export function liveText(s: LiveStatus): { label: string; tone: Tone; detail: string; pulse: boolean } {
  const tone: Tone = s.state === 'live' ? 'good' : s.state === 'delayed' || s.state === 'waiting' ? 'warning' : 'neutral'
  const detail = s.ageMs == null ? t('flow.noReading') : t(s.state === 'live' ? 'flow.updated' : 'flow.lastUpdate', { when: agoText(s.ageMs) })
  return { label: t(`flow.status.${s.state}`), tone, detail, pulse: s.state === 'live' }
}
