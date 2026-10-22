import { translate as t } from '../../../i18n'
import { Activity } from 'lucide-react'
import { ReactNode } from 'react'
import { Card, CardHeader, cn, EmptyState, Skeleton, StatusBadge } from '../../../design'
import { relativeTime } from '../../../layout/ShellContext'
import { CellDrift, DeviceKind, MetricValue, PackDrift, SolarDevice } from '../api'
import { deviceTitle, formatMetric, metricMeta, orderedMetrics, statusTone } from '../model'
import { KEYS } from '../fields'
import { CellDriftPanel } from './CellDriftPanel'
import { CellVoltageTable } from './CellVoltageTable'

/** Headline value tile — same anatomy as the dashboard metric cards. */
export function MetricCard({ icon, label, value, unit, hint, tone }: { icon?: ReactNode; label: ReactNode; value: string; unit?: string; hint?: ReactNode; tone?: string }) {
  return (
    <Card className='flex min-w-0 items-start gap-3 px-4 py-3.5 2xl:px-5'>
      {icon && <span className='mt-1 grid h-9 w-9 shrink-0 place-items-center'>{icon}</span>}
      <span className='flex min-w-0 flex-1 flex-col'>
        <span className='truncate text-[12px] font-semibold uppercase leading-4 tracking-[0.02em] text-fg'>{label}</span>
        <span className='mt-1.5 flex items-baseline gap-1 text-fg'>
          <span className='tabular text-[23px] font-semibold leading-none tracking-[-0.02em]'>{value}</span>
          {unit && <span className='text-[15px] font-medium text-fg-2'>{unit}</span>}
        </span>
        {hint && <span className={cn('mt-2 truncate text-[13px] font-medium leading-4 text-muted', tone)}>{hint}</span>}
      </span>
    </Card>
  )
}

/** Small key/value status block (freshness, connection, counts). */
export function StatusCard({ title, icon, items, action }: { title: ReactNode; icon?: ReactNode; items: { label: ReactNode; value: ReactNode }[]; action?: ReactNode }) {
  return (
    <Card className='p-4'>
      <CardHeader title={title} icon={icon} action={action} />
      <dl className='mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]'>
        {items.map((it, i) => (
          <div key={i} className='min-w-0'>
            <dt className='truncate text-[11.5px] text-muted'>{it.label}</dt>
            <dd className='mt-0.5 truncate font-medium text-fg'>{it.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

/**
 * Every metric a device reports, headline metrics first. This is what makes
 * the dashboard dynamic: a new SolarBMS field shows up here automatically.
 */
export function MetricList({ metrics, unitOf, kind, exclude = [] }: { metrics: Record<string, MetricValue>; unitOf: (kind: DeviceKind, key: string) => string | undefined; kind: DeviceKind; exclude?: string[] }) {
  const rows = orderedMetrics(metrics).filter(([k]) => !exclude.includes(k))
  if (!rows.length) return <p className='text-[12.5px] text-muted'>{t('solar.empty.noValuesShort')}</p>
  return (
    <dl className='grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3'>
      {rows.map(([k, v]) => {
        const f = formatMetric(k, v, unitOf(kind, k))
        return (
          <div key={k} className='min-w-0'>
            <dt className='truncate text-[11.5px] text-muted' title={k}>
              {metricMeta(k).label}
            </dt>
            <dd className='tabular mt-0.5 truncate text-[13.5px] font-medium text-fg'>
              {f.value}
              {f.unit && <span className='ml-1 text-[12px] font-normal text-fg-2'>{f.unit}</span>}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

export function DeviceHeader({ d, icon, title, showStatus = true }: { d: SolarDevice; icon: ReactNode; title?: string; showStatus?: boolean }) {
  const status = d.latest?.status
  const subtitle = [d.manufacturer, d.model, d.externalId].filter(Boolean).join(' · ')
  return (
    <CardHeader
      title={title ?? deviceTitle(d)}
      subtitle={subtitle}
      icon={icon}
      action={
        <>
          {/* A delayed device's status is its last known one, so it is not shown as current. */}
          {d.latest?.stale ? <StatusBadge tone='warning'>{t('solar.fresh.delayed')}</StatusBadge> : showStatus && status && <StatusBadge tone={statusTone(status)} dot>{status}</StatusBadge>}
          {d.latest?.ts && <span className='hidden text-[11.5px] text-muted sm:inline'>{relativeTime(Date.parse(d.latest.ts))}</span>}
        </>
      }
    />
  )
}

const CELL_KEYS = ['cell_count', 'cell_voltage_min_v', 'cell_voltage_max_v', 'cell_voltage_avg_v', 'cell_voltage_spread_mv', 'cell_voltage_min_id', 'cell_voltage_max_id']

/** Pack values shown as tiles when reported (alternatives per value, first found wins). */
const PACK_KEYS = [['voltage_v'], ['current_a'], ['power_w'], ['soc_pct'], KEYS.soh, KEYS.cycles, ['temperature_c'], KEYS.mosTemp, KEYS.envTemp, KEYS.cellTempMax, KEYS.cellTempAvg, KEYS.cellTempMin]

/** Cell history for a BMS card: loading, or the site's drift result and this pack's part of it. */
export type BmsDriftProp = 'loading' | { data: CellDrift; pack?: PackDrift }

export function BMSCard({ d, unitOf, battery, title, drift, anchor }: { d: SolarDevice; unitOf: (kind: DeviceKind, key: string) => string | undefined; battery?: string; title?: string; drift?: BmsDriftProp; anchor?: string }) {
  const m = d.latest?.metrics ?? {}
  const cells = d.latest?.cells ?? []
  const stat = (k: string) => formatMetric(k, m[k], unitOf('BMS', k))
  // Pack health first (when the BMS reports it), then the cell summary.
  const health = PACK_KEYS.map((keys) => keys.find((k) => m[k] != null)).filter((k): k is string => !!k)
  const summary = [...health, ...CELL_KEYS.slice(1, 5).filter((k) => m[k] != null)]
  return (
    <Card className='scroll-mt-20 p-4' id={anchor}>
      <DeviceHeader d={d} title={title} icon={<Activity size={16} />} />
      {battery && <p className='mt-1 text-[12px] text-muted'>{t('solar.pack', { name: battery })}</p>}
      {summary.length > 0 && (
        <div className='mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4'>
          {summary.map((k) => {
            const f = stat(k)
            return (
              <div key={k} className='rounded-lg border border-line bg-panel-2 px-3 py-2'>
                <p className='truncate text-[11px] text-muted'>{metricMeta(k).label}</p>
                <p className='tabular mt-0.5 text-[15px] font-semibold text-fg'>
                  {f.value}
                  <span className='ml-1 text-[11.5px] font-normal text-fg-2'>{f.unit}</span>
                </p>
              </div>
            )
          })}
        </div>
      )}
      <div className='mt-4'>
        {cells.length ? (
          <CellVoltageTable cells={cells} minId={m.cell_voltage_min_id as string | undefined} maxId={m.cell_voltage_max_id as string | undefined} />
        ) : (
          <EmptyState title={t('solar.empty.noCells')} description={t('solar.empty.noCellsHint')} className='py-6' />
        )}
      </div>
      {drift !== undefined && (
        <section className='mt-4 border-t border-line pt-4' aria-label={t('solar.drift.title')}>
          <p className='mb-3 text-[12.5px] font-medium text-fg-2'>{t('solar.drift.title')}</p>
          {drift === 'loading' ? <Skeleton className='h-48 w-full' /> : <CellDriftPanel pack={drift.pack} drift={drift.data} />}
        </section>
      )}
      <details className='mt-4 border-t border-line pt-3'>
        <summary className='cursor-pointer text-[12.5px] font-medium text-fg-2 hover:text-fg'>{t('solar.allBmsValues')}</summary>
        <div className='mt-3'>
          <MetricList metrics={m} unitOf={unitOf} kind='BMS' exclude={[...CELL_KEYS, ...summary]} />
        </div>
      </details>
    </Card>
  )
}
