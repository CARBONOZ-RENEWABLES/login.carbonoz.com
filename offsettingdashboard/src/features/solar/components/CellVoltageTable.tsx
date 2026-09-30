import { formatDate, formatFixed, translate as t } from '../../../i18n'
import { useMemo } from 'react'
import { cn, StatusBadge } from '../../../design'
import { Cell } from '../api'
import { formatMetric, metricMeta } from '../model'
import { DataTable } from './tables'

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

  return (
    <div>
      <div className='mb-2 flex items-center justify-between'>
        <p className='text-[12.5px] font-medium text-fg-2'>{t('solar.cells.voltages')}</p>
        <span className='text-[11.5px] text-muted'>{t('solar.cells.count', { count: cells.length })}</span>
      </div>
      <ul className='grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8' aria-label={t('solar.cells.voltages')}>
        {sorted.map((c) => {
          const isLow = c.id === low
          const isHigh = c.id === high && span > 0
          const dev = c.voltage == null ? null : Math.round((c.voltage - avg) * 1000)
          const pos = c.voltage == null || span === 0 ? 50 : ((c.voltage - min) / span) * 100
          return (
            <li key={c.id} className={cn('rounded-lg border bg-panel-2 px-2.5 py-2', isLow ? 'border-accent/40' : isHigh ? 'border-gridp/40' : 'border-line')}>
              <div className='flex h-5 items-center justify-between gap-1'>
                <span className='text-[11px] text-muted'>{t('solar.cells.cell', { id: c.id })}</span>
                {isLow && <StatusBadge tone='info'>{t('solar.cells.min')}</StatusBadge>}
                {isHigh && <StatusBadge tone='warning'>{t('solar.cells.max')}</StatusBadge>}
              </div>
              <p className='tabular mt-0.5 text-[14px] font-semibold text-fg'>{c.voltage == null ? '—' : `${formatFixed(c.voltage, 3)} V`}</p>
              <div className='mt-1.5 h-1 overflow-hidden rounded-full bg-panel-3'>
                <div className={cn('h-full rounded-full', isLow ? 'bg-accent' : isHigh ? 'bg-gridp' : 'bg-batt')} style={{ width: `${Math.max(6, pos)}%` }} />
              </div>
              <p className='tabular mt-1 text-[10.5px] text-muted'>
                {dev == null ? '' : `${dev > 0 ? '+' : dev < 0 ? '−' : '±'}${Math.abs(dev)} mV`}
                {c.temperature != null && ` · ${formatFixed(c.temperature, 1)} °C`}
                {c.balancing && ` · ${t('solar.cells.balancing')}`}
              </p>
              {extras.slice(0, 2).map((k) => {
                if (c[k] == null) return null
                const f = formatMetric(k, c[k])
                return (
                  <p key={k} className='tabular truncate text-[10.5px] text-muted' title={metricMeta(k).label}>
                    {metricMeta(k).label} {f.value}
                    {f.unit && ` ${f.unit}`}
                  </p>
                )
              })}
            </li>
          )
        })}
      </ul>
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
