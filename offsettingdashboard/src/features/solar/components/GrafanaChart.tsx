import { useId, useMemo, useState } from 'react'
import { Area, Brush, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardHeader, cn, EmptyState, useChartTheme } from '../../../design'
import { formatNumber, useT } from '../../../i18n'
import { bucketLabel, EnergyRow, formatKwh, formatPct, GrafanaKey, seriesStats } from '../energy'

export interface GrafanaSeries {
  key: GrafanaKey
  label: string
  color: string
  /** Area = line with a gradient fill underneath; line = no fill. */
  kind?: 'area' | 'line'
}

export interface Threshold {
  from: number
  to: number
  color: string
}

type Row = EnergyRow & { axis: string }

/**
 * Grafana-style time series panel: gradient areas, crosshair tooltip across all
 * series, optional threshold bands and mean line, a zoom brush and a legend
 * table (min / max / mean / total) whose rows toggle their series.
 */
export function GrafanaChart({
  title,
  rows,
  series,
  unit,
  thresholds,
  meanLine,
  className,
}: {
  title: string
  rows: EnergyRow[]
  series: GrafanaSeries[]
  unit: 'kWh' | '%'
  thresholds?: Threshold[]
  /** Dashed mean line for this series (e.g. the average daily grid import). */
  meanLine?: GrafanaKey
  className?: string
}) {
  const t = useT()
  const theme = useChartTheme()
  const id = useId().replace(/:/g, '')
  const [hidden, setHidden] = useState<Set<GrafanaKey>>(new Set())
  const data: Row[] = useMemo(() => rows.map((r) => ({ ...r, axis: bucketLabel(r.key, 'day', 'medium') })), [rows])
  const stats = useMemo(() => Object.fromEntries(series.map((s) => [s.key, seriesStats(rows, s.key)])), [rows, series])
  const fmt = (v: number | null | undefined) => (v == null ? '—' : unit === '%' ? formatPct(v) : formatKwh(v, 'month'))
  const axisFmt = (v: number) => (unit === '%' ? formatNumber(v / 100, { style: 'percent', maximumFractionDigits: 0 }) : formatNumber(v, { maximumFractionDigits: v >= 100 ? 0 : 1 }))
  const has = series.some((s) => stats[s.key])
  const mean = meanLine ? stats[meanLine]?.mean : undefined
  const toggle = (k: GrafanaKey) =>
    setHidden((h) => {
      const n = new Set(h)
      if (n.has(k)) n.delete(k)
      // Keep at least one series visible, like Grafana.
      else if (n.size < series.length - 1) n.add(k)
      return n
    })
  const summary = series.map((s) => `${s.label}: ${fmt(unit === '%' ? stats[s.key]?.mean : stats[s.key]?.total)}`).join(', ')

  return (
    <Card className={cn('flex min-w-0 flex-col p-4', className)}>
      <CardHeader title={title} subtitle={unit} />
      <figure className='mt-3 h-[260px] min-w-0' aria-label={`${title}. ${summary}`}>
        {!has ? (
          <EmptyState title={t('energy.noDataSeries')} className='h-full' />
        ) : (
          <ResponsiveContainer width='100%' height='100%'>
            <ComposedChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 0 }} accessibilityLayer>
              <defs>
                {series.map((s) => (
                  <linearGradient key={s.key} id={`${id}-${s.key}`} x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='0%' stopColor={s.color} stopOpacity={0.42} />
                    <stop offset='100%' stopColor={s.color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke={theme.grid} strokeDasharray='2 4' />
              {thresholds?.map((b) => <ReferenceArea key={b.from} y1={b.from} y2={b.to} fill={b.color} fillOpacity={0.07} stroke='none' ifOverflow='hidden' />)}
              {thresholds?.slice(1).map((b) => <ReferenceLine key={`l${b.from}`} y={b.from} stroke={b.color} strokeOpacity={0.55} strokeDasharray='4 4' />)}
              <XAxis dataKey='axis' tick={{ fill: theme.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: theme.grid }} interval='preserveStartEnd' minTickGap={18} />
              <YAxis
                tick={{ fill: theme.axis, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={axisFmt}
                domain={unit === '%' ? [0, 100] : [0, 'auto']}
                ticks={unit === '%' ? [0, 25, 50, 75, 100] : undefined}
              />
              {mean != null && !hidden.has(meanLine!) && (
                <ReferenceLine y={mean} stroke={theme.axis} strokeDasharray='6 4' label={{ value: t('energy.grafana.meanLine', { value: fmt(mean) }), position: 'insideTopRight', fill: theme.axis, fontSize: 10.5 }} />
              )}
              <Tooltip cursor={{ stroke: theme.axis, strokeWidth: 1, strokeDasharray: '3 3' }} content={<GrafanaTooltip series={series.filter((s) => !hidden.has(s.key))} fmt={fmt} />} />
              {series.map((s) =>
                hidden.has(s.key) ? null : s.kind === 'line' ? (
                  <Line key={s.key} type='linear' dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: theme.tooltipBg }} connectNulls={false} isAnimationActive={false} />
                ) : (
                  <Area
                    key={s.key}
                    type='linear'
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={2}
                    fill={`url(#${id}-${s.key})`}
                    dot={data.length <= 12 ? { r: 2.5, fill: s.color, strokeWidth: 0 } : false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: theme.tooltipBg }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ),
              )}
              {data.length > 7 && <Brush dataKey='axis' height={18} travellerWidth={7} stroke={theme.axis} fill={theme.tooltipBg} tickFormatter={() => ''} />}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </figure>
      {has && (
        <table className='mt-3 w-full table-fixed text-[12px]' data-testid='grafana-legend'>
          <thead>
            <tr className='text-left text-[11px] text-muted'>
              <th className='w-[40%] pb-1 font-medium'>{t('energy.grafana.series')}</th>
              <th className='pb-1 text-right font-medium'>{t('energy.grafana.min')}</th>
              <th className='pb-1 text-right font-medium'>{t('energy.grafana.max')}</th>
              <th className='pb-1 text-right font-medium'>{t('energy.grafana.mean')}</th>
              <th className='hidden pb-1 text-right font-medium sm:table-cell'>{unit === '%' ? t('energy.grafana.last') : t('energy.grafana.total')}</th>
            </tr>
          </thead>
          <tbody>
            {series.map((s) => {
              const st = stats[s.key]
              const off = hidden.has(s.key)
              return (
                <tr key={s.key} className={cn('border-t border-line', off && 'opacity-45')}>
                  <td className='py-1.5 pr-2'>
                    <button type='button' onClick={() => toggle(s.key)} aria-pressed={!off} className='flex min-w-0 items-center gap-2 text-left font-medium text-fg hover:text-accent-ink' title={t('energy.grafana.toggle')}>
                      <span className='h-[3px] w-4 shrink-0 rounded-full' style={{ background: s.color }} />
                      <span className='truncate'>{s.label}</span>
                    </button>
                  </td>
                  <td className='tabular py-1.5 text-right text-fg-2'>{fmt(st?.min)}</td>
                  <td className='tabular py-1.5 text-right text-fg-2'>{fmt(st?.max)}</td>
                  <td className='tabular py-1.5 text-right text-fg-2'>{fmt(st?.mean)}</td>
                  <td className='tabular hidden py-1.5 text-right font-medium text-fg sm:table-cell'>{fmt(unit === '%' ? st?.last : st?.total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </Card>
  )
}

function GrafanaTooltip({ active, payload, series, fmt }: { active?: boolean; payload?: readonly { payload?: Row }[]; series: GrafanaSeries[]; fmt: (v: number | null | undefined) => string }) {
  const t = useT()
  const theme = useChartTheme()
  const p = payload?.[0]?.payload
  if (!active || !p) return null
  // Highest value first, like Grafana's sorted tooltip.
  const items = [...series].sort((a, b) => (p[b.key] ?? -Infinity) - (p[a.key] ?? -Infinity))
  return (
    <div className='min-w-[200px] rounded-lg border px-3 py-2.5 text-[12px] shadow-xl' style={{ background: theme.tooltipBg, borderColor: theme.tooltipBorder, color: theme.text }}>
      <p className='mb-1.5 text-[11.5px] text-muted'>{bucketLabel(p.key, 'day', 'long')}</p>
      {items.map((s) => (
        <p key={s.key} className='flex items-center gap-2 py-0.5'>
          <span className='h-[3px] w-3.5 rounded-full' style={{ background: s.color }} />
          <span className='text-fg-2'>{s.label}</span>
          <span className='tabular ml-auto pl-4 font-semibold'>{p[s.key] == null ? t('energy.noData') : fmt(p[s.key])}</span>
        </p>
      ))}
      {p.inProgress ? <p className='mt-1 text-muted'>{t('energy.inProgress')}</p> : p.incomplete && p.completeness != null ? <p className='mt-1 text-muted'>{t('energy.incompleteShare', { pct: formatPct(p.completeness * 100) })}</p> : null}
    </div>
  )
}
