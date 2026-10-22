import { ArrowDown, ArrowUp, ShieldCheck, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react'
import { ReactNode, useMemo, useState } from 'react'
import { cn, StatusBadge, Tone } from '../../../design'
import { formatDate, formatFixed, translate as t } from '../../../i18n'
import { CellDrift, PackDrift } from '../api'
import { CELL_LOW_CHIP, CellVerdict, devColor, rankCells, RankedCell, scaleMv } from '../cellDrift'
import { DataTable } from './tables'

const VERDICT: Record<CellVerdict, { tone: Tone; icon: ReactNode }> = {
  runawayHigh: { tone: 'critical', icon: <ArrowUp size={12} className='-ml-0.5' /> },
  runawayLow: { tone: 'info', icon: <ArrowDown size={12} className='-ml-0.5' /> },
  drifting: { tone: 'warning', icon: <TrendingUp size={12} className='-ml-0.5' /> },
  watch: { tone: 'warning', icon: <TriangleAlert size={12} className='-ml-0.5' /> },
  ok: { tone: 'good', icon: <ShieldCheck size={12} className='-ml-0.5' /> },
}

export function VerdictBadge({ c }: { c: RankedCell }) {
  const v = VERDICT[c.verdict]
  const icon = c.verdict === 'drifting' && (c.trendMvPerDay ?? 0) < 0 ? <TrendingDown size={12} className='-ml-0.5' /> : v.icon
  return (
    <StatusBadge tone={v.tone} className={c.verdict === 'runawayLow' ? CELL_LOW_CHIP : undefined}>
      {icon}
      {t(`solar.drift.verdict.${c.verdict}`)}
    </StatusBadge>
  )
}

const pct = (x: number) => `${formatFixed(x * 100, x > 0 && x < 0.01 ? 1 : 0)} %`
const signed = (mv: number, d = 0) => `${mv > 0 ? '+' : mv < 0 ? '−' : '±'}${formatFixed(Math.abs(mv), d)}`

/** Rows = cells, columns = time buckets, colour = furthest excursion from the pack average in that bucket (short spikes stay visible). Hover for the values. */
function Heatmap({ pack, bucketSeconds }: { pack: PackDrift; bucketSeconds: number }) {
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null)
  const ids = pack.cells.map((c) => c.id)
  const cols = pack.buckets.length
  const bound = useMemo(() => scaleMv(pack), [pack])
  const longRange = bucketSeconds >= 3600
  const fmt = (ms: number) => formatDate(new Date(ms).toISOString(), longRange ? { dateStyle: 'short', timeStyle: 'short' } : { timeStyle: 'short' })
  const hb = hover ? pack.buckets[hover.col] : undefined
  const hv = hover && hb ? hb.cells[ids[hover.row]] : undefined
  const hp = hover && hb ? hb.peaks[ids[hover.row]] : undefined

  return (
    <div>
      <div className='relative' onMouseLeave={() => setHover(null)}>
        <div className='grid grid-cols-[28px_minmax(0,1fr)] gap-x-2 gap-y-[2px]'>
          {ids.map((id, row) => (
            <div key={id} className='contents'>
              <span className={cn('tabular text-right text-[10.5px] leading-[12px] text-muted', hover?.row === row && 'font-semibold text-fg')}>{id}</span>
              <svg
                viewBox={`0 0 ${cols} 1`}
                preserveAspectRatio='none'
                className='block h-3 w-full cursor-crosshair'
                onMouseMove={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  const col = Math.min(cols - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * cols)))
                  setHover({ row, col })
                }}
                aria-hidden
              >
                {pack.buckets.map((b, col) => (
                  <rect key={b.t} x={col} y={0} width={1.02} height={1} style={{ fill: devColor(b.peaks[id], bound) }} />
                ))}
                {hover?.col != null && <rect x={hover.col} y={0} width={1} height={1} fill='none' stroke='rgb(var(--c-fg))' strokeWidth={0.08} vectorEffect='non-scaling-stroke' />}
              </svg>
            </div>
          ))}
        </div>
        {hover && hb && (
          <div
            role='tooltip'
            className='pointer-events-none absolute z-10 w-max max-w-[220px] rounded-lg border border-line bg-panel px-3 py-2 text-[12px] shadow-[var(--shadow-pop)]'
            style={{
              top: `${hover.row * 14 + 16}px`,
              left: `calc(36px + (100% - 36px) * ${(hover.col + 0.5) / cols})`,
              transform: `translateX(${(hover.col + 0.5) / cols > 0.6 ? '-100%' : '0'})`,
            }}
          >
            <p className='font-semibold text-fg'>{t('solar.cells.cell', { id: ids[hover.row] })}</p>
            <p className='tabular text-fg-2'>{fmt(hb.t)}</p>
            <p className='tabular mt-1 text-fg'>{hp == null ? '—' : t('solar.drift.peak', { mv: signed(hp, 1) })}</p>
            {hv != null && <p className='tabular text-fg-2'>{t('solar.drift.vsAverage', { mv: signed(hv, 1) })}</p>}
            <p className='tabular text-fg-2'>{t('solar.drift.packSpread', { mv: formatFixed(hb.spreadMv, 0), max: formatFixed(hb.spreadMaxMv, 0) })}</p>
          </div>
        )}
      </div>
      <div className='mt-1.5 grid grid-cols-[28px_minmax(0,1fr)] gap-x-2'>
        <span />
        <div className='tabular flex justify-between text-[10.5px] text-muted'>
          <span>{fmt(pack.buckets[0].t)}</span>
          {cols > 4 && <span className='hidden sm:inline'>{fmt(pack.buckets[Math.floor(cols / 2)].t)}</span>}
          <span>{fmt(pack.buckets[cols - 1].t)}</span>
        </div>
      </div>
      <div className='mt-3 flex flex-wrap items-center gap-2 text-[11px] text-fg-2'>
        <span>{t('solar.drift.below')}</span>
        <span className='tabular'>−{bound} mV</span>
        <span className='h-2 w-32 rounded-full' style={{ background: `linear-gradient(90deg, ${devColor(-bound, bound)}, ${devColor(0, bound)}, ${devColor(bound, bound)})` }} aria-hidden />
        <span className='tabular'>+{bound} mV</span>
        <span>{t('solar.drift.above')}</span>
      </div>
    </div>
  )
}

/** One pack's cell history: heatmap over time plus every cell ranked by how often and how far it leaves the pack. */
export function CellDriftPanel({ pack, drift }: { pack: PackDrift | undefined; drift: CellDrift | undefined }) {
  const ranked = useMemo(() => (pack ? rankCells(pack) : []), [pack])
  if (!pack || !drift || !pack.buckets.length) return <p className='text-[12.5px] text-muted'>{t('solar.drift.noHistory')}</p>
  const flagged = ranked.filter((c) => c.verdict !== 'ok')
  const th = drift.thresholds
  return (
    <div className='flex min-w-0 flex-col gap-4'>
      <div className='flex flex-wrap items-center gap-2 text-[12.5px]'>
        {flagged.length ? (
          flagged.slice(0, 4).map((c) => (
            <span key={c.id} className='flex items-center gap-1.5'>
              <span className='font-medium text-fg'>{t('solar.cells.cell', { id: c.id })}</span>
              <VerdictBadge c={c} />
            </span>
          ))
        ) : (
          <StatusBadge tone='good'>
            <ShieldCheck size={12} className='-ml-0.5' />
            {t('solar.drift.allOk')}
          </StatusBadge>
        )}
        <span className='ml-auto text-[11.5px] text-muted'>
          {pack.samples > 0 && `${t('solar.drift.unbalanced', { mv: th.extremeMinSpreadMv, pct: formatFixed((pack.unbalancedSamples / pack.samples) * 100, 0) })} · `}
          {t('solar.drift.samples', { n: pack.samples.toLocaleString() })}
          {drift.sampling > 1 && ` · ${t('solar.drift.sampled', { n: drift.sampling })}`}
        </span>
      </div>

      <Heatmap pack={pack} bucketSeconds={drift.bucketSeconds} />

      {/* Opened when something is flagged; otherwise the heatmap says enough. */}
      <details open={flagged.length > 0}>
        <summary className='cursor-pointer text-[12.5px] font-medium text-fg-2 hover:text-fg'>{t('solar.drift.ranking', { count: ranked.length })}</summary>
        <div className='mt-2 overflow-x-auto'>
          <DataTable<RankedCell>
            rows={ranked}
            rowKey={(c) => c.id}
            columns={[
              { title: t('solar.cells.cellColumn'), key: 'id', render: (_, c) => <span className='font-medium text-fg'>{c.id}</span> },
              { title: t('solar.drift.col.verdict'), key: 'v', render: (_, c) => <VerdictBadge c={c} /> },
              { title: t('solar.drift.col.highest'), key: 'hi', render: (_, c) => <span className='tabular'>{pct(c.highShare)}</span> },
              { title: t('solar.drift.col.lowest'), key: 'lo', render: (_, c) => <span className='tabular'>{pct(c.lowShare)}</span> },
              { title: t('solar.drift.col.mean'), key: 'm', render: (_, c) => <span className='tabular'>{signed(c.meanDevMv, 1)} mV</span> },
              { title: t('solar.drift.col.range'), key: 'r', render: (_, c) => <span className='tabular text-fg-2'>{signed(c.minDevMv)} … {signed(c.maxDevMv)} mV</span> },
              { title: t('solar.drift.col.outOfBand', { mv: th.outlierMv }), key: 'o', render: (_, c) => <span className='tabular'>{pct(c.outlierShare)}</span> },
              { title: t('solar.drift.col.trend'), key: 't', render: (_, c) => <span className='tabular text-fg-2'>{c.trendMvPerDay == null ? '—' : `${signed(c.trendMvPerDay, 1)} mV/${t('solar.drift.day')}`}</span> },
            ]}
          />
        </div>
      </details>
      <p className='text-[11.5px] leading-relaxed text-muted'>{t('solar.drift.explain', { spread: th.extremeMinSpreadMv, mv: th.outlierMv })}</p>
    </div>
  )
}
