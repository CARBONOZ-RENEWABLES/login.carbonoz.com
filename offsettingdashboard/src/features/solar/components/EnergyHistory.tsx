import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ReactNode, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button, Card, CardHeader, EmptyState, ErrorState, Segmented, Skeleton, StatusBadge, useChartTheme } from '../../../design'
import { SERIES } from '../../../design/theme'
import { formatNumber, MessageKey, useT } from '../../../i18n'
import { EnergyRange, useGetSolarEnergyQuery } from '../api'
import { bucketLabel, EnergyRow, formatKwh, formatPct, periodLabel, Resolution, toRow, totals } from '../energy'
import { DataTable } from './tables'

const COLORS = {
  pv: SERIES.pv,
  consumption: SERIES.load,
  gridImport: SERIES.grid,
  batteryCharged: SERIES.soc,
  batteryDischarged: SERIES.battPower,
  coverage: SERIES.export,
}

type Series = 'pv' | 'consumption' | 'gridImport' | 'batteryCharged' | 'batteryDischarged'
const SERIES_LABEL: Record<Series | 'coverage', MessageKey> = {
  pv: 'energy.pv',
  consumption: 'energy.consumption',
  gridImport: 'energy.gridImport',
  batteryCharged: 'energy.batteryCharged',
  batteryDischarged: 'energy.batteryDischarged',
  coverage: 'energy.coverage',
}

/**
 * Energy history from the Carbonoz API: 30 days (daily), 1 year (monthly) and
 * 10 years (yearly), with charts suited to each resolution and a table.
 */
export function EnergyHistory({ siteId }: { siteId: string }) {
  const t = useT()
  const [range, setRange] = useState<EnergyRange>('30d')
  const [anchors, setAnchors] = useState<Partial<Record<EnergyRange, string>>>({})
  const q = useGetSolarEnergyQuery({ siteId, range, anchor: anchors[range] })
  const data = q.data?.data
  const rows = useMemo(() => (data ? data.buckets.map((b) => toRow(b)) : []), [data])
  const res: Resolution = data?.resolution ?? (range === '30d' ? 'day' : range === '1y' ? 'month' : 'year')
  const sum = useMemo(() => totals(rows), [rows])
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
      ) : !data ? (
        <div className='grid gap-3' aria-busy='true' aria-label={t('common.loading')}>
          <Skeleton className='h-20 rounded-xl' />
          <div className='grid gap-3 lg:grid-cols-2'>
            <Skeleton className='h-64 rounded-xl' />
            <Skeleton className='h-64 rounded-xl' />
          </div>
        </div>
      ) : !anyData ? (
        <EmptyState title={t('energy.empty')} description={data.firstDataAt ? t('energy.emptyPeriod') : t('energy.emptyNever')} />
      ) : (
        <div className={q.isFetching ? 'opacity-70 transition-opacity' : undefined}>
          <Totals sum={sum} res={res} />
          <Charts rows={rows} res={res} />
          <HistoryTable rows={rows} res={res} />
          <p className='mt-2 text-[11.5px] leading-relaxed text-subtle'>{t('energy.method')}</p>
        </div>
      )}
    </section>
  )
}

function Totals({ sum, res }: { sum: ReturnType<typeof totals>; res: Resolution }) {
  const t = useT()
  const items: { k: Series | 'coverage'; v: string }[] = [
    { k: 'pv', v: formatKwh(sum.pv, res) },
    { k: 'consumption', v: formatKwh(sum.consumption, res) },
    { k: 'gridImport', v: formatKwh(sum.gridImport, res) },
    { k: 'batteryCharged', v: formatKwh(sum.batteryCharged, res) },
    { k: 'batteryDischarged', v: formatKwh(sum.batteryDischarged, res) },
    { k: 'coverage', v: formatPct(sum.coverage) },
  ]
  return (
    <div className='mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6' aria-label={t('energy.totals')}>
      {items.map((i) => (
        <Card key={i.k} className='min-w-0 px-3.5 py-3'>
          <p className='flex items-center gap-1.5 truncate text-[11.5px] text-muted'>
            <span className='h-2 w-2 shrink-0 rounded-sm' style={{ background: COLORS[i.k] }} aria-hidden />
            {t(SERIES_LABEL[i.k])}
          </p>
          <p className='tabular mt-1 truncate text-[16px] font-semibold text-fg'>{i.v}</p>
        </Card>
      ))}
    </div>
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
        <EnergyBars title={t('energy.charts.pvVsConsumption')} points={points} series={['pv', 'consumption']} res={res} />
        <EnergyBars title={t('energy.charts.batteryDaily')} points={points} series={['batteryCharged', 'batteryDischarged']} res={res} />
        <EnergyBars title={t('energy.charts.gridImportDaily')} points={points} series={['gridImport']} res={res} />
        <CoverageLine title={t('energy.charts.coverageDaily')} points={points} res={res} />
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

function ChartCard({ title, unit, summary, className, children }: { title: string; unit: string; summary: string; className?: string; children: ReactNode }) {
  return (
    <Card className={`flex min-w-0 flex-col p-4 ${className ?? ''}`}>
      <CardHeader title={title} subtitle={unit} />
      <figure className='mt-3 h-[230px] min-w-0' aria-label={`${title}. ${summary}`}>
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

function CoverageLine({ title, points, res }: { title: string; points: Point[]; res: Resolution }) {
  const t = useT()
  const { grid, tick } = useAxes()
  const has = points.some((p) => p.coverage != null)
  return (
    <ChartCard title={title} unit='%' summary={`${t('energy.coverage')}: ${formatPct(totals(points).coverage)}`}>
      {!has ? (
        <EmptyState title={t('energy.noDataCoverage')} className='h-full' />
      ) : (
        <ResponsiveContainer width='100%' height='100%'>
          <LineChart data={points} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} accessibilityLayer>
            {grid}
            <XAxis dataKey='label' tick={tick} tickLine={false} axisLine={false} interval='preserveStartEnd' minTickGap={8} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={tick} tickLine={false} axisLine={false} width={48} tickFormatter={axisPct} />
            <Tooltip content={<EnergyTooltip res={res} series={['coverage']} />} />
            {/* No interpolation across missing days: connectNulls off, linear segments, dots per real value. */}
            <Line type='linear' dataKey='coverage' stroke={COLORS.coverage} strokeWidth={2} dot={{ r: 2.5 }} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
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

function RowState({ r }: { r: EnergyRow }) {
  const t = useT()
  if (!r.hasData) return <span className='text-[11px] text-subtle'>{t('energy.noData')}</span>
  if (r.inProgress) return <StatusBadge tone='info'>{t('energy.inProgressShort')}</StatusBadge>
  if (r.incomplete) return <StatusBadge tone='warning'>{t('energy.incomplete')}</StatusBadge>
  return null
}

/** Newest first. Table on larger screens, one card per bucket on phones (no sideways scrolling). */
function HistoryTable({ rows, res }: { rows: EnergyRow[]; res: Resolution }) {
  const t = useT()
  const list = [...rows].reverse()
  const cell = (v: number | null, pct = false) => (
    <span className={v == null ? 'text-subtle' : 'tabular text-fg'} title={v == null ? t('energy.noData') : undefined}>
      {pct ? formatPct(v) : formatKwh(v, res)}
    </span>
  )
  const columns: { key: Series | 'coverage'; pct?: boolean }[] = [
    { key: 'pv' },
    { key: 'consumption' },
    { key: 'gridImport' },
    { key: 'batteryCharged' },
    { key: 'batteryDischarged' },
    { key: 'coverage', pct: true },
  ]
  const dateHead = t(res === 'day' ? 'energy.table.date' : res === 'month' ? 'energy.table.month' : 'energy.table.year')
  return (
    <Card className='p-4'>
      <CardHeader title={t('energy.table.title')} />
      <div className='mt-3 hidden sm:block' data-testid='energy-table'>
        <DataTable<EnergyRow>
          rows={list}
          rowKey={(r) => r.key}
          pageSize={res === 'day' ? 31 : 12}
          columns={[
            {
              title: dateHead,
              key: 'key',
              render: (_, r) => (
                <span className='flex items-center gap-2 whitespace-nowrap'>
                  <span className='font-medium text-fg'>{bucketLabel(r.key, res, res === 'day' ? 'long' : 'long')}</span>
                  <RowState r={r} />
                </span>
              ),
            },
            ...columns.map((c) => ({
              title: t(SERIES_LABEL[c.key]),
              key: c.key,
              align: 'right' as const,
              render: (_: unknown, r: EnergyRow) => cell(r[c.key], c.pct),
            })),
          ]}
        />
      </div>
      <ul className='mt-3 grid gap-2 sm:hidden' data-testid='energy-cards'>
        {list.map((r) => (
          <li key={r.key} className='rounded-lg border border-line bg-panel-2 px-3 py-2.5'>
            <div className='flex items-center justify-between gap-2'>
              <span className='text-[13px] font-medium text-fg'>{bucketLabel(r.key, res, 'long')}</span>
              <RowState r={r} />
            </div>
            {r.hasData && (
              <dl className='mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]'>
                {columns.map((c) => (
                  <div key={c.key} className='flex min-w-0 justify-between gap-2'>
                    <dt className='truncate text-muted'>{t(SERIES_LABEL[c.key])}</dt>
                    <dd className='shrink-0'>{cell(r[c.key], c.pct)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}
