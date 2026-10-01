/**
 * Shared live/chart types of the Solar dashboard. The Energy Flow's semantic
 * model (directions, battery state, determined flows) is in
 * features/solar/flowState.ts.
 */

/** Freshness of the data shown in the header pill and the flow card. */
export type LiveStatus = 'loading' | 'live' | 'no-data' | 'error'

/** Chart time ranges. */
export type RangeId = '1h' | '6h' | '24h' | '7d' | '30d'

/** One chart row: a timestamp plus one value per series key. */
export type HistoryPoint = { t: number } & { [series: string]: number }
