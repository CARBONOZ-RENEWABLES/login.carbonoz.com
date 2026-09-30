import { AlertTriangle, ArrowRight, CalendarDays, Cpu, Gauge, Moon, Percent, Sigma, Sun, Thermometer, Waves, Zap } from 'lucide-react'
import { ReactNode, useId } from 'react'
import { Card, cn, StatusBadge, Tone } from '../../../design'
import { formatFixed, translate as t } from '../../../i18n'
import { powerText } from '../../dashboard/format'
import { DeviceKind, SolarDevice } from '../api'
import { inverterFigures, InverterState } from '../inverter'
import { DeviceHeader, MetricList } from './cards'

const STATE: Record<InverterState, { tone: Tone; icon: ReactNode }> = {
  producing: { tone: 'good', icon: <Sun size={12} className='-ml-0.5' /> },
  standby: { tone: 'neutral', icon: <Moon size={12} className='-ml-0.5' /> },
  fault: { tone: 'critical', icon: <AlertTriangle size={12} className='-ml-0.5' /> },
}

/** Output ring: filled against the rated power when it is reported, otherwise a plain status ring. */
function PowerRing({ output, load, state }: { output: number | undefined; load: number | undefined; state: InverterState }) {
  const id = useId().replace(/:/g, '')
  const r = 52
  const c = 2 * Math.PI * r
  const arc = 0.75 // 270° gauge
  const filled = load != null ? load : state === 'producing' ? 1 : 0
  const color = state === 'fault' ? 'rgb(var(--c-danger))' : 'rgb(var(--c-solar))'
  const p = output == null ? null : powerText(Math.abs(output)).split(' ')
  return (
    <div className='relative h-[140px] w-[140px] shrink-0'>
      <svg viewBox='0 0 128 128' className='h-full w-full -rotate-[225deg]' aria-hidden>
        <defs>
          <linearGradient id={`${id}-g`} x1='0' y1='0' x2='1' y2='1'>
            <stop offset='0' stopColor={color} stopOpacity='0.55' />
            <stop offset='1' stopColor={color} />
          </linearGradient>
        </defs>
        <circle cx='64' cy='64' r={r} fill='none' stroke='rgb(var(--c-panel-3))' strokeWidth='10' strokeLinecap='round' strokeDasharray={`${c * arc} ${c}`} />
        {filled > 0 && <circle
          cx='64'
          cy='64'
          r={r}
          fill='none'
          stroke={`url(#${id}-g)`}
          strokeWidth='10'
          strokeLinecap='round'
          strokeDasharray={`${c * arc * filled} ${c}`}
          className={cn('transition-[stroke-dasharray] duration-700', state === 'producing' && load == null && 'animate-pulse')}
        />}
      </svg>
      <div className='absolute inset-0 flex flex-col items-center justify-center text-center'>
        <span className='tabular text-[28px] font-semibold leading-none tracking-[-0.03em] text-fg'>{p ? p[0] : '—'}</span>
        {p && <span className='mt-0.5 text-[12.5px] font-medium text-fg-2'>{p[1]}</span>}
        <span className='mt-1 text-[10.5px] uppercase tracking-[0.08em] text-muted'>{t('solar.inverterCard.output')}</span>
      </div>
    </div>
  )
}

function FlowStrip({ pvInput, output, acVoltage, frequency, active }: { pvInput?: number; output?: number; acVoltage?: number; frequency?: number; active: boolean }) {
  const side = (icon: ReactNode, label: string, main: string, sub: string | null) => (
    <div className='flex min-w-0 items-center gap-2.5'>
      <span className='grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-panel-3 text-fg-2'>{icon}</span>
      <span className='min-w-0'>
        <span className='block truncate text-[11px] uppercase tracking-[0.06em] text-muted'>{label}</span>
        <span className='tabular block truncate text-[14px] font-semibold text-fg'>{main}</span>
        {sub && <span className='tabular block truncate text-[11.5px] text-fg-2'>{sub}</span>}
      </span>
    </div>
  )
  return (
    <div className='grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-xl border border-line bg-panel-2 px-3 py-2.5'>
      {side(<Sun size={16} className='text-solar' />, t('solar.inverterCard.dcInput'), pvInput != null ? powerText(pvInput) : '—', null)}
      <span className={cn('flex items-center gap-1 text-subtle', active && 'text-solar')} aria-hidden>
        <span className={cn('h-[2px] w-6 rounded bg-current opacity-60', active && 'animate-pulse')} />
        <ArrowRight size={15} />
      </span>
      {side(
        <Zap size={16} className='text-accent-ink' />,
        t('solar.inverterCard.acOutput'),
        output != null ? powerText(Math.abs(output)) : '—',
        [acVoltage != null && `${formatFixed(acVoltage, 0)} V`, frequency != null && `${formatFixed(frequency, 2)} Hz`].filter(Boolean).join(' · ') || null,
      )}
    </div>
  )
}

function Tile({ icon, label, value, unit, tone }: { icon: ReactNode; label: string; value: string; unit?: string; tone?: 'warning' | 'good' }) {
  return (
    <div className='flex min-w-0 items-center gap-3 bg-panel px-4 py-3'>
      <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', tone === 'warning' ? 'bg-gridp/10 text-gridp' : tone === 'good' ? 'bg-batt/10 text-batt' : 'bg-panel-3 text-fg-2')}>{icon}</span>
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

/** Premium inverter card: output ring, live state, DC → AC flow, key figures, string inputs, every other value. */
export function InverterCard({ d, unitOf, title }: { d: SolarDevice; unitOf: (kind: DeviceKind, key: string) => string | undefined; title?: string }) {
  const f = inverterFigures(d)
  const stale = !!d.latest?.stale
  const others = Object.fromEntries(Object.entries(d.latest?.metrics ?? {}).filter(([k]) => !f.used.has(k)))
  const tiles = [
    f.yieldToday != null && <Tile key='yt' icon={<CalendarDays size={15} />} label={t('solar.inverterCard.yieldToday')} value={formatFixed(f.yieldToday, 1)} unit='kWh' />,
    f.yieldTotal != null && <Tile key='yT' icon={<Sigma size={15} />} label={t('solar.inverterCard.yieldTotal')} value={formatFixed(f.yieldTotal, f.yieldTotal >= 1000 ? 0 : 1)} unit='kWh' />,
    f.efficiency != null && <Tile key='ef' icon={<Percent size={15} />} label={t('solar.inverterCard.efficiency')} value={formatFixed(f.efficiency, 1)} unit='%' tone={f.efficiency >= 90 ? 'good' : undefined} />,
    f.temperature != null && <Tile key='t' icon={<Thermometer size={15} />} label={t('solar.inverterCard.temperature')} value={formatFixed(f.temperature, 1)} unit='°C' tone={f.temperature >= 60 ? 'warning' : undefined} />,
    f.frequency != null && <Tile key='hz' icon={<Waves size={15} />} label={t('solar.inverterCard.frequency')} value={formatFixed(f.frequency, 2)} unit='Hz' tone={Math.abs(f.frequency - 50) > 0.2 && Math.abs(f.frequency - 60) > 0.2 ? 'warning' : undefined} />,
    f.acVoltage != null && <Tile key='v' icon={<Gauge size={15} />} label={t('solar.inverterCard.acVoltage')} value={formatFixed(f.acVoltage, 0)} unit='V' />,
  ].filter(Boolean)

  return (
    <Card className='overflow-hidden p-0'>
      <div className='px-4 pt-4'>
        {/* The card shows the state itself (below), so the header doesn't repeat it. */}
        <DeviceHeader d={d} title={title} icon={<Cpu size={16} />} showStatus={false} />
      </div>
      {!d.latest ? (
        <p className='px-4 py-6 text-[12.5px] text-muted'>{t('solar.empty.noRecent')}</p>
      ) : (
        <>
          <div className={cn('grid items-center gap-5 px-4 py-5 sm:grid-cols-[auto_minmax(0,1fr)]', stale && 'opacity-75')}>
            <PowerRing output={f.output} load={f.load} state={f.state} />
            <div className='flex min-w-0 flex-col gap-3'>
              <div className='flex flex-wrap items-center gap-2'>
                <StatusBadge tone={STATE[f.state].tone} dot={f.state !== 'standby'} pulse={f.state === 'producing' && !stale}>
                  {STATE[f.state].icon}
                  {t(`solar.inverterCard.${f.state}`)}
                  {/* The inverter's own status text, when it says more than the state. */}
                  {d.latest?.status && d.latest.status.toLowerCase() !== t(`solar.inverterCard.${f.state}`).toLowerCase() && <span className='font-normal opacity-80'>· {d.latest.status}</span>}
                </StatusBadge>
                {f.load != null && f.rated != null && (
                  <span className='text-[12.5px] text-fg-2'>
                    {t('solar.inverterCard.ofRated', { pct: formatFixed(f.load * 100, 0), rated: powerText(f.rated) })}
                  </span>
                )}
              </div>
              <FlowStrip pvInput={f.pvInput} output={f.output} acVoltage={f.acVoltage} frequency={f.frequency} active={f.state === 'producing' && !stale} />
            </div>
          </div>

          {tiles.length > 0 && <div className={cn('grid grid-cols-2 gap-px border-t border-line bg-line', tiles.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2', tiles.length % 2 === 1 && '[&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1')}>{tiles}</div>}

          {f.strings.length > 0 && (
            <div className='border-t border-line px-4 py-3'>
              <p className='mb-2 text-[12px] font-medium text-fg-2'>{t('solar.inverterCard.strings')}</p>
              <div className='grid gap-2 sm:grid-cols-2'>
                {f.strings.map((s) => (
                  <div key={s.id} className='flex items-center justify-between gap-3 rounded-lg bg-panel-2 px-3 py-2 text-[12px]'>
                    <span className='font-medium text-fg'>{t('solar.inverterCard.string', { n: s.id })}</span>
                    <span className='tabular text-fg-2'>
                      {[s.power != null && powerText(s.power), s.voltage != null && `${formatFixed(s.voltage, 0)} V`, s.current != null && `${formatFixed(s.current, 1)} A`].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(others).length > 0 && (
            <details className='border-t border-line px-4 py-3'>
              <summary className='cursor-pointer text-[12.5px] font-medium text-fg-2 hover:text-fg'>{t('solar.inverterCard.allValues')}</summary>
              <div className='mt-3'>
                <MetricList metrics={others} unitOf={unitOf} kind='INVERTER' />
              </div>
            </details>
          )}
        </>
      )}
    </Card>
  )
}
