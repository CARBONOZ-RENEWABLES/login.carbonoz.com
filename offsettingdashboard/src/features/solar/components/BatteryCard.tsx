import { Activity, ArrowDownRight, ArrowUpRight, BatteryCharging, Gauge, HeartPulse, Minus, RefreshCcw, Thermometer, Zap } from 'lucide-react'
import { ReactNode, useId } from 'react'
import { Card, cn, StatusBadge, Tone } from '../../../design'
import { formatFixed, translate as t } from '../../../i18n'
import { powerText } from '../../dashboard/format'
import { DeviceKind, SolarDevice } from '../api'
import { batteryFigures, BatteryState } from '../battery'
import { num } from '../model'
import { DeviceHeader, MetricList } from './cards'

/** Keys shown in the hero/tiles; everything else goes to "All battery values". */
const SHOWN = ['soc_pct', 'voltage_v', 'battery_voltage_v', 'current_a', 'battery_current_a', 'power_w', 'battery_power_w', 'temperature_c', 'battery_temperature_c', 'soh_pct', 'cycle_count', 'remaining_capacity_ah', 'full_capacity_ah']

/** Charge colour: red when nearly empty, amber when low, green otherwise. */
const levelColor = (soc: number) => (soc < 15 ? 'rgb(var(--c-danger))' : soc < 35 ? 'rgb(var(--c-gridp))' : 'rgb(var(--c-batt))')

function duration(h: number) {
  const total = Math.round(h * 60)
  return t('solar.batteryCard.duration', { h: Math.floor(total / 60), m: total % 60 })
}

/** Large battery with 10 segments; the charge level fills from the left. */
function BatteryGauge({ soc, charging }: { soc: number | undefined; charging: boolean }) {
  const id = useId().replace(/:/g, '')
  const level = Math.max(0, Math.min(100, soc ?? 0))
  const color = soc == null ? 'rgb(var(--c-subtle))' : levelColor(level)
  const segs = 10
  const lit = Math.round((level / 100) * segs)
  return (
    <svg viewBox='0 0 212 96' className='h-auto w-full max-w-[212px]' role='img' aria-label={soc == null ? t('solar.batteryCard.noSoc') : `${t('metrics.soc_pct')} ${Math.round(level)}%`}>
      <defs>
        <linearGradient id={`${id}-shine`} x1='0' y1='0' x2='0' y2='1'>
          <stop offset='0' stopColor='#fff' stopOpacity='0.35' />
          <stop offset='0.5' stopColor='#fff' stopOpacity='0' />
        </linearGradient>
      </defs>
      <rect x='2' y='2' width='194' height='92' rx='18' fill='rgb(var(--c-panel-2))' stroke='rgb(var(--c-line-strong))' strokeWidth='2.5' />
      <rect x='198' y='32' width='10' height='32' rx='4' fill='rgb(var(--c-line-strong))' />
      {Array.from({ length: segs }, (_, i) => (
        <rect
          key={i}
          x={12 + i * 18}
          y='12'
          width='14'
          height='72'
          rx='4'
          fill={i < lit ? color : 'rgb(var(--c-panel-3))'}
          opacity={i < lit ? 0.35 + 0.65 * ((i + 1) / segs) : 1}
          className={charging && i === lit - 1 ? 'animate-pulse' : undefined}
        />
      ))}
      <rect x='8' y='8' width='182' height='40' rx='14' fill={`url(#${id}-shine)`} />
      {charging && <path d='M110 22 92 52h14l-6 22 22-33h-14l6-19z' fill='#fff' stroke='rgb(var(--c-panel))' strokeWidth='2' strokeLinejoin='round' />}
    </svg>
  )
}

function StateChip({ state, power }: { state: BatteryState; power: number | undefined }) {
  const tone: Tone = state === 'charging' ? 'good' : state === 'discharging' ? 'solar' : 'neutral'
  const Icon = state === 'charging' ? ArrowDownRight : state === 'discharging' ? ArrowUpRight : Minus
  return (
    <StatusBadge tone={tone} dot={state !== 'idle'} pulse={state === 'charging'}>
      <Icon size={12} className='-ml-0.5' />
      {t(`solar.batteryCard.${state}`)}
      {state !== 'idle' && power != null && <span className='tabular font-semibold'>{powerText(Math.abs(power))}</span>}
    </StatusBadge>
  )
}

function Tile({ icon, label, value, unit, tone }: { icon: ReactNode; label: string; value: string; unit?: string; tone?: 'warning' | 'critical' | 'good' }) {
  return (
    <div className='flex min-w-0 items-center gap-3 bg-panel px-4 py-3'>
      <span
        className={cn(
          'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
          tone === 'critical' ? 'bg-danger/10 text-danger' : tone === 'warning' ? 'bg-gridp/10 text-gridp' : tone === 'good' ? 'bg-batt/10 text-batt' : 'bg-panel-3 text-fg-2',
        )}
      >
        {icon}
      </span>
      <span className='min-w-0'>
        <span className='block truncate text-[11.5px] text-muted'>{label}</span>
        <span className='tabular block truncate text-[15px] font-semibold text-fg'>
          {value}
          {unit && <span className='ml-1 text-[12px] font-normal text-fg-2'>{unit}</span>}
        </span>
      </span>
    </div>
  )
}

function BmsStrip({ bms }: { bms: SolarDevice[] }) {
  return (
    <div className='grid gap-2 border-t border-line px-4 py-3'>
      {bms.map((b) => {
        const m = b.latest?.metrics ?? {}
        const cells = b.latest?.cells ?? []
        const count = num(m.cell_count) ?? (cells.length || undefined)
        const min = num(m.cell_voltage_min_v)
        const max = num(m.cell_voltage_max_v)
        const spread = num(m.cell_voltage_spread_mv)
        const balancing = cells.filter((c) => c.balancing).length
        const tone: Tone = spread == null ? 'neutral' : spread < 30 ? 'good' : spread < 80 ? 'warning' : 'critical'
        return (
          <div key={`${b.installationId}:${b.externalId}`} className='flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg bg-panel-2 px-3 py-2 text-[12px]'>
            <span className='flex items-center gap-1.5 font-medium text-fg'>
              <Activity size={13} className='text-muted' />
              {b.name ?? b.externalId}
            </span>
            {count != null && <span className='text-fg-2'>{t('solar.cells.count', { count })}</span>}
            {min != null && max != null && (
              <span className='tabular text-fg-2'>
                {formatFixed(min, 3)}–{formatFixed(max, 3)} V
              </span>
            )}
            {spread != null && (
              <StatusBadge tone={tone}>
                {t('solar.batteryCard.spread')} {formatFixed(spread, 0)} mV
              </StatusBadge>
            )}
            {balancing > 0 && <StatusBadge tone='info'>{t('solar.batteryCard.balancingCells', { count: balancing })}</StatusBadge>}
          </div>
        )
      })}
    </div>
  )
}

/** Premium battery card: charge gauge, live state, key figures, capacity, BMS summary, every other value. */
export function BatteryCard({ d, bms, unitOf, title }: { d: SolarDevice; bms: SolarDevice[]; unitOf: (kind: DeviceKind, key: string) => string | undefined; title?: string }) {
  const f = batteryFigures(d)
  const stale = !!d.latest?.stale
  const others = Object.fromEntries(Object.entries(d.latest?.metrics ?? {}).filter(([k]) => !SHOWN.includes(k)))
  const tiles = [
    f.voltage != null && <Tile key='v' icon={<Gauge size={15} />} label={t('solar.batteryCard.voltage')} value={formatFixed(f.voltage, 2)} unit='V' />,
    f.current != null && <Tile key='a' icon={<Activity size={15} />} label={t('solar.batteryCard.current')} value={formatFixed(f.current, 1)} unit='A' />,
    f.power != null && <Tile key='p' icon={<Zap size={15} />} label={t('solar.batteryCard.power')} value={powerText(Math.abs(f.power))} />,
    f.temperature != null && <Tile key='t' icon={<Thermometer size={15} />} label={t('solar.batteryCard.temperature')} value={formatFixed(f.temperature, 1)} unit='°C' tone={f.temperature >= 45 || f.temperature <= 0 ? 'warning' : undefined} />,
    f.soh != null && <Tile key='h' icon={<HeartPulse size={15} />} label={t('solar.batteryCard.health')} value={formatFixed(f.soh, 0)} unit='%' tone={f.soh >= 80 ? 'good' : f.soh >= 60 ? 'warning' : 'critical'} />,
    f.cycles != null && <Tile key='c' icon={<RefreshCcw size={15} />} label={t('solar.batteryCard.cycles')} value={formatFixed(f.cycles, 0)} />,
  ].filter(Boolean)
  const capPct = f.remainingAh != null && f.fullAh ? Math.max(0, Math.min(100, (f.remainingAh / f.fullAh) * 100)) : undefined

  return (
    <Card className='overflow-hidden p-0'>
      <div className='px-4 pt-4'>
        <DeviceHeader d={d} title={title} icon={<BatteryCharging size={16} />} />
      </div>

      {!d.latest ? (
        <p className='px-4 py-6 text-[12.5px] text-muted'>{t('solar.empty.noRecent')}</p>
      ) : (
        <>
          <div className={cn('grid items-center gap-5 px-4 py-5 sm:grid-cols-[minmax(0,212px)_minmax(0,1fr)]', stale && 'opacity-75')}>
            <BatteryGauge soc={f.soc} charging={f.state === 'charging' && !stale} />
            <div className='min-w-0'>
              <div className='flex items-baseline gap-1'>
                <span className='tabular text-[44px] font-semibold leading-none tracking-[-0.03em] text-fg'>{f.soc != null ? Math.round(f.soc) : '—'}</span>
                {f.soc != null && <span className='text-[20px] font-medium text-fg-2'>%</span>}
              </div>
              <p className='mt-1 text-[12.5px] text-muted'>{t('metrics.soc_pct')}</p>
              <div className='mt-3 flex flex-wrap items-center gap-2'>
                <StateChip state={f.state} power={f.power} />
                {f.etaHours != null && !stale && (
                  <span className='text-[12.5px] text-fg-2'>
                    {t(f.state === 'charging' ? 'solar.batteryCard.fullIn' : 'solar.batteryCard.emptyIn', { time: duration(f.etaHours) })}
                    <span className='text-muted'> · {t('solar.batteryCard.estimate')}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {tiles.length > 0 && <div className={cn('grid grid-cols-2 gap-px border-t border-line bg-line', tiles.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2', tiles.length % 2 === 1 && '[&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1')}>{tiles}</div>}

          {capPct != null && (
            <div className='border-t border-line px-4 py-3'>
              <div className='flex items-baseline justify-between text-[12px]'>
                <span className='text-muted'>{t('solar.batteryCard.capacity')}</span>
                <span className='tabular text-fg'>
                  {t('solar.batteryCard.capacityOf', { remaining: formatFixed(f.remainingAh!, 1), full: formatFixed(f.fullAh!, 1) })}
                </span>
              </div>
              <div className='mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel-3'>
                <div className='h-full rounded-full' style={{ width: `${capPct}%`, background: levelColor(capPct) }} />
              </div>
            </div>
          )}

          {bms.length > 0 && <BmsStrip bms={bms} />}

          {Object.keys(others).length > 0 && (
            <details className='border-t border-line px-4 py-3'>
              <summary className='cursor-pointer text-[12.5px] font-medium text-fg-2 hover:text-fg'>{t('solar.batteryCard.allValues')}</summary>
              <div className='mt-3'>
                <MetricList metrics={others} unitOf={unitOf} kind='BATTERY' />
              </div>
            </details>
          )}
        </>
      )}
    </Card>
  )
}
