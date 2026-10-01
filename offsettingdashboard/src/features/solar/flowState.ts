/**
 * Semantic Energy Flow state — shared by the compact dashboard card and the
 * Energy Flow page. Pure functions, no React.
 *
 *   raw SolarBMS readings (headline(): site totals in SolarBMS signs)
 *     → normalisation (semantics.ts: what + means, idle threshold)
 *     → EnergyFlowState (directions, battery state, determined flows)
 *     → views
 *
 * Source → destination flows are never guessed. With only the four site
 * totals (solar, home, grid, battery) a split is shown only when the
 * measurements determine it exactly: the sources (solar, grid import,
 * battery discharge) and sinks (home, grid export, battery charge) must
 * balance, and a flow is shown only if every way of routing the measured
 * powers gives it the same value. That is the case whenever there is one
 * active source or one active sink; e.g. solar + grid both supplying while
 * the battery charges leaves the battery's source open, and it is reported
 * as unknown rather than invented.
 */
import { normaliseBattery, normaliseGrid, signsConfirmed, SOLARBMS_SEMANTICS } from './semantics'

export type FlowNode = 'solar' | 'grid' | 'home' | 'battery'
export type GridDirection = 'import' | 'export' | 'idle' | 'unknown'
export type BatteryState = 'charging' | 'discharging' | 'idle' | 'unknown'
/** Where battery energy comes from / goes to. */
export type BatteryParty = 'solar' | 'grid' | 'home'

export interface Flow {
  from: FlowNode
  to: FlowNode
  /** W, always > the idle threshold. */
  watts: number
}

/** One sentence of the current-state description: `source` supplies `targets` (null: split unknown). */
export interface SummaryClause {
  source: 'solar' | 'grid' | 'battery'
  targets: FlowNode[] | null
}

export type Summary =
  | { kind: 'unavailable'; reason: 'noData' | 'incomplete' | 'inconsistent' }
  | { kind: 'idle' }
  | { kind: 'flows'; clauses: SummaryClause[] }

export interface EnergyFlowState {
  /** W ≥ 0; null = not reported. */
  solar: { power: number | null }
  /** W ≥ 0. `derived`: not reported, calculated from the balance solar + grid − battery. */
  load: { power: number | null; derived: boolean }
  /** `power`: normalised W, + import / − export. `magnitude`: |power|. */
  grid: { power: number | null; magnitude: number | null; direction: GridDirection }
  /** `power`: normalised W, + charging / − discharging. */
  battery: {
    power: number | null
    magnitude: number | null
    state: BatteryState
    soc: number | null
    /** Charging: where from (null = can't be determined). */
    sources: BatteryParty[] | null
    /** Discharging: where to (null = can't be determined). */
    destinations: BatteryParty[] | null
  }
  /** Only flows the measurements determine; sorted by size. */
  flows: Flow[]
  /** Every active source → destination flow is determined. */
  splitKnown: boolean
  /** Solar split when determined (all in W, 0 where nothing goes). */
  solarAllocation: { home: number; battery: number; grid: number } | null
  /** Sources − sinks (W) and whether that is within tolerance; null when not all four are known. */
  balance: { residual: number; consistent: boolean } | null
  summary: Summary
  /** False while the SolarBMS sign convention is still an assumption. */
  signsConfirmed: boolean
}

/** Site totals in SolarBMS signs (headline()). */
export interface RawTotals {
  pv?: number
  load?: number
  grid?: number
  battery?: number
  soc?: number
}

const SOURCES = ['solar', 'grid', 'battery'] as const
const SINKS = ['home', 'battery', 'grid'] as const

export function energyFlowState(raw: RawTotals): EnergyFlowState {
  const idle = SOLARBMS_SEMANTICS.idleW
  const pv = raw.pv == null ? null : Math.max(0, raw.pv)
  const grid = raw.grid == null ? null : normaliseGrid(raw.grid)
  const battery = raw.battery == null ? null : normaliseBattery(raw.battery)
  const gridDirection: GridDirection = grid == null ? 'unknown' : grid > idle ? 'import' : grid < -idle ? 'export' : 'idle'
  const batteryState: BatteryState = battery == null ? 'unknown' : battery > idle ? 'charging' : battery < -idle ? 'discharging' : 'idle'
  // Home: reported, or the balance (documented calculation) when all other three are known.
  const derived = raw.load == null && pv != null && grid != null && battery != null
  const load = raw.load != null ? Math.max(0, raw.load) : derived ? Math.max(0, pv! + grid! - battery!) : null

  const base = {
    solar: { power: pv },
    load: { power: load, derived },
    grid: { power: grid, magnitude: grid == null ? null : Math.abs(grid), direction: gridDirection },
    signsConfirmed: signsConfirmed(),
  }
  const batteryBase = { power: battery, magnitude: battery == null ? null : Math.abs(battery), state: batteryState, soc: raw.soc ?? null }

  if (pv == null && load == null && grid == null && battery == null)
    return { ...base, battery: { ...batteryBase, sources: null, destinations: null }, flows: [], splitKnown: false, solarAllocation: null, balance: null, summary: { kind: 'unavailable', reason: 'noData' } }
  if (pv == null || load == null || grid == null || battery == null)
    return { ...base, battery: { ...batteryBase, sources: null, destinations: null }, flows: [], splitKnown: false, solarAllocation: null, balance: null, summary: { kind: 'unavailable', reason: 'incomplete' } }

  const above = (w: number) => (w > idle ? w : 0)
  const supply: Record<(typeof SOURCES)[number], number> = { solar: above(pv), grid: above(grid), battery: above(-battery) }
  const demand: Record<(typeof SINKS)[number], number> = { home: above(load), grid: above(-grid), battery: above(battery) }
  const tSrc = supply.solar + supply.grid + supply.battery
  const tSnk = demand.home + demand.grid + demand.battery
  const residual = tSrc - tSnk
  const total = Math.max(tSrc, tSnk)
  const tol = Math.max(SOLARBMS_SEMANTICS.balanceTolerance.w, SOLARBMS_SEMANTICS.balanceTolerance.share * total)
  const consistent = Math.abs(residual) <= tol
  const balance = { residual, consistent }
  const batteryOut = { ...batteryBase, sources: null, destinations: null }

  if (total === 0) return { ...base, battery: batteryOut, flows: [], splitKnown: true, solarAllocation: pv > idle ? null : { home: 0, battery: 0, grid: 0 }, balance, summary: { kind: 'idle' } }
  if (!consistent) return { ...base, battery: batteryOut, flows: [], splitKnown: false, solarAllocation: null, balance, summary: { kind: 'unavailable', reason: 'inconsistent' } }

  // Transportation bounds: every routing of the measured powers gives edge s→d a value in
  // [max(0, supply + demand − total), min(supply, demand)]. Determined when that range is
  // within the measurement tolerance.
  type Pair = { from: (typeof SOURCES)[number]; to: (typeof SINKS)[number]; value: number | null }
  const pairs: Pair[] = []
  for (const from of SOURCES)
    for (const to of SINKS) {
      if (from === to || !supply[from] || !demand[to]) continue
      const hi = Math.min(supply[from], demand[to])
      const lo = Math.max(0, supply[from] + demand[to] - total)
      pairs.push({ from, to, value: hi - lo <= tol ? hi : null })
    }
  const node = (k: string): FlowNode => (k === 'home' ? 'home' : (k as FlowNode))
  const flows = pairs.filter((p) => p.value != null && p.value > idle).map((p) => ({ from: node(p.from), to: node(p.to), watts: p.value! })).sort((a, b) => b.watts - a.watts)
  const known = (list: Pair[]) => list.every((p) => p.value != null)
  const parties = (list: Pair[], side: 'from' | 'to') => list.filter((p) => p.value! > idle).map((p) => p[side] as BatteryParty)

  const into = pairs.filter((p) => p.to === 'battery')
  const outOf = pairs.filter((p) => p.from === 'battery')
  const fromSolar = pairs.filter((p) => p.from === 'solar')
  const solarAllocation =
    supply.solar && known(fromSolar)
      ? { home: fromSolar.find((p) => p.to === 'home')?.value ?? 0, battery: fromSolar.find((p) => p.to === 'battery')?.value ?? 0, grid: fromSolar.find((p) => p.to === 'grid')?.value ?? 0 }
      : supply.solar
      ? null
      : { home: 0, battery: 0, grid: 0 }

  const clauses: SummaryClause[] = SOURCES.filter((s) => supply[s]).map((source) => {
    const mine = pairs.filter((p) => p.from === source)
    return { source, targets: known(mine) ? mine.filter((p) => p.value! > idle).map((p) => node(p.to)) : null }
  })

  return {
    ...base,
    battery: {
      ...batteryBase,
      sources: batteryState === 'charging' && known(into) && parties(into, 'from').length ? parties(into, 'from') : null,
      destinations: batteryState === 'discharging' && known(outOf) && parties(outOf, 'to').length ? parties(outOf, 'to') : null,
    },
    flows,
    splitKnown: known(pairs),
    solarAllocation,
    balance,
    summary: { kind: 'flows', clauses },
  }
}

// ── Freshness / connection ─────────────────────────────────────────────────

export type Connection = 'connecting' | 'open' | 'lost'
export type LiveState = 'live' | 'delayed' | 'offline' | 'connecting' | 'waiting'

/**
 * Readings older than this are "delayed" no matter how often SolarBMS
 * sends (same 5-minute rule as the API's LIVE_STALE_MS); beyond it "offline".
 */
export const DELAYED_AFTER_MS = 5 * 60_000
/** Live window = 3 × the observed send interval, within these bounds; 30 s until an interval is known. */
export const LIVE_WINDOW = { factor: 3, minMs: 5_000, maxMs: 120_000, defaultMs: 30_000 }
/** No stream message for this long = connection lost. The server sends one every second. */
export const CONNECTION_TIMEOUT_MS = 5_000

export interface LiveStatus {
  state: LiveState
  /** Age of the newest reading (ms, server clock), null without a reading. */
  ageMs: number | null
  /** Up to this age a reading counts as live. */
  liveWithinMs: number
}

/**
 * - offline: connection lost, or the newest reading is older than DELAYED_AFTER_MS
 * - delayed: connected, but the reading is older than the live window
 * - live: connected and the reading is within the live window
 * - connecting: stream not open yet (values shown are the last known)
 * - waiting: connected, no reading at all
 */
export function liveStatus({ readingAt, now, connection, intervalMs }: { readingAt: number | null; now: number; connection: Connection; intervalMs: number | null }): LiveStatus {
  const liveWithinMs = intervalMs == null ? LIVE_WINDOW.defaultMs : Math.min(LIVE_WINDOW.maxMs, Math.max(LIVE_WINDOW.minMs, LIVE_WINDOW.factor * intervalMs))
  const ageMs = readingAt == null ? null : Math.max(0, now - readingAt)
  if (connection === 'lost') return { state: 'offline', ageMs, liveWithinMs }
  if (ageMs == null) return { state: connection === 'connecting' ? 'connecting' : 'waiting', ageMs, liveWithinMs }
  if (ageMs > DELAYED_AFTER_MS) return { state: 'offline', ageMs, liveWithinMs }
  if (connection === 'connecting') return { state: 'connecting', ageMs, liveWithinMs }
  return { state: ageMs <= liveWithinMs ? 'live' : 'delayed', ageMs, liveWithinMs }
}

/** Median of the gaps between successive distinct reading times (ms); null with fewer than 2. */
export function sendInterval(readingTimes: number[]): number | null {
  const t = [...new Set(readingTimes)].sort((a, b) => a - b)
  const gaps = t.slice(1).map((x, i) => x - t[i]).filter((g) => g > 0)
  if (!gaps.length) return null
  gaps.sort((a, b) => a - b)
  return gaps[Math.floor((gaps.length - 1) / 2)]
}
