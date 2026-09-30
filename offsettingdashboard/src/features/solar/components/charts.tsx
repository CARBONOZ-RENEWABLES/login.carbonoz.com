import { formatDate, translate as t } from '../../../i18n'
import { useMemo } from 'react'
import { Card, CardHeader, EmptyState, ErrorState, Skeleton } from '../../../design'
import { SERIES } from '../../../design/theme'
import { HistoryPoint, RangeId } from '../../../services/energyFlow'
import { PanelDef } from '../../charts/panels'
import { TimeSeriesChart } from '../../charts/TimeSeriesChart'
import { DeviceKind, Forecast, useGetSolarHistoryQuery } from '../api'
import { metricMeta, seriesKey, unitOf } from '../model'

const RANGE_MS: Record<RangeId, number> = { '1h': 3600e3, '6h': 6 * 3600e3, '24h': 86400e3, '7d': 7 * 86400e3, '30d': 30 * 86400e3 }
const PALETTE = [SERIES.pv, SERIES.load, SERIES.grid, SERIES.soc, SERIES.battPower, SERIES.voltage, SERIES.current, SERIES.export]
/** Same colour per quantity as the existing Charts page. */
const METRIC_COLOR: Record<string, string> = {
  pv_power_w: SERIES.pv,
  load_power_w: SERIES.load,
  grid_power_w: SERIES.grid,
  battery_power_w: SERIES.battPower,
  soc_pct: SERIES.soc,
}

/**
 * Shapes arbitrary solar series into the existing chart's PanelDef so solar
 * charts look exactly like the Charts page. Watts are shown in kW like there.
 */
function panelFor(metric: string, unit: string | undefined, seriesIds: string[], labels?: Record<string, string>): PanelDef {
  const isPower = unit === 'W'
  return {
    id: metric,
    title: metricMeta(metric).label,
    unit: (isPower ? 'kW' : unit ?? '') as PanelDef['unit'],
    kind: seriesIds.length > 1 ? 'line' : 'area',
    series: seriesIds.map((id, i) => ({
      key: id,
      name: labels?.[id] ?? id,
      color: seriesIds.length === 1 ? METRIC_COLOR[metric] ?? PALETTE[0] : PALETTE[i % PALETTE.length],
    })),
    stats: [],
    decimals: isPower ? 2 : unit === 'V' ? 3 : 1,
    domain: unit === '%' ? [0, 100] : ['nice', 'nice'],
  }
}

function ChartFrame({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card className='flex flex-col p-4'>
      <CardHeader title={title} subtitle={subtitle} />
      <div className='mt-3 h-[240px]'>{children}</div>
    </Card>
  )
}

export function HistoryChart({ siteId, metric, kind, deviceId, range, refreshKey = 0, labels }: { siteId: string; metric: string; kind: DeviceKind; deviceId?: string; range: RangeId; refreshKey?: number; labels?: Record<string, string> }) {
  const { from, to } = useMemo(() => {
    const now = Date.now()
    return { from: new Date(now - RANGE_MS[range]).toISOString(), to: new Date(now).toISOString() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, refreshKey])
  const { data, isFetching, isError, refetch } = useGetSolarHistoryQuery({ siteId, metric, kind, deviceId, from, to })
  const h = data?.data
  const title = metricMeta(metric).label
  const { rows, ids } = useMemo(() => {
    const byT = new Map<number, Record<string, number>>()
    // Keyed per installation: two SolarBMS systems on one site may reuse device ids.
    for (const s of h?.series ?? []) for (const p of s.points) byT.set(p.t, { ...(byT.get(p.t) ?? { t: p.t }), [seriesKey(s.installationId, s.deviceId)]: p.avg })
    return { rows: [...byT.values()].sort((a, b) => a.t - b.t) as unknown as HistoryPoint[], ids: (h?.series ?? []).map((s) => seriesKey(s.installationId, s.deviceId)) }
  }, [h])

  let body
  if (isError) body = <ErrorState title={t('solar.errors.history')} onRetry={refetch} />
  else if (!h && isFetching) body = <Skeleton className='h-full w-full rounded-lg' /> // subtle shimmer, no spinner
  else if (!rows.length) body = <EmptyState title={t('solar.empty.noHistoryPeriod')} description={t('solar.empty.noHistoryPeriodHint')} className='h-full' />
  else body = <TimeSeriesChart panel={panelFor(metric, unitOf(metric, h?.unit), ids, labels)} data={rows} range={range} />

  return (
    <ChartFrame title={title} subtitle={h ? [ids.length > 1 && t('solar.chart.devices', { count: ids.length }), t('solar.chart.buckets', { n: Math.round(h.bucketSeconds / 60) || 1 })].filter(Boolean).join(' · ') : undefined}>
      {body}
    </ChartFrame>
  )
}

/** Forecast points: every numeric field becomes a series; missing forecast → empty state. */
export function ForecastChart({ forecast, loading }: { forecast: Forecast | null | undefined; loading?: boolean }) {
  const model = useMemo(() => {
    if (!forecast?.points?.length) return null
    const keys = [...new Set(forecast.points.flatMap((p) => Object.keys(p).filter((k) => k !== 'ts' && typeof p[k] === 'number')))]
    // Keep series with the same unit on one chart; lead with power.
    const first = keys.find((k) => unitOf(k) === 'W') ?? keys[0]
    if (!first) return null
    const unit = unitOf(first)
    const same = keys.filter((k) => unitOf(k) === unit)
    const rows = forecast.points.map((p) => ({ t: Date.parse(p.ts), ...Object.fromEntries(same.map((k) => [k, p[k] as number])) })) as unknown as HistoryPoint[]
    const span = rows.length > 1 ? (rows[rows.length - 1].t - rows[0].t) : 0
    const range: RangeId = span > 2 * 86400e3 ? '7d' : '24h'
    const labels = Object.fromEntries(same.map((k) => [k, metricMeta(k).label]))
    return { rows, range, panel: panelFor(first, unit, same, labels) }
  }, [forecast])

  if (loading && !forecast)
    return (
      <ChartFrame title={t('solar.forecast.title')}>
        <Skeleton className='h-full w-full rounded-lg' />
      </ChartFrame>
    )
  if (!model) {
    return (
      <Card className='p-4'>
        <CardHeader title={t('solar.forecast.title')} />
        <EmptyState className='mt-3' title={t('solar.forecast.empty')} description={t('solar.forecast.emptyHint')} />
      </Card>
    )
  }
  return (
    <ChartFrame title={t('solar.forecast.title')} subtitle={[forecast?.source, forecast?.generatedAt && t('solar.forecast.generated', { when: formatDate(forecast.generatedAt, { dateStyle: 'short', timeStyle: 'short' }) })].filter(Boolean).join(' · ')}>
      <TimeSeriesChart panel={{ ...model.panel, title: t('solar.forecast.title') }} data={model.rows} range={model.range} />
    </ChartFrame>
  )
}
