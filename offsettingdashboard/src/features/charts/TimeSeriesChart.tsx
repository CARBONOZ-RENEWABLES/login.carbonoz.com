import { memo, useId, useMemo } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useChartTheme } from '../../design'
import { HistoryPoint, RangeId } from '../../services/energyFlow'
import { PanelDef, scaleOf } from './panels'

const TICK: Record<RangeId, number> = { '1h': 10 * 60_000, '6h': 3600_000, '24h': 4 * 3600_000, '7d': 86400_000, '30d': 5 * 86400_000 }

const pad = (n: number) => String(n).padStart(2, '0')

export function formatAxisTime(t: number, range: RangeId) {
  const d = new Date(t)
  if (range === '7d') return d.toLocaleDateString(undefined, { weekday: 'short' })
  if (range === '30d') return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatTooltipTime(t: number, range: RangeId) {
  const d = new Date(t)
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return range === '7d' || range === '30d' ? `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}` : time
}

/** Ticks aligned to local clock boundaries (00:00, 04:00 …). */
function buildTicks(data: { t: number }[], range: RangeId) {
  if (!data.length) return []
  const first = data[0].t
  const last = data[data.length - 1].t
  const step = TICK[range]
  const offset = new Date(first).getTimezoneOffset() * 60_000
  let t = Math.ceil((first - offset) / step) * step + offset
  const ticks: number[] = []
  while (t <= last) {
    ticks.push(t)
    t += step
  }
  return ticks
}

/** Averages buckets so bars keep a readable width. */
function downsample(rows: Record<string, number>[], max: number) {
  if (rows.length <= max) return rows
  const bucket = Math.ceil(rows.length / max)
  const out: Record<string, number>[] = []
  for (let i = 0; i < rows.length; i += bucket) {
    const slice = rows.slice(i, i + bucket)
    const avg: Record<string, number> = { t: slice[0].t }
    for (const k of Object.keys(slice[0])) {
      if (k === 't') continue
      const vals = slice.map((r) => r[k]).filter((v) => v != null)
      if (vals.length) avg[k] = vals.reduce((a, b) => a + b, 0) / vals.length
    }
    out.push(avg)
  }
  return out
}

interface TooltipProps {
  active?: boolean
  payload?: readonly { dataKey?: unknown; value?: unknown }[]
  label?: string | number
}

function ChartTooltip({ active, payload, label, panel, range, theme }: TooltipProps & { panel: PanelDef; range: RangeId; theme: ReturnType<typeof useChartTheme> }) {
  if (!active || !payload?.length || label == null) return null
  return (
    <div className='rounded-lg border px-2.5 py-2 text-[11px] shadow-xl' style={{ background: theme.tooltipBg, borderColor: theme.tooltipBorder, color: theme.text }}>
      <p className='mb-1 text-muted'>{formatTooltipTime(Number(label), range)}</p>
      {panel.series.map((s) => {
        const item = payload.find((p) => p.dataKey === s.key)
        if (!item || item.value == null) return null
        return (
          <p key={s.key} className='flex items-center gap-2'>
            <span className='h-2 w-2 rounded-sm' style={{ background: s.color }} />
            <span className='text-fg-2'>{s.name}</span>
            <span className='tabular ml-auto pl-3 font-semibold'>
              {Number(item.value).toFixed(panel.decimals)} {panel.unit}
            </span>
          </p>
        )
      })}
    </div>
  )
}

export interface TimeSeriesChartProps {
  panel: PanelDef
  data: HistoryPoint[]
  range: RangeId
  curve?: 'smooth' | 'linear'
  showGrid?: boolean
  large?: boolean
}

export const TimeSeriesChart = memo(function TimeSeriesChart({ panel, data, range, curve = 'smooth', showGrid = true, large }: TimeSeriesChartProps) {
  const theme = useChartTheme()
  const gid = useId().replace(/:/g, '')
  const div = scaleOf(panel)
  const rows = useMemo(() => {
    const scaled = data
      .filter((p) => panel.series.some((s) => p[s.key] != null))
      .map((p) => {
        const r: Record<string, number> = { t: p.t }
        for (const s of panel.series) if (p[s.key] != null) r[s.key] = (p[s.key] as number) / div
        return r
      })
    return panel.kind === 'bar' ? downsample(scaled, large ? 144 : 96) : scaled
  }, [data, panel, div, large])
  const ticks = useMemo(() => buildTicks(rows as { t: number }[], range), [rows, range])
  const type = curve === 'smooth' ? 'monotone' : 'linear'

  const { yDomain, yTicks } = useMemo(() => {
    const d = panel.domain ?? ['auto', 'auto']
    if (d[0] !== 'nice' && d[1] !== 'nice') return { yDomain: d as [number | 'auto', number | 'auto'], yTicks: undefined as number[] | undefined }
    // 'nice' → explicit ticks on a 1-2-5 step so axes read 0 · 2 · 4 · 6.
    let lo = Infinity
    let hi = -Infinity
    for (const p of rows) {
      for (const s of panel.series) {
        const v = p[s.key]
        if (v == null) continue
        if (v > hi) hi = v
        if (v < lo) lo = v
      }
    }
    if (!Number.isFinite(lo)) return { yDomain: [0, 1] as [number, number], yTicks: undefined }
    if (d[0] !== 'nice') lo = typeof d[0] === 'number' ? d[0] : lo
    if (d[1] !== 'nice') hi = typeof d[1] === 'number' ? d[1] : hi
    const raw = (hi - lo) / 4 || 1
    const mag = Math.pow(10, Math.floor(Math.log10(raw)))
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
    const start = Math.floor(lo / step) * step
    const end = Math.ceil(hi / step) * step
    const t: number[] = []
    for (let x = start; x <= end + step / 2; x += step) t.push(Math.round(x * 1000) / 1000)
    return { yDomain: [start, end] as [number, number], yTicks: t }
  }, [panel, rows])

  const fmtY = (v: number) => (panel.unit === '%' ? `${v}%` : String(Math.round(v * 100) / 100))
  const yWidth = useMemo(() => {
    const labels = (yTicks ?? [100]).map(fmtY)
    return Math.max(24, Math.max(...labels.map((l) => l.length)) * (large ? 7 : 5.6) + 10)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yTicks, large, panel.unit])
  const fontSize = large ? 11 : 9

  const common = { data: rows, margin: { top: 6, right: 6, bottom: 0, left: large ? 4 : -2 } }
  const axes = [
    showGrid && <CartesianGrid key='grid' stroke={theme.grid} strokeDasharray='2 3' vertical={false} />,
    <XAxis
      key='x'
      dataKey='t'
      type='number'
      scale='time'
      domain={['dataMin', 'dataMax']}
      ticks={ticks}
      tickFormatter={(t: number) => formatAxisTime(t, range)}
      tick={{ fill: theme.axis, fontSize }}
      axisLine={false}
      tickLine={false}
      tickMargin={6}
      minTickGap={8}
    />,
    <YAxis key='y' domain={yDomain} ticks={yTicks} tick={{ fill: theme.axis, fontSize }} axisLine={false} tickLine={false} width={yWidth} tickCount={5} interval={0} allowDecimals={panel.decimals > 0} tickFormatter={fmtY} />,
    <Tooltip
      key='tip'
      cursor={panel.kind === 'bar' ? { fill: theme.grid, opacity: 0.6 } : { stroke: theme.cursor, strokeWidth: 1 }}
      content={(p: TooltipProps) => <ChartTooltip {...p} panel={panel} range={range} theme={theme} />}
      isAnimationActive={false}
    />,
  ]
  const anim = { isAnimationActive: true, animationDuration: 650, animationEasing: 'ease-out' as const }

  let chart
  if (panel.kind === 'bar') {
    const s = panel.series[0]
    chart = (
      <BarChart {...common} barCategoryGap={1}>
        {axes}
        <ReferenceLine y={0} stroke={theme.axis} strokeOpacity={0.5} />
        <Bar dataKey={s.key} fill={s.color} radius={[1, 1, 1, 1]} {...anim} />
      </BarChart>
    )
  } else if (panel.kind === 'line') {
    chart = (
      <LineChart {...common}>
        {axes}
        {panel.series.map((s) => (
          <Line key={s.key} type={type} dataKey={s.key} stroke={s.color} strokeWidth={large ? 2 : 1.5} dot={false} connectNulls activeDot={{ r: 4, strokeWidth: 2, stroke: theme.tooltipBg }} {...anim} />
        ))}
      </LineChart>
    )
  } else {
    chart = (
      <AreaChart {...common}>
        <defs>
          {panel.series.map((s) => (
            <linearGradient key={s.key} id={`${gid}-${s.key}`} x1='0' y1='0' x2='0' y2='1'>
              <stop offset='0%' stopColor={s.color} stopOpacity={0.42} />
              <stop offset='100%' stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        {axes}
        {panel.domain?.[0] === 'nice' && <ReferenceLine y={0} stroke={theme.axis} strokeOpacity={0.4} />}
        {panel.series.map((s) => (
          <Area key={s.key} type={type} dataKey={s.key} stroke={s.color} strokeWidth={large ? 1.6 : 1.2} fill={`url(#${gid}-${s.key})`} dot={false} connectNulls activeDot={{ r: 3.5, strokeWidth: 2, stroke: theme.tooltipBg }} {...anim} />
        ))}
      </AreaChart>
    )
  }

  return (
    <ResponsiveContainer width='100%' height='100%' minHeight={100} debounce={80}>
      {chart}
    </ResponsiveContainer>
  )
})
