import { translate as t } from '../../i18n'
import { ArrowRight, House, Info, SolarPanel } from 'lucide-react'
import { KeyboardEvent, memo, ReactNode, useId } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BatteryGlyph, Card, cn, HouseIllustration, Popover, PylonIcon, StatusBadge } from '../../design'
import { useReducedMotion } from '../../lib/hooks/useReducedMotion'
import type { EnergyFlowState, FlowNode, LiveStatus } from '../solar/flowState'
import { liveText, summaryText } from '../solar/flowText'
import { SOLARBMS_SEMANTICS } from '../solar/semantics'
import { power, powerText } from './format'

const IDLE_W = SOLARBMS_SEMANTICS.idleW

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
  /** Moving dashes and particle; off when not live or with reduced motion (the arrowhead stays). */
  animate: boolean
}

/** Rail + animated dashes + travelling particle + arrowhead; speed scales with power. Unknown power (null) draws an idle rail. */
function FlowLine({ d, color, watts: w, reverse, dashed, title, markerId, animate }: Omit<FlowLineProps, 'watts'> & { watts: number | null }) {
  const watts = w ?? 0
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
        className={cn(active && animate && dashed && 'flow-line', active && animate && dashed && reverse && 'reverse')}
        markerEnd={active && !reverse ? `url(#${markerId})` : undefined}
        markerStart={active && reverse ? `url(#${markerId})` : undefined}
      />
      {active && animate && (
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

/** Grid / battery state word for the node label, in the current language. */
const GRID_WORD = { import: 'importing', export: 'exporting', idle: 'idle', unknown: 'unknown' } as const
const gridWord = (f: EnergyFlowState) => t(`flow.states.${GRID_WORD[f.grid.direction]}`)
const batteryWord = (f: EnergyFlowState) => t(`flow.states.${f.battery.state}`)
const showWord = (state: string) => state !== 'idle'

/** Path geometry (HomeOS layout): solar & grid on the left, house as the hub, home on the right, battery below. */
const PATHS = {
  solar: 'M124 42 H158 Q170 42 170 54 V70 Q170 80 182 80 H222',
  grid: 'M124 122 H156 Q168 122 168 112 V108 Q168 98 180 98 H222',
  home: 'M434 88 H446 Q456 88 456 78 V66 Q456 56 466 56 H494',
  battery: 'M330 136 V160',
}

function describe(f: EnergyFlowState) {
  return t('flow.describe', {
    pv: powerText(f.solar.power),
    load: powerText(f.load.power),
    grid: `${powerText(f.grid.magnitude)} ${gridWord(f)}`,
    battery: `${f.battery.soc != null ? Math.round(f.battery.soc) + '% ' : ''}${batteryWord(f)} ${powerText(f.battery.magnitude)}`,
  })
}

export const FlowDiagram = memo(function FlowDiagram({ flow, animate, className }: { flow: EnergyFlowState; animate: boolean; className?: string }) {
  const uid = useId().replace(/:/g, '')
  const m = (k: string) => `${uid}-${k}`
  const batteryW = flow.battery.magnitude
  const gridW = flow.grid.magnitude
  const load = flow.load.power
  return (
    <svg viewBox='0 0 580 212' className={cn('h-auto w-full', className)} role='img' aria-label={describe(flow)}>
      <defs>
        <Marker id={m('s')} color={COLORS.solar} />
        <Marker id={m('g')} color={COLORS.grid} />
        <Marker id={m('h')} color={COLORS.home} />
        <Marker id={m('b')} color={COLORS.battery} />
      </defs>

      <SolarPanel x={26} y={22} width={40} height={40} strokeWidth={1.4} className='text-solar' />
      <NodeLabel x={78} y={36} label={t('flow.solar')} w={flow.solar.power} />
      <FlowLine d={PATHS.solar} color={COLORS.solar} watts={flow.solar.power} animate={animate} title={`${t('flow.solar')} ${powerText(flow.solar.power)}`} markerId={m('s')} />

      <PylonIcon x={26} y={100} width={40} height={40} strokeWidth={1.3} className='text-fg-2' />
      <NodeLabel x={78} y={116} label={t('flow.grid')} w={gridW} state={showWord(flow.grid.direction) ? gridWord(flow) : undefined} />
      <FlowLine d={PATHS.grid} color={COLORS.grid} watts={gridW} animate={animate} reverse={flow.grid.direction === 'export'} title={`${t('flow.grid')} ${gridWord(flow)} ${powerText(gridW)}`} markerId={m('g')} />

      <svg x={222} y={-2} width={214} height={152} viewBox='0 0 240 170'>
        <HouseIllustration lit={(load ?? 0) > IDLE_W} />
      </svg>

      <FlowLine d={PATHS.home} color={COLORS.home} watts={load} animate={animate} dashed title={`${t('flow.homeConsumption')} ${powerText(load)}`} markerId={m('h')} />
      <House x={494} y={26} width={36} height={36} strokeWidth={1.5} className='text-home' />
      <NodeLabel x={512} y={86} anchor='middle' label={t('flow.home')} w={load} />

      <FlowLine d={PATHS.battery} color={COLORS.battery} watts={batteryW} animate={animate} reverse={flow.battery.state === 'discharging'} title={`${t('flow.battery')} ${batteryWord(flow)} ${powerText(batteryW)}`} markerId={m('b')} />
      <svg x={270} y={160} width={26} height={42} viewBox='0 0 22 36'>
        <BatteryGlyph level={flow.battery.soc ?? 0} charging={flow.battery.state === 'charging'} />
      </svg>
      <NodeLabel x={306} y={176} label={t('flow.battery')} percent={flow.battery.soc} state={showWord(flow.battery.state) ? batteryWord(flow) : undefined} extra={(batteryW ?? 0) > IDLE_W ? `(${powerText(batteryW)})` : undefined} />
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
export const FlowDiagramCompact = memo(function FlowDiagramCompact({ flow, animate, className }: { flow: EnergyFlowState; animate: boolean; className?: string }) {
  const uid = useId().replace(/:/g, '')
  const m = (k: string) => `${uid}-${k}`
  const batteryW = flow.battery.magnitude
  const gridW = flow.grid.magnitude
  const load = flow.load.power
  return (
    <svg viewBox='0 0 340 222' className={cn('h-auto w-full', className)} role='img' aria-label={describe(flow)}>
      <defs>
        <Marker id={m('s')} color={COLORS.solar} />
        <Marker id={m('g')} color={COLORS.grid} />
        <Marker id={m('h')} color={COLORS.home} />
        <Marker id={m('b')} color={COLORS.battery} />
      </defs>
      <svg x={98} y={40} width={144} height={102} viewBox='0 0 240 170'>
        <HouseIllustration lit={(load ?? 0) > IDLE_W} />
      </svg>
      <FlowLine d={COMPACT.solar} color={COLORS.solar} watts={flow.solar.power} animate={animate} title={`${t('flow.solar')} ${powerText(flow.solar.power)}`} markerId={m('s')} />
      <FlowLine d={COMPACT.grid} color={COLORS.grid} watts={gridW} animate={animate} reverse={flow.grid.direction === 'export'} title={`${t('flow.grid')} ${gridWord(flow)}`} markerId={m('g')} />
      <FlowLine d={COMPACT.home} color={COLORS.home} watts={load} animate={animate} dashed title={t('flow.homeConsumption')} markerId={m('h')} />
      <FlowLine d={COMPACT.battery} color={COLORS.battery} watts={batteryW} animate={animate} reverse={flow.battery.state === 'discharging'} title={`${t('flow.battery')} ${batteryWord(flow)}`} markerId={m('b')} />

      <SolarPanel x={12} y={10} width={34} height={34} strokeWidth={1.4} className='text-solar' />
      <NodeLabel x={54} y={22} label={t('flow.solar')} w={flow.solar.power} />
      <PylonIcon x={12} y={178} width={34} height={34} strokeWidth={1.3} className='text-fg-2' />
      <NodeLabel x={54} y={192} label={t('flow.grid')} w={gridW} state={showWord(flow.grid.direction) ? gridWord(flow) : undefined} />
      <House x={294} y={12} width={34} height={34} strokeWidth={1.5} className='text-home' />
      <NodeLabel x={284} y={22} anchor='end' label={t('flow.home')} w={load} />
      <NodeLabel x={292} y={192} anchor='end' label={t('flow.battery')} percent={flow.battery.soc} state={showWord(flow.battery.state) ? batteryWord(flow) : undefined} />
      <svg x={300} y={170} width={24} height={40} viewBox='0 0 22 36'>
        <BatteryGlyph level={flow.battery.soc ?? 0} charging={flow.battery.state === 'charging'} />
      </svg>
    </svg>
  )
})

const DOT: Record<FlowNode, string> = { solar: 'bg-solar', grid: 'bg-gridp', battery: 'bg-batt', home: 'bg-home' }

/** Source → destination flows the measurements determine (never a guessed split). */
export function FlowBreakdown({ flow, className, title = t('flow.liveFlows') }: { flow: EnergyFlowState; className?: string; title?: string }) {
  const unavailable = flow.summary.kind === 'unavailable'
  return (
    <div className={cn('flex flex-col', className)} data-testid='flow-breakdown'>
      <h3 className='mb-2.5 text-center text-[11.5px] font-medium text-fg-2'>{title}</h3>
      {flow.flows.length === 0 ? (
        <p className='rounded-lg border border-line bg-panel-2 px-3 py-4 text-center text-[11.5px] leading-relaxed text-muted'>{unavailable ? summaryText(flow)[0] : flow.splitKnown ? t('flow.noFlow') : t('flow.splitUnknown')}</p>
      ) : (
        <>
          <ul className='divide-y divide-line rounded-lg border border-line bg-panel-2'>
            {flow.flows.map((r) => (
              <li key={`${r.from}-${r.to}`} className='flex items-center gap-2 px-2.5 py-[9px]' data-testid={`flow-${r.from}-${r.to}`}>
                <span className={cn('h-2 w-2 shrink-0 rounded-full', DOT[r.from])} />
                <span className='flex-1 truncate text-[11px] text-fg-2'>
                  {t(`flow.${r.from}`)} <span className='text-subtle'>→</span> {t(`flow.${r.to}`)}
                </span>
                <span className='tabular text-[11px] font-medium text-fg'>{powerText(r.watts)}</span>
              </li>
            ))}
          </ul>
          {!flow.splitKnown && <p className='mt-2 text-center text-[11px] leading-relaxed text-muted'>{t('flow.splitUnknown')}</p>}
        </>
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

/**
 * Compact Energy Flow on the Solar dashboard. With `to` the whole card opens
 * the Energy Flow page (a link covering the card; Enter and Space work).
 */
export function EnergyFlowCard({ flow, status, to, linkState, className, footer, noDataHint }: { flow: EnergyFlowState; status: LiveStatus; to?: string; linkState?: unknown; className?: string; footer?: ReactNode; noDataHint?: ReactNode }) {
  const navigate = useNavigate()
  const reduced = useReducedMotion()
  const animate = status.state === 'live' && !reduced
  const live = liveText(status)
  const descId = useId()
  const onKey = (e: KeyboardEvent) => {
    if (to && e.key === ' ') {
      e.preventDefault()
      navigate(to, { state: linkState })
    }
  }
  return (
    <Card
      className={cn('group relative flex min-w-0 flex-col px-4 pb-3 pt-3.5 xl:px-5', to && 'transition-[border-color,box-shadow,background-color] duration-200 hover:border-line-strong hover:shadow-pop has-[a:focus-visible]:border-accent/60', className)}
      aria-labelledby='energy-flow-title'
      data-testid='energy-flow-card'
    >
      {to && (
        <Link
          to={to}
          state={linkState}
          onKeyDown={onKey}
          aria-label={t('flow.openDetails')}
          aria-describedby={descId}
          data-testid='energy-flow-open'
          className='absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50'
        />
      )}
      <div className={cn('relative z-[1] flex flex-1 flex-col', to && 'pointer-events-none')}>
        <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
          <h2 id='energy-flow-title' className='text-[15px] font-semibold tracking-[-0.01em] text-fg'>
            {t('flow.title')}
          </h2>
          <Popover
            role='dialog'
            label={t('flow.about')}
            align='left'
            trigger={({ toggle, ref, ...aria }) => (
              <button ref={ref} type='button' onClick={toggle} aria-label={t('flow.about')} {...aria} className='pointer-events-auto rounded-full text-muted transition-colors hover:text-fg'>
                <Info size={14} />
              </button>
            )}
          >
            {() => <FlowInfo />}
          </Popover>
          <span className='ml-auto flex items-center gap-2' data-testid='energy-flow-status'>
            <span className='hidden text-[11.5px] text-muted sm:inline' data-testid='energy-flow-freshness'>
              {live.detail}
            </span>
            <StatusBadge tone={live.tone} dot pulse={live.pulse && !reduced}>
              {live.label}
            </StatusBadge>
            {to && (
              <span className='hidden items-center gap-1 text-[11.5px] font-medium text-accent-ink opacity-70 transition-opacity group-hover:opacity-100 md:inline-flex' aria-hidden>
                {t('flow.viewDetails')} <ArrowRight size={12} className='transition-transform group-hover:translate-x-0.5' />
              </span>
            )}
          </span>
        </div>

        <div className={cn('flex flex-1 flex-col items-center gap-4 pt-1 sm:flex-row sm:items-center sm:gap-3', status.state !== 'live' && 'opacity-80')}>
          <FlowDiagram flow={flow} animate={animate} className='mx-auto hidden min-w-0 max-w-[620px] flex-1 sm:block' />
          <FlowDiagramCompact flow={flow} animate={animate} className='sm:hidden' />
          <FlowBreakdown flow={flow} className='w-full shrink-0 sm:w-[168px]' />
        </div>
        {(status.state === 'waiting' || (flow.summary.kind === 'unavailable' && flow.summary.reason === 'noData')) && (
          <p className='mt-2 rounded-lg border border-gridp/25 bg-gridp/5 px-3 py-2 text-center text-[12px] text-fg-2'>{noDataHint ?? t('flow.waiting')}</p>
        )}
        <p id={descId} className='sr-only'>
          {summaryText(flow).join(' ')} {live.label}. {live.detail}.
        </p>
        {footer}
      </div>
    </Card>
  )
}
