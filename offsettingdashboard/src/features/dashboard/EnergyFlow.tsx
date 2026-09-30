import { translate as t } from '../../i18n'
import { House, Info, SolarPanel } from 'lucide-react'
import { memo, ReactNode, useId } from 'react'
import { BatteryGlyph, Card, cn, ErrorState, HouseIllustration, Popover, PylonIcon, StatusBadge } from '../../design'
import { FlowState, IDLE_W, idleFlow, LiveStatus } from '../../services/energyFlow'
import { power, powerText } from './format'

const COLORS = { solar: 'rgb(var(--c-solar))', grid: 'rgb(var(--c-gridp))', home: 'rgb(var(--c-home))', battery: 'rgb(var(--c-batt))' }

interface FlowLineProps {
  d: string
  color: string
  /** Watts moving along this path; ≤ IDLE_W draws the path as idle. */
  watts: number
  /** Direction opposite to the path's drawing direction. */
  reverse?: boolean
  dashed?: boolean
  title: string
  markerId: string
}

/** Rail + animated dashes + travelling particle + arrowhead; speed scales with power. */
function FlowLine({ d, color, watts, reverse, dashed, title, markerId }: FlowLineProps) {
  const active = watts > IDLE_W
  const dur = Math.max(0.9, 2.6 - (watts / 1000) * 0.35)
  return (
    <g opacity={active ? 1 : 0.22}>
      <title>{title}</title>
      <path d={d} fill='none' stroke={color} strokeOpacity={0.18} strokeWidth={4} strokeLinecap='round' />
      <path
        d={d}
        fill='none'
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeDasharray={!active ? '2 5' : undefined}
        className={cn(active && dashed && 'flow-line', active && dashed && reverse && 'reverse')}
        markerEnd={active && !reverse ? `url(#${markerId})` : undefined}
        markerStart={active && reverse ? `url(#${markerId})` : undefined}
      />
      {active && (
        <circle r={2.6} fill='#fff' opacity={0.95}>
          <animateMotion dur={`${dur}s`} repeatCount='indefinite' path={d} keyPoints={reverse ? '1;0' : '0;1'} keyTimes='0;1' calcMode='linear' />
        </circle>
      )}
    </g>
  )
}

function Marker({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} viewBox='0 0 10 10' refX='6.5' refY='5' markerWidth='5.5' markerHeight='5.5' orient='auto-start-reverse'>
      <path d='M1 1.2 8.2 5 1 8.8z' fill={color} stroke={color} strokeWidth='1' strokeLinejoin='round' />
    </marker>
  )
}

function NodeLabel({ x, y, label, w, extra, state, anchor = 'start', percent }: { x: number; y: number; label: string; w?: number | null; percent?: number | null; extra?: string; state?: string; anchor?: 'start' | 'middle' | 'end' }) {
  const p = power(w)
  const value = percent != null ? String(Math.round(percent)) : p.value
  const unit = percent != null ? '%' : p.unit
  return (
    <g>
      <text x={x} y={y} textAnchor={anchor} className='fill-fg-2' fontSize='11.5' fontWeight={500}>
        {label}
        {state && (
          <tspan fontSize='10.5' fontWeight={500} className='fill-muted' dx='5'>
            {state}
          </tspan>
        )}
      </text>
      <text x={x} y={y + 20} textAnchor={anchor} className='fill-fg' fontSize='15.5' fontWeight={600}>
        {value}
        <tspan fontSize='11' fontWeight={500} className='fill-fg-2' dx={unit === '%' ? 1 : 3}>
          {unit}
        </tspan>
        {extra && (
          <tspan fontSize='10.5' fontWeight={400} className='fill-muted' dx='5'>
            {extra}
          </tspan>
        )}
      </text>
    </g>
  )
}

/** All-zero state so the diagram (house, nodes, rails) is always visible. */
const IDLE_FLOW = idleFlow()

/** `importing` / `charging` / `idle` … in the current language. */
const cap = (s: string) => t(`flow.states.${s as 'idle'}`)

/** Path geometry (HomeOS layout): solar & grid on the left, house as the hub, home on the right, battery below. */
const PATHS = {
  solar: 'M124 42 H158 Q170 42 170 54 V70 Q170 80 182 80 H222',
  grid: 'M124 122 H156 Q168 122 168 112 V108 Q168 98 180 98 H222',
  home: 'M434 88 H446 Q456 88 456 78 V66 Q456 56 466 56 H494',
  battery: 'M330 136 V160',
}

function describe(f: FlowState) {
  return t('flow.describe', { pv: powerText(f.pv), load: powerText(f.load), grid: `${powerText(f.grid)} ${cap(f.grid_state)}`, battery: `${f.soc != null ? Math.round(f.soc) + '% ' : ''}${cap(f.battery_state)} ${powerText(f.battery)}` })
}

export const FlowDiagram = memo(function FlowDiagram({ flow, className }: { flow: FlowState; className?: string }) {
  const uid = useId().replace(/:/g, '')
  const m = (k: string) => `${uid}-${k}`
  const batteryW = Math.abs(flow.battery)
  const gridW = Math.abs(flow.grid)
  return (
    <svg viewBox='0 0 580 212' className={cn('h-auto w-full', className)} role='img' aria-label={describe(flow)}>
      <defs>
        <Marker id={m('s')} color={COLORS.solar} />
        <Marker id={m('g')} color={COLORS.grid} />
        <Marker id={m('h')} color={COLORS.home} />
        <Marker id={m('b')} color={COLORS.battery} />
      </defs>

      <SolarPanel x={26} y={22} width={40} height={40} strokeWidth={1.4} className='text-solar' />
      <NodeLabel x={78} y={36} label={t('flow.solar')} w={flow.pv} />
      <FlowLine d={PATHS.solar} color={COLORS.solar} watts={flow.pv} title={`${t('flow.solar')} ${powerText(flow.pv)}`} markerId={m('s')} />

      <PylonIcon x={26} y={100} width={40} height={40} strokeWidth={1.3} className='text-fg-2' />
      <NodeLabel x={78} y={116} label={t('flow.grid')} w={gridW} state={flow.grid_state !== 'idle' ? cap(flow.grid_state) : undefined} />
      <FlowLine d={PATHS.grid} color={COLORS.grid} watts={gridW} reverse={flow.grid_state === 'exporting'} title={`${t('flow.grid')} ${cap(flow.grid_state)} ${powerText(gridW)}`} markerId={m('g')} />

      <svg x={222} y={-2} width={214} height={152} viewBox='0 0 240 170'>
        <HouseIllustration lit={flow.load > IDLE_W} />
      </svg>

      <FlowLine d={PATHS.home} color={COLORS.home} watts={flow.load} dashed title={`${t('flow.homeConsumption')} ${powerText(flow.load)}`} markerId={m('h')} />
      <House x={494} y={26} width={36} height={36} strokeWidth={1.5} className='text-home' />
      <NodeLabel x={512} y={86} anchor='middle' label={t('flow.home')} w={flow.load} />

      <FlowLine d={PATHS.battery} color={COLORS.battery} watts={batteryW} reverse={flow.battery_state === 'discharging'} title={`${t('flow.battery')} ${cap(flow.battery_state)} ${powerText(batteryW)}`} markerId={m('b')} />
      <svg x={270} y={160} width={26} height={42} viewBox='0 0 22 36'>
        <BatteryGlyph level={flow.soc ?? 0} charging={flow.battery_state === 'charging'} />
      </svg>
      <NodeLabel x={306} y={176} label={t('flow.battery')} percent={flow.soc} state={flow.battery_state !== 'idle' ? cap(flow.battery_state) : undefined} extra={batteryW > IDLE_W ? `(${powerText(batteryW)})` : undefined} />
    </svg>
  )
})

const COMPACT = {
  solar: 'M29 52 V80 Q29 92 41 92 H106',
  grid: 'M29 176 V142 Q29 130 41 130 H106',
  home: 'M234 92 H299 Q311 92 311 80 V56',
  battery: 'M234 130 H299 Q311 130 311 142 V166',
}

/** Portrait layout for phones: nodes in the corners, house in the middle. */
export const FlowDiagramCompact = memo(function FlowDiagramCompact({ flow, className }: { flow: FlowState; className?: string }) {
  const uid = useId().replace(/:/g, '')
  const m = (k: string) => `${uid}-${k}`
  const batteryW = Math.abs(flow.battery)
  const gridW = Math.abs(flow.grid)
  return (
    <svg viewBox='0 0 340 222' className={cn('h-auto w-full', className)} role='img' aria-label={describe(flow)}>
      <defs>
        <Marker id={m('s')} color={COLORS.solar} />
        <Marker id={m('g')} color={COLORS.grid} />
        <Marker id={m('h')} color={COLORS.home} />
        <Marker id={m('b')} color={COLORS.battery} />
      </defs>
      <svg x={98} y={40} width={144} height={102} viewBox='0 0 240 170'>
        <HouseIllustration lit={flow.load > IDLE_W} />
      </svg>
      <FlowLine d={COMPACT.solar} color={COLORS.solar} watts={flow.pv} title={`${t('flow.solar')} ${powerText(flow.pv)}`} markerId={m('s')} />
      <FlowLine d={COMPACT.grid} color={COLORS.grid} watts={gridW} reverse={flow.grid_state === 'exporting'} title={`${t('flow.grid')} ${cap(flow.grid_state)}`} markerId={m('g')} />
      <FlowLine d={COMPACT.home} color={COLORS.home} watts={flow.load} dashed title={t('flow.homeConsumption')} markerId={m('h')} />
      <FlowLine d={COMPACT.battery} color={COLORS.battery} watts={batteryW} reverse={flow.battery_state === 'discharging'} title={`${t('flow.battery')} ${cap(flow.battery_state)}`} markerId={m('b')} />

      <SolarPanel x={12} y={10} width={34} height={34} strokeWidth={1.4} className='text-solar' />
      <NodeLabel x={54} y={22} label={t('flow.solar')} w={flow.pv} />
      <PylonIcon x={12} y={178} width={34} height={34} strokeWidth={1.3} className='text-fg-2' />
      <NodeLabel x={54} y={192} label={t('flow.grid')} w={gridW} state={flow.grid_state !== 'idle' ? cap(flow.grid_state) : undefined} />
      <House x={294} y={12} width={34} height={34} strokeWidth={1.5} className='text-home' />
      <NodeLabel x={284} y={22} anchor='end' label={t('flow.home')} w={flow.load} />
      <NodeLabel x={292} y={192} anchor='end' label={t('flow.battery')} percent={flow.soc} state={flow.battery_state !== 'idle' ? cap(flow.battery_state) : undefined} />
      <svg x={300} y={170} width={24} height={40} viewBox='0 0 22 36'>
        <BatteryGlyph level={flow.soc ?? 0} charging={flow.battery_state === 'charging'} />
      </svg>
    </svg>
  )
})

type Node = 'solar' | 'home' | 'battery' | 'grid'
const FLOW_ROWS: { key: keyof FlowState['flows']; from: Node; to: Node; dot: string }[] = [
  { key: 'solarToHome', from: 'solar', to: 'home', dot: 'bg-solar' },
  { key: 'solarToBattery', from: 'solar', to: 'battery', dot: 'bg-solar' },
  { key: 'solarToGrid', from: 'solar', to: 'grid', dot: 'bg-solar' },
  { key: 'gridToHome', from: 'grid', to: 'home', dot: 'bg-gridp' },
  { key: 'gridToBattery', from: 'grid', to: 'battery', dot: 'bg-gridp' },
  { key: 'batteryToHome', from: 'battery', to: 'home', dot: 'bg-batt' },
  { key: 'batteryToGrid', from: 'battery', to: 'grid', dot: 'bg-batt' },
]

/** Active source → destination flows, derived from the measured powers. */
export function FlowBreakdown({ flow, className }: { flow: FlowState; className?: string }) {
  const rows = FLOW_ROWS.filter((r) => flow.flows[r.key] > IDLE_W)
  return (
    <div className={cn('flex flex-col', className)}>
      <h3 className='mb-2.5 text-center text-[11.5px] font-medium text-fg-2'>{t('flow.liveFlows')}</h3>
      {rows.length === 0 ? (
        <p className='rounded-lg border border-line bg-panel-2 px-3 py-4 text-center text-[11.5px] leading-relaxed text-muted'>{t('flow.noFlow')}</p>
      ) : (
        <ul className='divide-y divide-line rounded-lg border border-line bg-panel-2'>
          {rows.map((r) => (
            <li key={r.key} className='flex items-center gap-2 px-2.5 py-[9px]'>
              <span className={cn('h-2 w-2 shrink-0 rounded-full', r.dot)} />
              <span className='flex-1 truncate text-[11px] text-fg-2'>
                {t(`flow.${r.from}`)} <span className='text-subtle'>→</span> {t(`flow.${r.to}`)}
              </span>
              <span className='tabular text-[11px] font-medium text-fg'>{powerText(flow.flows[r.key])}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FlowInfo() {
  return (
    <div className='w-72 p-2.5 text-[12px] leading-relaxed text-muted'>
      <p>{t('flow.info1')}</p>
      <p className='mt-2'>{t('flow.info2')}</p>
    </div>
  )
}

export function EnergyFlowCard({ flow, status, error, onRetry, className, footer, noDataHint }: { flow: FlowState | null; status: LiveStatus; error?: string | null; onRetry: () => void; className?: string; footer?: ReactNode; noDataHint?: ReactNode }) {
  return (
    <Card className={cn('flex min-w-0 flex-col px-4 pb-3 pt-3.5 xl:px-5', className)} aria-labelledby='energy-flow-title'>
      <div className='flex items-center gap-2'>
        <h2 id='energy-flow-title' className='text-[15px] font-semibold tracking-[-0.01em] text-fg'>
          {t('flow.title')}
        </h2>
        <Popover
          role='dialog'
          label={t('flow.about')}
          align='left'
          trigger={({ toggle, ref, ...aria }) => (
            <button ref={ref} type='button' onClick={toggle} aria-label={t('flow.about')} {...aria} className='rounded-full text-muted transition-colors hover:text-fg'>
              <Info size={14} />
            </button>
          )}
        >
          {() => <FlowInfo />}
        </Popover>
        <span className='ml-auto'>
          {status === 'live' && (
            <StatusBadge tone='good' dot pulse>
              {t('shell.live')}
            </StatusBadge>
          )}
          {status === 'no-data' && <StatusBadge tone='warning'>{t('shell.noRecentData')}</StatusBadge>}
        </span>
      </div>

      {(
        <>
          <div className={cn('flex flex-1 flex-col items-center gap-4 pt-1 sm:flex-row sm:items-center sm:gap-3', !flow && 'opacity-80')}>
            <FlowDiagram flow={flow ?? IDLE_FLOW} className='mx-auto hidden min-w-0 max-w-[620px] flex-1 sm:block' />
            <FlowDiagramCompact flow={flow ?? IDLE_FLOW} className='sm:hidden' />
            <FlowBreakdown flow={flow ?? IDLE_FLOW} className='w-full shrink-0 sm:w-[168px]' />
          </div>
          {status === 'no-data' && (
            <p className='mt-2 rounded-lg border border-gridp/25 bg-gridp/5 px-3 py-2 text-center text-[12px] text-fg-2'>
              {noDataHint ?? t('flow.waiting')}
            </p>
          )}
          {status === 'error' && <ErrorState className='mt-2' offline title={t('flow.unavailable')} description={error ? t('flow.unavailableDetail', { error }) : t('flow.unavailableHint')} onRetry={onRetry} />}
        </>
      )}
      {footer}
    </Card>
  )
}
