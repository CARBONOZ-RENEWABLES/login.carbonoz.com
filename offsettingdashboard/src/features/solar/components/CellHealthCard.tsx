import { ShieldCheck } from 'lucide-react'
import { useMemo } from 'react'
import { Card, CardHeader, ErrorState, Segmented, Skeleton, StatusBadge } from '../../../design'
import { formatFixed, translate as t } from '../../../i18n'
import { CellDrift, SolarDevice } from '../api'
import { DriftRange, rankCells, RankedCell, VERDICT_ORDER } from '../cellDrift'
import { VerdictBadge } from './CellDriftPanel'

const RANGES: DriftRange[] = ['24h', '7d', '30d']

interface Flagged extends RankedCell {
  pack: string
  anchor: string
}

/** Site-wide summary for the BMS tab: which cells, in which pack, keep leaving the others. */
export function CellHealthCard({
  range,
  onRange,
  drift,
  loading,
  error,
  onRetry,
  bms,
}: {
  range: DriftRange
  onRange: (r: DriftRange) => void
  drift: CellDrift | undefined
  loading: boolean
  error: boolean
  onRetry: () => void
  bms: Array<{ device: SolarDevice; label: string; anchor: string }>
}) {
  const flagged = useMemo<Flagged[]>(() => {
    if (!drift) return []
    return drift.packs
      .flatMap((p) => {
        const m = bms.find((b) => b.device.installationId === p.installationId && b.device.externalId === p.bmsId)
        return rankCells(p)
          .filter((c) => c.verdict !== 'ok')
          .map((c) => ({ ...c, pack: m?.label ?? p.bmsId, anchor: m?.anchor ?? '' }))
      })
      .sort((a, b) => VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict))
  }, [drift, bms])
  const cells = drift?.packs.reduce((s, p) => s + p.cells.length, 0) ?? 0

  return (
    <Card className='p-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <CardHeader title={t('solar.drift.healthTitle')} />
        <Segmented options={RANGES.map((id) => ({ id, label: t(`solar.ranges.${id}`) }))} value={range} onChange={onRange} label={t('solar.timeRange')} />
      </div>
      {/* Wraps on phones (the card subtitle would truncate). */}
      <p className='mt-1 text-[12.5px] leading-relaxed text-muted'>{t('solar.drift.healthHint')}</p>
      <div className='mt-4'>
        {loading ? (
          <Skeleton className='h-16 w-full' />
        ) : error ? (
          <ErrorState title={t('solar.drift.error')} onRetry={onRetry} />
        ) : !drift || !drift.packs.length ? (
          <p className='text-[12.5px] text-muted'>{t('solar.drift.noHistory')}</p>
        ) : !flagged.length ? (
          <div className='flex flex-wrap items-center gap-2 text-[12.5px] text-fg-2'>
            <StatusBadge tone='good'>
              <ShieldCheck size={12} className='-ml-0.5' />
              {t('solar.drift.allOk')}
            </StatusBadge>
            {t('solar.drift.checked', { cells, packs: drift.packs.length })}
          </div>
        ) : (
          <ul className='grid gap-2 sm:grid-cols-2 xl:grid-cols-3'>
            {flagged.slice(0, 9).map((c) => (
              <li key={`${c.anchor}:${c.id}`}>
                <button
                  type='button'
                  className='flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line bg-panel-2 px-3 py-2 text-left text-[12.5px] hover:border-line-strong'
                  onClick={() => document.getElementById(c.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  <span className='font-medium text-fg'>{t('solar.cells.cell', { id: c.id })}</span>
                  <span className='truncate text-muted'>{c.pack}</span>
                  <span className='ml-auto'>
                    <VerdictBadge c={c} />
                  </span>
                  <span className='tabular w-full text-[11.5px] text-fg-2'>
                    {c.verdict === 'runawayHigh'
                      ? t('solar.drift.why.high', { pct: formatFixed(c.highShare * 100, 0), mv: formatFixed(c.maxDevMv, 0) })
                      : c.verdict === 'runawayLow'
                        ? t('solar.drift.why.low', { pct: formatFixed(c.lowShare * 100, 0), mv: formatFixed(Math.abs(c.minDevMv), 0) })
                        : c.verdict === 'drifting'
                          ? t('solar.drift.why.trend', { mv: formatFixed(c.trendMvPerDay ?? 0, 1) })
                          : t('solar.drift.why.watch', { pct: formatFixed(c.outlierShare * 100, 0) })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {flagged.length > 9 && <p className='mt-2 text-[11.5px] text-muted'>{t('solar.drift.more', { n: flagged.length - 9 })}</p>}
      </div>
    </Card>
  )
}
