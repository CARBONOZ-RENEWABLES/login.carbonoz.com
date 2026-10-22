import { formatDate, formatFixed, translate as t } from '../../../i18n'
import { useMemo } from 'react'
import { cn, StatusBadge } from '../../../design'
import { Cell } from '../api'
import { formatMetric, metricMeta } from '../model'
import { DataTable } from './tables'
import { CELL_LOW_CHIP, voltageWindow } from '../cellDrift'

const BASE_KEYS = new Set(['id', 'voltage', 'temperature', 'balancing', 'ts'])
/** Per-cell values beyond the basics, in first-seen order across all cells. */
const extraKeys = (cells: Cell[]) => [...new Set(cells.flatMap((c) => Object.keys(c).filter((k) => !BASE_KEYS.has(k) && c[k] != null)))]

const byId = (a: Cell, b: Cell) => {
  const na = Number(a.id)
  const nb = Number(b.id)
  return Number.isFinite(na) && Number.isFinite(nb) ? na - nb : a.id.localeCompare(b.id)
}

/**
 * One tile per cell: voltage, deviation from the pack average and a bar
 * positioned between the lowest and highest cell. Min/max are highlighted.
 */
export function CellVoltageTable({ cells, minId, maxId }: { cells: Cell[]; minId?: string; maxId?: string }) {
  const { sorted, min, max, avg } = useMemo(() => {
    const sorted = [...cells].sort(byId)
    const v = sorted.map((c) => c.voltage).filter((x): x is number => typeof x === 'number')
    const min = v.length ? Math.min(...v) : 0
    const max = v.length ? Math.max(...v) : 0
    const avg = v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0
    return { sorted, min, max, avg }
  }, [cells])
  const extras = useMemo(() => extraKeys(cells), [cells])
  const low = minId ?? sorted.find((c) => c.voltage === min)?.id
  const high = maxId ?? sorted.find((c) => c.voltage === max)?.id
  const span = max - min
  const win = voltageWindow(max)

  return (
    <div>
      <div className='mb-2 flex items-center justify-between'>
        <p className='text-[12.5px] font-medium text-fg-2'>{t('solar.cells.voltages')}</p>
        <span className='text-[11.5px] text-muted'>{t('solar.cells.count', { count: cells.length })}</span>
      </div>
      {/* Bars like a BMS app: fill = voltage in the chemistry's window, text = voltage and distance from the pack average. */}
      <ol className='grid gap-1.5 sm:grid-flow-col' style={{ gridTemplateRows: `repeat(${Math.ceil(sorted.length / (sorted.length > 8 ? 2 : 1))}, minmax(0, auto))` }} aria-label={t('solar.cells.voltages')}>
        {sorted.map((c) => {
          const isLow = c.id === low && span > 0
          const isHigh = c.id === high && span > 0
          const dev = c.voltage == null ? null : Math.round((c.voltage - avg) * 1000)
          const fill = c.voltage == null ? 0 : Math.max(2, Math.min(100, ((c.voltage - win.lo) / (win.hi - win.lo)) * 100))
          return (
            <li
              key={c.id}
              title={`${t('solar.cells.cell', { id: c.id })}${isHigh ? ` · ${t('solar.cells.max')}` : isLow ? ` · ${t('solar.cells.min')}` : ''}`}
              className={cn(
                'relative h-8 overflow-hidden rounded-md border bg-gradient-to-r from-[rgb(var(--c-cell-low)/0.10)] via-panel-2 to-[rgb(var(--c-cell-high)/0.14)]',
                isHigh ? 'border-[rgb(var(--c-cell-high))] shadow-[0_0_10px_rgb(var(--c-cell-high)/0.45)]' : isLow ? 'border-[rgb(var(--c-cell-low))] shadow-[0_0_10px_rgb(var(--c-cell-low)/0.45)]' : 'border-line',
              )}
            >
              <div className='absolute inset-y-0 left-0 rounded-r-md bg-gradient-to-r from-[rgb(var(--c-cell-low)/0.25)] to-[rgb(var(--c-cell-low)/0.55)] transition-[width] duration-700' style={{ width: `${fill}%` }} />
              <div className='relative flex h-full items-center gap-2 px-2'>
                <span className='grid h-5 min-w-[22px] place-items-center rounded bg-panel/80 px-1 text-[11px] font-semibold text-fg'>{c.id}</span>
                <span className='tabular text-[12.5px] font-semibold text-fg'>{c.voltage == null ? '—' : `${formatFixed(c.voltage, 3)} V`}</span>
                <span className='tabular ml-auto text-[11px] text-fg-2'>
                  {dev == null ? '' : `${dev > 0 ? '+' : dev < 0 ? '−' : '±'}${Math.abs(dev)} mV`}
                  {c.temperature != null && ` · ${formatFixed(c.temperature, 1)} °C`}
                  {c.balancing && ` · ${t('solar.cells.balancing')}`}
                </span>
                {isHigh && <StatusBadge tone='critical'>{t('solar.cells.max')}</StatusBadge>}
                {isLow && <StatusBadge tone='info' className={CELL_LOW_CHIP}>{t('solar.cells.min')}</StatusBadge>}
              </div>
            </li>
          )
        })}
      </ol>
      <details className='mt-3'>
        <summary className='cursor-pointer text-[12.5px] font-medium text-fg-2 hover:text-fg'>{t('solar.cells.all')}</summary>
        <div className='mt-2'>
          <DataTable<Cell>
            rows={sorted}
            rowKey={(c) => c.id}
            columns={[
              { title: t('solar.cells.cellColumn'), key: 'id', render: (_, c) => <span className='font-medium text-fg'>{c.id}</span> },
              { title: t('solar.cells.voltage'), key: 'v', render: (_, c) => <span className='tabular'>{c.voltage == null ? '—' : `${formatFixed(c.voltage, 3)} V`}</span> },
              { title: t('solar.cells.deltaAvg'), key: 'd', render: (_, c) => <span className='tabular text-fg-2'>{c.voltage == null ? '—' : `${Math.round((c.voltage - avg) * 1000)} mV`}</span> },
              ...(sorted.some((c) => c.temperature != null) ? [{ title: t('solar.cells.temperature'), key: 't', render: (_: unknown, c: Cell) => <span className='tabular'>{c.temperature == null ? '—' : `${formatFixed(c.temperature, 1)} °C`}</span> }] : []),
              ...(sorted.some((c) => c.balancing != null) ? [{ title: t('solar.cells.balancingColumn'), key: 'b', render: (_: unknown, c: Cell) => (c.balancing ? <StatusBadge tone='info'>{t('solar.cells.balancing')}</StatusBadge> : c.balancing === false ? t('common.no') : '—') }] : []),
              ...extras.map((k) => ({
                title: metricMeta(k).label,
                key: k,
                render: (_: unknown, c: Cell) => {
                  const f = formatMetric(k, c[k] ?? undefined)
                  return <span className='tabular'>{f.value}{f.unit && ` ${f.unit}`}</span>
                },
              })),
              ...(sorted.some((c) => c.ts) ? [{ title: t('solar.cells.measured'), key: 'ts', render: (_: unknown, c: Cell) => <span className='tabular text-fg-2'>{c.ts ? formatDate(c.ts, { timeStyle: 'medium' }) : '—'}</span> }] : []),
            ]}
          />
        </div>
      </details>
    </div>
  )
}
