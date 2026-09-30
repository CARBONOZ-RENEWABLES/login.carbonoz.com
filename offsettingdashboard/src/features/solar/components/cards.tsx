import { Activity, Cpu } from 'lucide-react'
import { ReactNode } from 'react'
import { BatteryGlyph, Card, CardHeader, cn, EmptyState, StatusBadge } from '../../../design'
import { relativeTime } from '../../../layout/ShellContext'
import { DeviceKind, MetricValue, SolarDevice } from '../api'
import { deviceTitle, formatMetric, metricMeta, num, orderedMetrics, statusTone } from '../model'
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
  if (!rows.length) return <p className='text-[12.5px] text-muted'>No values reported.</p>
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

function DeviceHeader({ d, icon, title }: { d: SolarDevice; icon: ReactNode; title?: string }) {
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
          {d.latest?.stale ? <StatusBadge tone='warning'>Delayed</StatusBadge> : status && <StatusBadge tone={statusTone(status)} dot>{status}</StatusBadge>}
          {d.latest?.ts && <span className='hidden text-[11.5px] text-muted sm:inline'>{relativeTime(Date.parse(d.latest.ts))}</span>}
        </>
      }
    />
  )
}

export function InverterCard({ d, unitOf, title }: { d: SolarDevice; unitOf: (kind: DeviceKind, key: string) => string | undefined; title?: string }) {
  return (
    <Card className='p-4'>
      <DeviceHeader d={d} title={title} icon={<Cpu size={16} />} />
      <div className='mt-4'>{d.latest ? <MetricList metrics={d.latest.metrics} unitOf={unitOf} kind='INVERTER' /> : <p className='text-[12.5px] text-muted'>No recent data.</p>}</div>
    </Card>
  )
}

export function BatteryCard({ d, bms, unitOf, title }: { d: SolarDevice; bms: SolarDevice[]; unitOf: (kind: DeviceKind, key: string) => string | undefined; title?: string }) {
  const soc = num(d.latest?.metrics.soc_pct)
  return (
    <Card className='p-4'>
      <DeviceHeader d={d} title={title} icon={<BatteryGlyph level={soc ?? 0} width={11} height={18} />} />
      {soc != null && (
        <div className='mt-4'>
          <div className='flex items-baseline justify-between'>
            <span className='text-[12px] text-muted'>State of charge</span>
            <span className='tabular text-[18px] font-semibold text-fg'>{Math.round(soc)}%</span>
          </div>
          <div className='mt-1.5 h-2 overflow-hidden rounded-full bg-panel-3' role='meter' aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(soc)} aria-label='State of charge'>
            <div className='h-full rounded-full bg-batt' style={{ width: `${Math.max(0, Math.min(100, soc))}%` }} />
          </div>
        </div>
      )}
      <div className='mt-4'>{d.latest ? <MetricList metrics={d.latest.metrics} unitOf={unitOf} kind='BATTERY' exclude={['soc_pct']} /> : <p className='text-[12.5px] text-muted'>No recent data.</p>}</div>
      {bms.length > 0 && (
        <p className='mt-4 border-t border-line pt-3 text-[12px] text-muted'>
          BMS: {bms.map((b) => deviceTitle(b)).join(', ')}
        </p>
      )}
    </Card>
  )
}

const CELL_KEYS = ['cell_count', 'cell_voltage_min_v', 'cell_voltage_max_v', 'cell_voltage_avg_v', 'cell_voltage_spread_mv', 'cell_voltage_min_id', 'cell_voltage_max_id']

export function BMSCard({ d, unitOf, battery, title }: { d: SolarDevice; unitOf: (kind: DeviceKind, key: string) => string | undefined; battery?: string; title?: string }) {
  const m = d.latest?.metrics ?? {}
  const cells = d.latest?.cells ?? []
  const stat = (k: string) => formatMetric(k, m[k], unitOf('BMS', k))
  const summary = CELL_KEYS.slice(1, 5).filter((k) => m[k] != null)
  return (
    <Card className='p-4'>
      <DeviceHeader d={d} title={title} icon={<Activity size={16} />} />
      {battery && <p className='mt-1 text-[12px] text-muted'>Pack: {battery}</p>}
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
          <EmptyState title='No cell data' description='This BMS has not reported individual cell voltages yet.' className='py-6' />
        )}
      </div>
      <details className='mt-4 border-t border-line pt-3'>
        <summary className='cursor-pointer text-[12.5px] font-medium text-fg-2 hover:text-fg'>All BMS values</summary>
        <div className='mt-3'>
          <MetricList metrics={m} unitOf={unitOf} kind='BMS' exclude={CELL_KEYS} />
        </div>
      </details>
    </Card>
  )
}
