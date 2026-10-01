import { ArrowDownLeft, ArrowLeft, ArrowUpRight, BatteryCharging, Home, Info, Minus, PlugZap, Radio, Sun } from 'lucide-react'
import { ReactNode, useEffect, useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, cn, ErrorState, PageSkeleton, StatusBadge } from '../../design'
import { formatDate, translate as t } from '../../i18n'
import { useShell } from '../../layout/ShellContext'
import { useReducedMotion } from '../../lib/hooks/useReducedMotion'
import { FlowBreakdown, FlowDiagram, FlowDiagramCompact } from '../dashboard/EnergyFlow'
import { powerText } from '../dashboard/format'
import { useGetSitesQuery, useGetSolarOverviewQuery } from './api'
import { energyFlowState, EnergyFlowState, LiveStatus } from './flowState'
import { agoText, batteryLabel, gridLabel, liveText, signedPower, summaryText } from './flowText'
import { liveInterval, useLive, useLiveDevices, useLiveStatus, withLive } from './live'
import { buildSite, headline, statusTone } from './model'

const POLL_MS = 15_000

/**
 * Energy Flow page: /ds/solar/:siteId/energy-flow (admin: /admin/dashboard/:siteId/energy-flow).
 * Same live readings and the same semantic state as the dashboard card.
 */
export default function EnergyFlowPage({ basePath = '/ds/solar' }: { basePath?: string }) {
  const { siteId = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const dashboard = `${basePath}/${siteId}`
  // Came from the dashboard: go back in history (keeps its state); opened directly: go to it.
  const back = () => ((location.state as { from?: string } | null)?.from ? navigate(-1) : navigate(dashboard))

  const overview = useGetSolarOverviewQuery(siteId, { pollingInterval: POLL_MS, skip: !siteId })
  const sites = useGetSitesQuery()
  const liveDevices = useLiveDevices(siteId)
  const polled = overview.data?.data
  const o = useMemo(() => polled && withLive(polled, liveDevices), [polled, liveDevices])
  const summary = sites.data?.data.find((s) => s.id === siteId)
  const names = useMemo(() => Object.fromEntries((summary?.installations ?? []).map((i) => [i.id, i.name])), [summary])
  const site = useMemo(() => buildSite(o, names), [o, names])
  const h = headline(site)
  const flow = useMemo(() => energyFlowState(h), [h.pv, h.load, h.grid, h.battery, h.soc]) // eslint-disable-line react-hooks/exhaustive-deps
  const readingAt = o?.updatedAt ? Date.parse(o.updatedAt) : null
  const status = useLiveStatus(siteId, readingAt)

  // Header Live pill, like the dashboard.
  const { setLive } = useShell()
  useEffect(() => {
    if (overview.isError) setLive('error', null)
    else if (o) setLive(status.state === 'live' ? 'live' : 'no-data', readingAt)
  }, [o, overview.isError, status.state, readingAt, setLive])
  useEffect(() => () => setLive(null, null), [setLive])

  const header = (
    <div>
      <Button variant='ghost' size='sm' onClick={back} data-testid='energy-flow-back'>
        <ArrowLeft size={14} /> {t('flow.page.back')}
      </Button>
    </div>
  )
  if (overview.isLoading) return <PageSkeleton />
  // A failed refresh keeps the last data (shown as offline); the error page is only for no data at all.
  if (!o)
    return (
      <div className='flex flex-col gap-4 pb-4'>
        {header}
        <ErrorState title={(overview.error as { status?: number })?.status === 404 ? t('flow.page.notFound') : t('flow.unavailable')} onRetry={overview.refetch} />
      </div>
    )

  const systemStatus = site.systems.find((d) => d.latest?.status)?.latest?.status
  return (
    <div className='flex min-w-0 flex-col gap-4 pb-4' data-testid='energy-flow-page'>
      {header}
      <PageHead siteName={o.site.name} status={status} systemStatus={systemStatus} />
      <FlowPanel flow={flow} status={status} />
      <ValueCards flow={flow} />
      <div className='grid gap-3 lg:grid-cols-3'>
        <Card className='p-4'>
          <FlowBreakdown flow={flow} title={t('flow.page.flows')} />
        </Card>
        <SolarSplit flow={flow} />
        <ConnectionCard siteId={siteId} status={status} readingAt={readingAt} />
      </div>
      {!flow.signsConfirmed && (
        <p className='flex items-start gap-2 rounded-lg border border-line bg-panel-2 px-3.5 py-2.5 text-[12px] leading-relaxed text-fg-2' data-testid='energy-flow-assumptions'>
          <Info size={14} className='mt-0.5 shrink-0 text-muted' />
          <span>
            <span className='font-medium text-fg'>{t('flow.page.assumptions')}: </span>
            {t('flow.page.signsUnconfirmed')}
          </span>
        </p>
      )}
    </div>
  )
}

function PageHead({ siteName, status, systemStatus }: { siteName: string; status: LiveStatus; systemStatus?: string }) {
  const live = liveText(status)
  const reduced = useReducedMotion()
  return (
    <Card className='flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5'>
      <div className='min-w-0'>
        <p className='truncate text-[12.5px] text-muted' data-testid='energy-flow-site'>
          {siteName}
        </p>
        <h2 className='text-[20px] font-semibold tracking-[-0.01em] text-fg' data-testid='energy-flow-title'>
          {t('flow.page.title')}
        </h2>
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        {systemStatus && (
          <StatusBadge tone={statusTone(systemStatus)}>
            {t('flow.page.systemStatus')}: {systemStatus}
          </StatusBadge>
        )}
        <StatusBadge tone={live.tone} dot pulse={live.pulse && !reduced}>
          <span data-testid='energy-flow-live'>{live.label}</span>
        </StatusBadge>
        <span className='text-[12px] text-muted' data-testid='energy-flow-freshness'>
          {live.detail}
        </span>
      </div>
    </Card>
  )
}

function FlowPanel({ flow, status }: { flow: EnergyFlowState; status: LiveStatus }) {
  const reduced = useReducedMotion()
  const animate = status.state === 'live' && !reduced
  const sentences = summaryText(flow)
  return (
    <Card className='p-4 sm:p-5'>
      <div className='rounded-lg border border-line bg-panel-2 px-3.5 py-3' data-testid='energy-flow-summary' aria-live='polite'>
        <h2 className='text-[12px] font-medium text-muted'>{t('flow.summary.title')}</h2>
        <p className='mt-1 text-[14px] leading-relaxed text-fg'>{sentences.join(' ')}</p>
        {status.state !== 'live' && flow.summary.kind !== 'unavailable' && <p className='mt-1 text-[12px] text-muted'>{t('flow.summary.lastKnown')}</p>}
      </div>
      <div className={cn('mt-4', status.state !== 'live' && 'opacity-80')}>
        <FlowDiagram flow={flow} animate={animate} className='mx-auto hidden max-w-[860px] sm:block' />
        <FlowDiagramCompact flow={flow} animate={animate} className='mx-auto max-w-[420px] sm:hidden' />
      </div>
    </Card>
  )
}

function ValueCard({ icon, label, value, sub, extra, testId }: { icon: ReactNode; label: string; value: string; sub?: ReactNode; extra?: ReactNode; testId: string }) {
  return (
    <Card className='flex min-w-0 flex-col gap-1.5 p-4' data-testid={testId}>
      <div className='flex items-center gap-2 text-[12px] font-medium text-muted'>
        {icon}
        {label}
      </div>
      <p className='tabular text-[22px] font-semibold tracking-[-0.01em] text-fg'>{value}</p>
      {sub && <p className='text-[12.5px] text-fg-2'>{sub}</p>}
      {extra}
    </Card>
  )
}

function ValueCards({ flow }: { flow: EnergyFlowState }) {
  const g = flow.grid
  const b = flow.battery
  const GridIcon = g.direction === 'import' ? ArrowDownLeft : g.direction === 'export' ? ArrowUpRight : Minus
  return (
    <div className='grid grid-cols-1 gap-3 min-[460px]:grid-cols-2 xl:grid-cols-4'>
      <ValueCard testId='flow-value-solar' icon={<Sun size={15} className='text-solar' />} label={t('flow.solar')} value={powerText(flow.solar.power)} sub={flow.solar.power == null ? t('flow.states.unknown') : (flow.solar.power ?? 0) > 20 ? t('solar.hints.producing') : t('flow.states.idle')} />
      <ValueCard testId='flow-value-home' icon={<Home size={15} className='text-home' />} label={t('flow.home')} value={powerText(flow.load.power)} sub={flow.load.derived ? t('flow.page.derived') : flow.load.power == null ? t('flow.states.unknown') : undefined} />
      <ValueCard
        testId='flow-value-grid'
        icon={<PlugZap size={15} className='text-gridp' />}
        label={t('flow.grid')}
        value={signedPower(g.power)}
        sub={
          <span className='inline-flex items-center gap-1' data-testid='flow-grid-direction'>
            <GridIcon size={13} /> {gridLabel(g)}
          </span>
        }
      />
      <ValueCard
        testId='flow-value-battery'
        icon={<BatteryCharging size={15} className='text-batt' />}
        label={t('flow.battery')}
        value={b.soc != null ? `${Math.round(b.soc)} %` : signedPower(b.power)}
        sub={<span data-testid='flow-battery-state'>{batteryLabel(b)}</span>}
        extra={
          <div className='mt-1 space-y-1.5'>
            {b.soc != null && (
              <div className='h-1.5 overflow-hidden rounded-full bg-panel-3' role='meter' aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(b.soc)} aria-label={t('flow.page.soc')}>
                <div className='h-full rounded-full bg-batt' style={{ width: `${Math.max(0, Math.min(100, b.soc))}%` }} />
              </div>
            )}
            {b.soc != null && (
              <p className='tabular text-[12px] text-muted'>
                {t('flow.page.power')}: {signedPower(b.power)}
              </p>
            )}
          </div>
        }
      />
    </div>
  )
}

function SolarSplit({ flow }: { flow: EnergyFlowState }) {
  const a = flow.solarAllocation
  const rows: [string, number][] = a ? ([['home', a.home], ['battery', a.battery], ['grid', a.grid]] as [string, number][]) : []
  return (
    <Card className='p-4' data-testid='solar-split'>
      <h3 className='mb-2.5 text-center text-[11.5px] font-medium text-fg-2'>{t('flow.page.solarSplit')}</h3>
      <p className='tabular text-center text-[18px] font-semibold text-fg'>{powerText(flow.solar.power)}</p>
      {a ? (
        <ul className='mt-2 divide-y divide-line rounded-lg border border-line bg-panel-2'>
          {rows.map(([to, w]) => (
            <li key={to} className='flex items-center justify-between px-2.5 py-[9px] text-[11.5px]'>
              <span className='text-fg-2'>
                <span className='text-subtle'>→</span> {t(`flow.${to as 'home'}`)}
              </span>
              <span className='tabular font-medium text-fg'>{powerText(w)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className='mt-2 rounded-lg border border-line bg-panel-2 px-3 py-3 text-center text-[11.5px] leading-relaxed text-muted'>{flow.solar.power == null ? t('flow.states.unknown') : t('flow.page.splitUnavailable')}</p>
      )}
    </Card>
  )
}

function ConnectionCard({ siteId, status, readingAt }: { siteId: string; status: LiveStatus; readingAt: number | null }) {
  const live = useLive(siteId)
  const interval = liveInterval(live)
  const rows: [string, ReactNode, string?][] = [
    [t('flow.page.connection'), t(`flow.page.connectionStates.${live.connection}`), 'flow-connection'],
    [t('flow.page.lastReading'), readingAt ? `${formatDate(readingAt, { dateStyle: 'medium', timeStyle: 'medium' })} · ${status.ageMs != null ? agoText(status.ageMs) : ''}` : t('flow.noReading')],
    [t('flow.page.interval'), interval ? t('flow.page.intervalValue', { s: Math.round(interval / 1000) }) : t('flow.page.unknownYet')],
    [t('flow.page.liveWithin'), `${Math.round(status.liveWithinMs / 1000)} s`],
    [t('flow.page.source'), t('flow.page.sourceValue')],
  ]
  return (
    <Card className='p-4' data-testid='flow-connection-card'>
      <h3 className='mb-2.5 flex items-center justify-center gap-1.5 text-[11.5px] font-medium text-fg-2'>
        <Radio size={13} /> {t('flow.page.connection')}
      </h3>
      <dl className='divide-y divide-line rounded-lg border border-line bg-panel-2'>
        {rows.map(([k, v, id]) => (
          <div key={k} className='flex items-start justify-between gap-3 px-2.5 py-[9px] text-[11.5px]'>
            <dt className='text-muted'>{k}</dt>
            <dd className='text-right text-fg' data-testid={id}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
      {status.state !== 'live' && <p className='mt-2 text-center text-[11.5px] text-muted'>{t('flow.page.notLive')}</p>}
    </Card>
  )
}
