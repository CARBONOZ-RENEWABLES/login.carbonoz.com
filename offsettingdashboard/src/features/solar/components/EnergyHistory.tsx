import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ReactNode, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button, Card, CardHeader, EmptyState, ErrorState, Segmented, useChartTheme } from '../../../design'
import { formatNumber, useT } from '../../../i18n'
import { EnergyRange, useGetSolarEnergyQuery } from '../api'
import { bucketLabel, EnergyRow, formatKwh, formatPct, periodLabel, Resolution, toRow, totals } from '../energy'
import { GrafanaChart } from './GrafanaChart'
import { COLORS, Series, SERIES_LABEL } from './energyStyle'
import { EnergyTable } from './EnergyTable'

/**
 * Energy history from the Carbonoz API: 30 days (daily), 1 year (monthly) and
 * 10 years (yearly), with charts suited to each resolution and a table.
 */
export function EnergyHistory({ siteId, siteName }: { siteId: string; siteName?: string }) {
  const t = useT()
  const [range, setRange] = useState<EnergyRange>('30d')
  const [anchors, setAnchors] = useState<Partial<Record<EnergyRange, string>>>({})
  const q = useGetSolarEnergyQuery({ siteId, range, anchor: anchors[range] })
  const data = q.data?.data
  const rows = useMemo(() => (data ? data.buckets.map((b) => toRow(b)) : []), [data])
  const res: Resolution = data?.resolution ?? (range === '30d' ? 'day' : range === '1y' ? 'month' : 'year')
  const anyData = rows.some((r) => r.hasData)
  const go = (anchor: string | null | undefined) => anchor && setAnchors((a) => ({ ...a, [range]: anchor }))

  return (
    <section aria-labelledby='energy-history-title' className='flex flex-col gap-3'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div className='min-w-0'>
          <h2 id='energy-history-title' className='text-[15px] font-semibold text-fg'>
            {t('energy.title')}
          </h2>
          <p className='text-[12px] text-muted'>{data ? t('energy.subtitle', { period: periodLabel(rows, res), tz: data.timezone }) : t('energy.subtitleLoading')}</p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Button size='icon-sm' variant='outline' aria-label={t('energy.earlier')} title={t('energy.earlier')} disabled={!data} onClick={() => go(data?.previousAnchor)}>
            <ChevronLeft size={15} />
          </Button>
          <Button size='icon-sm' variant='outline' aria-label={t('energy.later')} title={t('energy.later')} disabled={!data?.nextAnchor} onClick={() => go(data?.nextAnchor)}>
            <ChevronRight size={15} />
          </Button>
          <Segmented<EnergyRange>
            label={t('energy.range')}
            value={range}
            onChange={setRange}
            options={[
              { id: '30d', label: t('energy.ranges.30d') },
              { id: '1y', label: t('energy.ranges.1y') },
              { id: '10y', label: t('energy.ranges.10y') },
            ]}
          />
        </div>
      </div>

      {q.isError ? (
        <ErrorState title={t('energy.error')} description={t('errors.tryAgain')} onRetry={q.refetch} />
      ) : !data ? null : !anyData ? (
        <EmptyState title={t('energy.empty')} description={data.firstDataAt ? t('energy.emptyPeriod') : t('energy.emptyNever')} />
      ) : (
        <div className={q.isFetching ? 'opacity-70 transition-opacity' : undefined}>
          <Charts rows={rows} res={res} />
          <EnergyTable siteId={siteId} siteName={siteName ?? ''} timezone={data.timezone} chartRows={rows} chartRes={res} />
          <p className='mt-2 text-[11.5px] leading-relaxed text-subtle'>{t('energy.method')}</p>
        </div>
      )}
    </section>
  )
}

/** Chart point: missing values stay `null`, so Recharts draws no bar and no line segment. */
type Point = EnergyRow & { label: string }

function Charts({ rows, res }: { rows: EnergyRow[]; res: Resolution }) {
  const t = useT()
  const points: Point[] = rows.map((r) => ({ ...r, label: bucketLabel(r.key, res) }))
  if (res === 'day') {
    return (
      <div className='mb-3 grid gap-3 lg:grid-cols-2'>
        <BatteryFlowChart title={t('energy.charts.batteryDaily')} points={points} res={res} className='lg:col-span-2' />
        <GrafanaChart
          title={t('energy.charts.pvVsConsumption')}
          rows={rows}
          unit='kWh'
          className='lg:col-span-2'
          series={[
            { key: 'pv', label: t('energy.pv'), color: COLORS.pv },
            { key: 'consumption', label: t('energy.consumption'), color: COLORS.consumption },
          ]}
        />
        <GrafanaChart title={t('energy.charts.gridImportDaily')} rows={rows} unit='kWh' meanLine='gridImport' series={[{ key: 'gridImport', label: t('energy.gridImport'), color: COLORS.gridImport }]} />
        <GrafanaChart
          title={t('energy.charts.coverageDaily')}
          rows={rows}
          unit='%'
          series={[{ key: 'coverage', label: t('energy.coverage'), color: COLORS.coverage }]}
          thresholds={[
            { from: 0, to: 50, color: 'rgb(var(--c-danger))' },
            { from: 50, to: 80, color: 'rgb(var(--c-gridp))' },
            { from: 80, to: 100, color: 'rgb(var(--c-batt))' },
          ]}
        />
      </div>
    )
  }
  const labels = res === 'year'
  const p = res === 'month' ? 'monthly' : 'yearly'
  return (
    <div className='mb-3 grid gap-3 lg:grid-cols-2'>
      <EnergyBars title={t(`energy.charts.${p}.pv`)} points={points} series={['pv']} res={res} labels={labels} />
      <EnergyBars title={t(`energy.charts.${p}.consumption`)} points={points} series={['consumption']} res={res} labels={labels} />
      <EnergyBars title={t(`energy.charts.${p}.battery`)} points={points} series={['batteryCharged', 'batteryDischarged']} res={res} labels={labels} />
      <EnergyBars title={t(`energy.charts.${p}.gridImport`)} points={points} series={['gridImport']} res={res} labels={labels} />
      <CoverageBars title={t(`energy.charts.${p}.coverage`)} points={points} res={res} labels={labels} className='lg:col-span-2' />
    </div>
  )
}

function ChartCard({ title, unit, summary, className, tall, children }: { title: string; unit: string; summary: string; className?: string; tall?: boolean; children: ReactNode }) {
  return (
    <Card className={`flex min-w-0 flex-col p-4 ${className ?? ''}`}>
      <CardHeader title={title} subtitle={unit} />
      <figure className={`mt-3 min-w-0 ${tall ? 'h-[300px]' : 'h-[230px]'}`} aria-label={`${title}. ${summary}`}>
        {children}
      </figure>
    </Card>
  )
}

const axisKwh = (v: number) => formatNumber(v, { maximumFractionDigits: v >= 100 ? 0 : 1 })
const axisPct = (v: number) => formatNumber(v / 100, { style: 'percent', maximumFractionDigits: 0 })

function useAxes() {
  const theme = useChartTheme()
  return {
    theme,
    grid: <CartesianGrid stroke={theme.grid} strokeDasharray='3 3' vertical={false} />,
    tick: { fill: theme.axis, fontSize: 11 },
  }
}

function EnergyTooltip({ active, payload, res, series }: { active?: boolean; payload?: readonly { payload?: Point }[]; res: Resolution; series: (Series | 'coverage')[] }) {
  const t = useT()
  const theme = useChartTheme()
  const p = payload?.[0]?.payload
  if (!active || !p) return null
  return (
    <div className='rounded-lg border px-2.5 py-2 text-[11.5px] shadow-xl' style={{ background: theme.tooltipBg, borderColor: theme.tooltipBorder, color: theme.text }}>
      <p className='mb-1 font-medium'>{bucketLabel(p.key, res, 'long')}</p>
      {series.map((s) => {
        const v = p[s]
        return (
          <p key={s} className='flex items-center gap-2'>
            <span className='h-2 w-2 rounded-sm' style={{ background: COLORS[s] }} />
            <span className='text-fg-2'>{t(SERIES_LABEL[s])}</span>
            <span className='tabular ml-auto pl-3 font-semibold'>{v == null ? t('energy.noData') : s === 'coverage' ? formatPct(v) : formatKwh(v, res)}</span>
          </p>
        )
      })}
      {p.inProgress ? (
        <p className='mt-1 text-muted'>{t('energy.inProgress')}</p>
      ) : p.incomplete && p.completeness != null ? (
        <p className='mt-1 text-muted'>{t('energy.incompleteShare', { pct: formatPct(p.completeness * 100) })}</p>
      ) : null}
    </div>
  )
}

function EnergyBars({ title, points, series, res, labels }: { title: string; points: Point[]; series: Series[]; res: Resolution; labels?: boolean }) {
  const t = useT()
  const { theme, grid, tick } = useAxes()
  const has = points.some((p) => series.some((s) => p[s] != null))
  const summary = series.map((s) => `${t(SERIES_LABEL[s])}: ${formatKwh(totals(points)[s], res)}`).join(', ')
  return (
    <ChartCard title={title} unit='kWh' summary={summary}>
      {!has ? (
        <EmptyState title={t('energy.noDataSeries')} className='h-full' />
      ) : (
        <ResponsiveContainer width='100%' height='100%'>
          <BarChart data={points} margin={{ top: labels ? 18 : 6, right: 4, left: 0, bottom: 0 }} barGap={2} accessibilityLayer>
            {grid}
            <XAxis dataKey='label' tick={tick} tickLine={false} axisLine={false} interval='preserveStartEnd' minTickGap={8} />
            <YAxis tick={tick} tickLine={false} axisLine={false} width={48} tickFormatter={axisKwh} />
            <Tooltip cursor={{ fill: theme.cursor, opacity: 0.15 }} content={<EnergyTooltip res={res} series={series} />} />
            {series.map((s) => (
              <Bar key={s} dataKey={s} name={t(SERIES_LABEL[s])} fill={COLORS[s]} radius={[3, 3, 0, 0]} maxBarSize={res === 'day' ? 14 : 36} isAnimationActive={false}>
                {points.map((p) => (
                  // Incomplete buckets are drawn lighter; missing ones not at all.
                  <Cell key={p.key} fillOpacity={p.incomplete ? 0.45 : 1} />
                ))}
                {labels && <LabelList dataKey={s} position='top' formatter={(v: number | null) => (v == null ? '' : axisKwh(v))} style={{ fill: theme.axis, fontSize: 10 }} />}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
      <Legend series={series} />
    </ChartCard>
  )
}

/** Vertical dashed hover line (instead of a highlighted band). */
function DashedCursor({ x = 0, y = 0, width = 0, height = 0 }: { x?: number; y?: number; width?: number; height?: number }) {
  const cx = x + width / 2
  return <line x1={cx} x2={cx} y1={y} y2={y + height} stroke='rgb(var(--c-accent))' strokeWidth={1.2} strokeDasharray='4 4' />
}

type FlowPoint = Point & { charged: number | null; discharged: number | null; axis: string }

function BatteryFlowTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: FlowPoint }[] }) {
  const t = useT()
  const theme = useChartTheme()
  const p = payload?.[0]?.payload
  if (!active || !p) return null
  const net = p.batteryCharged != null && p.batteryDischarged != null ? p.batteryCharged - p.batteryDischarged : null
  const row = (color: string, label: string, v: number | null, sign: 1 | -1) => (
    <p className='flex items-center gap-2.5 py-0.5'>
      <span className='h-2.5 w-2.5 rounded-full' style={{ background: color }} />
      <span className='text-fg-2'>{label}:</span>
      <span className='tabular ml-auto pl-4 font-medium'>{v == null ? t('energy.noData') : formatKwh(sign * v, 'month')}</span>
    </p>
  )
  return (
    <div className='min-w-[220px] rounded-xl border px-3.5 py-3 text-[12.5px] shadow-xl' style={{ background: theme.tooltipBg, borderColor: theme.tooltipBorder, color: theme.text }}>
      <p className='mb-1.5 text-center text-[13px] font-semibold'>{bucketLabel(p.key, 'day', 'long')}</p>
      {row(COLORS.batteryCharged, t('energy.batteryCharged'), p.batteryCharged, 1)}
      {row(COLORS.batteryDischarged, t('energy.batteryDischarged'), p.batteryDischarged, -1)}
      {net != null && (
        <p className='mt-1.5 border-t pt-1.5 font-semibold' style={{ borderColor: theme.tooltipBorder }}>
          {t('energy.net')}: <span className='tabular'>{(net > 0 ? '+' : '') + formatKwh(net, 'month')}</span>
        </p>
      )}
      {p.inProgress ? <p className='mt-1 text-muted'>{t('energy.inProgress')}</p> : p.incomplete && p.completeness != null ? <p className='mt-1 text-muted'>{t('energy.incompleteShare', { pct: formatPct(p.completeness * 100) })}</p> : null}
    </div>
  )
}

/**
 * Battery charged vs discharged per day as a diverging bar chart: charged above
 * the zero line, discharged below — translucent fills with a solid outline.
 */
function BatteryFlowChart({ title, points, res, className }: { title: string; points: Point[]; res: Resolution; className?: string }) {
  const t = useT()
  const { theme, tick } = useAxes()
  const data: FlowPoint[] = points.map((p) => ({ ...p, charged: p.batteryCharged, discharged: p.batteryDischarged == null ? null : -p.batteryDischarged, axis: bucketLabel(p.key, res, 'medium') }))
  const has = data.some((p) => p.charged != null || p.discharged != null)
  const sum = totals(points)
  const summary = `${t('energy.batteryCharged')}: ${formatKwh(sum.batteryCharged, res)}, ${t('energy.batteryDischarged')}: ${formatKwh(sum.batteryDischarged, res)}`
  return (
    <ChartCard title={title} unit='kWh' summary={summary} className={className} tall>
      {!has ? (
        <EmptyState title={t('energy.noDataSeries')} className='h-full' />
      ) : (
        <ResponsiveContainer width='100%' height='100%'>
          <BarChart data={data} stackOffset='sign' barCategoryGap='22%' margin={{ top: 8, right: 8, left: 0, bottom: 0 }} accessibilityLayer>
            <CartesianGrid stroke={theme.grid} />
            <XAxis dataKey='axis' tick={tick} tickLine={false} axisLine={false} interval='preserveStartEnd' minTickGap={16} />
            <YAxis tick={tick} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => axisKwh(Math.abs(v))} />
            <ReferenceLine y={0} stroke={theme.axis} strokeOpacity={0.6} />
            <Tooltip cursor={<DashedCursor />} content={<BatteryFlowTooltip />} />
            <Bar dataKey='charged' stackId='battery' name={t('energy.batteryCharged')} fill={COLORS.batteryCharged} stroke={COLORS.batteryCharged} strokeWidth={1.5} radius={[5, 5, 0, 0]} maxBarSize={30} isAnimationActive={false}>
              {data.map((p) => (
                <Cell key={p.key} fillOpacity={p.incomplete ? 0.22 : 0.45} strokeOpacity={p.incomplete ? 0.5 : 1} />
              ))}
            </Bar>
            <Bar dataKey='discharged' stackId='battery' name={t('energy.batteryDischarged')} fill={COLORS.batteryDischarged} stroke={COLORS.batteryDischarged} strokeWidth={1.5} radius={[5, 5, 0, 0]} maxBarSize={30} isAnimationActive={false}>
              {data.map((p) => (
                <Cell key={p.key} fillOpacity={p.incomplete ? 0.22 : 0.45} strokeOpacity={p.incomplete ? 0.5 : 1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      <Legend series={['batteryCharged', 'batteryDischarged']} />
    </ChartCard>
  )
}

function CoverageBars({ title, points, res, labels, className }: { title: string; points: Point[]; res: Resolution; labels?: boolean; className?: string }) {
  const t = useT()
  const { theme, grid, tick } = useAxes()
  const has = points.some((p) => p.coverage != null)
  return (
    <ChartCard title={title} unit='%' summary={`${t('energy.coverage')}: ${formatPct(totals(points).coverage)}`} className={className}>
      {!has ? (
        <EmptyState title={t('energy.noDataCoverage')} className='h-full' />
      ) : (
        <ResponsiveContainer width='100%' height='100%'>
          <BarChart data={points} margin={{ top: 18, right: 4, left: 0, bottom: 0 }} accessibilityLayer>
            {grid}
            <XAxis dataKey='label' tick={tick} tickLine={false} axisLine={false} interval='preserveStartEnd' minTickGap={8} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={tick} tickLine={false} axisLine={false} width={48} tickFormatter={axisPct} />
            <Tooltip cursor={{ fill: theme.cursor, opacity: 0.15 }} content={<EnergyTooltip res={res} series={['coverage']} />} />
            <Bar dataKey='coverage' fill={COLORS.coverage} radius={[3, 3, 0, 0]} maxBarSize={36} isAnimationActive={false}>
              {points.map((p) => (
                <Cell key={p.key} fillOpacity={p.incomplete ? 0.45 : 1} />
              ))}
              {(labels || res === 'month') && <LabelList dataKey='coverage' position='top' formatter={(v: number | null) => (v == null ? '' : formatPct(v))} style={{ fill: theme.axis, fontSize: 10 }} />}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  )
}

function Legend({ series }: { series: Series[] }) {
  const t = useT()
  if (series.length < 2) return null
  return (
    <div className='mt-2 flex flex-wrap gap-3 text-[11.5px] text-fg-2'>
      {series.map((s) => (
        <span key={s} className='flex items-center gap-1.5'>
          <span className='h-2 w-2 rounded-sm' style={{ background: COLORS[s] }} aria-hidden />
          {t(SERIES_LABEL[s])}
        </span>
      ))}
    </div>
  )
}
