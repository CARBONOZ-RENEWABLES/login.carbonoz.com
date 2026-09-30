import { Activity, BatteryCharging, Cpu, Server } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardHeader, EmptyState, ErrorState, inputClass, LoadingState, Segmented, StatusBadge, TabItem, Tabs } from '../../design'
import { relativeTime, useShell } from '../../layout/ShellContext'
import { RangeId } from '../../services/energyFlow'
import { DeviceKind, MetricValue, SiteSummary, SolarDevice, SolarOverview, useGetSitesQuery, useGetSolarEventsQuery, useGetSolarForecastQuery, useGetSolarOverviewQuery } from './api'
import { BatteryCard, BMSCard, InverterCard, MetricCard, MetricList, StatusCard } from './components/cards'
import { ICONS } from './components/icons'
import { ForecastChart, HistoryChart } from './components/charts'
import { DataTable, EventTable } from './components/tables'
import { allMetricRows, batteryHint, buildSite, deviceKey, formatMetric, MetricRow, freshness, gridHint, headline, metricCardProps, metricMeta, seriesKey, SiteModel, solarFlow } from './model'
import { EnergyFlowCard } from '../dashboard/EnergyFlow'
import { formatDate, translate as t } from '../../i18n'
import { EnergyHistory } from './components/EnergyHistory'

type TabId = 'overview' | 'energy' | 'battery' | 'bms' | 'inverters' | 'history' | 'forecast' | 'events' | 'system'
const TAB_IDS: TabId[] = ['overview', 'energy', 'battery', 'bms', 'inverters', 'history', 'forecast', 'events', 'system']
const tabs = (): TabItem<TabId>[] => TAB_IDS.map((id) => ({ id, label: t(`solar.tabs.${id}`) }))
const RANGE_IDS: RangeId[] = ['6h', '24h', '7d', '30d']
const ranges = () => RANGE_IDS.map((id) => ({ id, label: t(`solar.ranges.${id}`) }))
const POLL_MS = 15_000

/**
 * Solar dashboard: /ds/solar/:siteId?/:tab? — data-driven from the normalized Solar API.
 * The admin panel mounts the same page under its own shell (`basePath`).
 */
export default function SolarPage({ basePath = '/ds/solar' }: { basePath?: string }) {
  const params = useParams()
  // /ds/solar/<tab> (no site id) opens that tab on the first site.
  const firstIsTab = TAB_IDS.includes(params.siteId as TabId)
  const routeSite = firstIsTab ? undefined : params.siteId
  const routeTab = firstIsTab ? params.siteId : params.tab
  const navigate = useNavigate()
  const sites = useGetSitesQuery()
  const list = sites.data?.data ?? []
  const siteId = list.find((s) => s.id === routeSite)?.id ?? list[0]?.id
  const tab: TabId = TAB_IDS.includes(routeTab as TabId) ? (routeTab as TabId) : 'overview'
  const go = (s: string | undefined, tab: TabId) => navigate(`${basePath}/${s ?? ''}${tab === 'overview' ? '' : `/${tab}`}`, { replace: true })

  if (sites.isLoading) return <LoadingState rows={3} />
  if (sites.isError) return <ErrorState title={t('solar.errors.sites')} onRetry={sites.refetch} />
  if (!siteId) {
    return (
      <EmptyState
        icon={<Server size={18} />}
        title={t('solar.empty.noSystem')}
        description={t('solar.empty.noSystemAccount')}
      />
    )
  }

  return (
    <div className='flex min-w-0 flex-col gap-4 pb-4'>
      <div className='flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div className='-mx-1 min-w-0 overflow-x-auto px-1 sm:flex-1'>
          <Tabs items={tabs()} value={tab} onChange={(id) => go(siteId, id)} label={t('solar.sections')} />
        </div>
        {list.length > 1 && (
          <select aria-label={t('solar.site')} className={`${inputClass} sm:w-auto sm:max-w-[240px]`} value={siteId} onChange={(e) => go(e.target.value, tab)}>
            {list.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <SiteView key={siteId} summary={list.find((s) => s.id === siteId)!} tab={tab} onTab={(id) => go(siteId, id)} />
    </div>
  )
}

function SiteView({ summary, tab, onTab }: { summary: SiteSummary; tab: TabId; onTab: (t: TabId) => void }) {
  const siteId = summary.id
  const { refreshKey, setLive } = useShell()
  const overview = useGetSolarOverviewQuery(siteId, { pollingInterval: POLL_MS })
  const { refetch } = overview
  useEffect(() => {
    if (refreshKey) refetch()
  }, [refreshKey, refetch])
  const o = overview.data?.data
  const names = useMemo(() => Object.fromEntries(summary.installations.map((i) => [i.id, i.name])), [summary])
  const site = useMemo(() => buildSite(o, names), [o, names])

  // Drives the header Live pill and the mobile System menu.
  useEffect(() => {
    if (overview.isError) setLive('error', null)
    else if (o) setLive(o.source !== 'none' && !o.stale ? 'live' : 'no-data', o.updatedAt ? Date.parse(o.updatedAt) : null)
  }, [o, overview.isError, setLive])
  useEffect(() => () => setLive(null, null), [setLive])

  if (!summary.installations.length) {
    return (
      <EmptyState
        icon={<Server size={18} />}
        title={t('solar.empty.noSystem')}
        description={t('solar.empty.noSystemSite')}
      />
    )
  }
  if (overview.isLoading) return <LoadingState rows={3} />
  if (overview.isError || !o) return <ErrorState title={t('solar.errors.data')} onRetry={refetch} />

  switch (tab) {
    case 'energy':
      return <EnergyTab siteId={siteId} o={o} site={site} />
    case 'battery':
      return <BatteryTab site={site} />
    case 'bms':
      return <BmsTab site={site} />
    case 'inverters':
      return <InvertersTab site={site} />
    case 'history':
      return <HistoryTab siteId={siteId} o={o} site={site} />
    case 'forecast':
      return <ForecastTab siteId={siteId} />
    case 'events':
      return <EventsTab siteId={siteId} />
    case 'system':
      return <SystemTab o={o} site={site} />
    default:
      return <OverviewTab siteId={siteId} o={o} site={site} onTab={onTab} onRefresh={refetch} />
  }
}

function Freshness({ o }: { o: SolarOverview }) {
  const f = freshness(o)
  return (
    <div className='flex flex-wrap items-center gap-2 text-[12.5px] text-muted'>
      <StatusBadge tone={f.tone} dot pulse={f.tone === 'good'}>
        {f.label}
      </StatusBadge>
      {o.updatedAt && <span>{t(o.stale ? 'solar.lastReading' : 'time.updated', { when: relativeTime(Date.parse(o.updatedAt)) })}</span>}
      {o.activeAlarms > 0 && <StatusBadge tone='critical'>{t('solar.activeAlarmCount', { count: o.activeAlarms })}</StatusBadge>}
    </div>
  )
}

function OverviewTab({ siteId, o, site, onTab, onRefresh }: { siteId: string; o: SolarOverview; site: SiteModel; onTab: (t: TabId) => void; onRefresh: () => void }) {
  const h = headline(site)
  // Delayed data keeps its values but never reads as current.
  const lastSeen = (o.stale || h.allStale) && o.updatedAt ? t('solar.lastReading', { when: relativeTime(Date.parse(o.updatedAt)) }) : null
  const staleTone = lastSeen ? 'text-gridp' : undefined
  const flow = useMemo(() => solarFlow(h), [h.pv, h.load, h.grid, h.battery, h.soc]) // eslint-disable-line react-hooks/exhaustive-deps
  const cards = [
    h.pv != null && <MetricCard key='pv' icon={ICONS.pv} label={t('solar.cards.solar')} {...metricCardProps('pv_power_w', h.pv)} hint={lastSeen ?? (h.pv > 20 ? t('solar.hints.producing') : t('solar.hints.idle'))} tone={staleTone ?? (h.pv > 20 ? 'text-batt' : undefined)} />,
    h.load != null && <MetricCard key='load' icon={ICONS.load} label={t('solar.cards.homeUsage')} {...metricCardProps('load_power_w', h.load)} hint={lastSeen} tone={staleTone} />,
    h.battery != null && <MetricCard key='batt' icon={ICONS.battery(h.soc)} label={t('solar.cards.battery')} {...metricCardProps('battery_power_w', h.battery)} hint={lastSeen ?? [h.soc != null && `${Math.round(h.soc)}%`, batteryHint(h.battery)].filter(Boolean).join(' · ')} tone={staleTone} />,
    h.battery == null && h.soc != null && <MetricCard key='soc' icon={ICONS.battery(h.soc)} label={t('solar.cards.battery')} value={String(Math.round(h.soc))} unit='%' hint={lastSeen} tone={staleTone} />,
    h.grid != null && <MetricCard key='grid' icon={ICONS.grid} label={t('solar.cards.grid')} {...metricCardProps('grid_power_w', h.grid)} hint={lastSeen ?? gridHint(h.grid)} tone={staleTone} />,
  ].filter(Boolean)

  return (
    <div className='flex flex-col gap-4'>
      <Freshness o={o} />
      {h.excludedInstallations > 0 && (
        <p className='-mt-2 text-[12.5px] text-muted'>
          <StatusBadge tone='warning'>{t('solar.delayedInstallations', { count: h.excludedInstallations })}</StatusBadge>{' '}
          {t('solar.delayedNotIncluded', { count: h.excludedInstallations })}
        </p>
      )}
      {cards.length ? (
        <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>{cards}</div>
      ) : (
        <EmptyState title={t('solar.empty.noLive')} description={t('solar.empty.noLiveHint')} />
      )}
      <div className='grid gap-3 xl:grid-cols-3'>
        <EnergyFlowCard
          flow={flow}
          status={o.source === 'none' ? 'no-data' : o.stale ? 'no-data' : 'live'}
          onRetry={onRefresh}
          className='min-h-[280px] xl:col-span-2'
        />
        <StatusCard
          title={t('solar.status.title')}
          icon={<Activity size={16} />}
          items={[
            { label: t('solar.status.inverters'), value: site.inverters.length },
            { label: t('solar.status.batteries'), value: site.batteries.length },
            { label: t('solar.status.bms'), value: site.allBms.length },
            { label: t('solar.status.cells'), value: site.allBms.reduce((n, b) => n + (b.latest?.cells?.length ?? 0), 0) },
            { label: t('solar.status.data'), value: o.source === 'none' ? t('solar.fresh.none') : o.stale ? t('solar.fresh.delayed') : t('solar.fresh.live') },
            { label: t('solar.status.forecast'), value: o.hasForecast ? t('solar.status.available') : t('common.notProvided') },
          ]}
        />
      </div>
      <div className='grid gap-3 xl:grid-cols-3'>
        <div className='grid content-start gap-3 xl:col-span-2'>
          {site.batteries.slice(0, 2).map((b) => (
            <BatteryCard key={deviceKey(b)} d={b} bms={b.bms} unitOf={site.unitOf} title={site.labelOf(b)} />
          ))}
          {!site.batteries.length &&
            site.systems.filter((d) => d.latest).map((d) => <StatusCardFromDevice key={deviceKey(d)} title={site.systems.length > 1 ? site.labelOf(d) : t('solar.systemValues')} d={d} site={site} />)}
        </div>
        <div className='grid content-start gap-3'>
          {site.inverters.slice(0, 1).map((d) => (
            <InverterCard key={deviceKey(d)} d={d} unitOf={site.unitOf} title={site.labelOf(d)} />
          ))}
        </div>
      </div>
      {o.activeAlarms > 0 && <ActiveAlarms siteId={siteId} onMore={() => onTab('events')} />}
    </div>
  )
}

function StatusCardFromDevice({ title, d, site }: { title: string; d: SolarDevice; site: SiteModel }) {
  return (
    <Card className='p-4'>
      <CardHeader title={title} />
      <div className='mt-3'>
        <MetricList metrics={d.latest?.metrics ?? {}} unitOf={site.unitOf} kind={d.kind} />
      </div>
    </Card>
  )
}

function ActiveAlarms({ siteId, onMore }: { siteId: string; onMore: () => void }) {
  const ev = useGetSolarEventsQuery({ siteId, active: true, limit: 5 }, { pollingInterval: POLL_MS })
  return (
    <div>
      <div className='mb-2 flex items-center justify-between'>
        <p className='text-[15px] font-semibold text-fg'>{t('solar.activeAlarms')}</p>
        <button type='button' onClick={onMore} className='text-[12px] font-medium text-accent-ink hover:text-fg'>
          {t('solar.allEvents')}
        </button>
      </div>
      <EventTable events={ev.data?.data} loading={ev.isLoading} />
    </div>
  )
}

function RangePicker({ value, onChange }: { value: RangeId; onChange: (r: RangeId) => void }) {
  return <Segmented options={ranges()} value={value} onChange={onChange} label={t('solar.timeRange')} />
}

function EnergyTab({ siteId, o, site }: { siteId: string; o: SolarOverview; site: SiteModel }) {
  const [range, setRange] = useState<RangeId>('24h')
  const { refreshKey } = useShell()
  const known = ['pv_power_w', 'load_power_w', 'grid_power_w', 'battery_power_w', 'soc_pct']
  const available = known.filter((k) => o.metrics.some((m) => m.deviceKind === 'SYSTEM' && m.key === k))
  if (!available.length)
    return (
      <div className='flex flex-col gap-4'>
        <EmptyState title={t('solar.empty.noEnergy')} description={t('solar.empty.noEnergyHint')} />
        <EnergyHistory siteId={siteId} />
      </div>
    )
  return (
    <div className='flex flex-col gap-3'>
      <EnergyHistory siteId={siteId} />
      <div className='mt-2 flex flex-wrap items-center justify-between gap-2'>
        <p className='text-[15px] font-semibold text-fg'>{t('solar.powerCurves')}</p>
        <RangePicker value={range} onChange={setRange} />
      </div>
      <div className='grid gap-3 lg:grid-cols-2'>
        {available.map((k) => (
          <HistoryChart
            key={k}
            siteId={siteId}
            metric={k}
            kind='SYSTEM'
            range={range}
            refreshKey={refreshKey}
            labels={Object.fromEntries(site.systems.map((d) => [seriesKey(d.installationId, d.externalId), site.systems.length > 1 ? site.labelOf(d) : metricMeta(k).label]))}
          />
        ))}
      </div>
    </div>
  )
}

function DeviceGrid({ items, empty }: { items: JSX.Element[]; empty: { title: string; description: string; icon: JSX.Element } }) {
  if (!items.length) return <EmptyState {...empty} />
  return <div className='grid gap-3 xl:grid-cols-2'>{items}</div>
}

function BatteryTab({ site }: { site: SiteModel }) {
  return (
    <DeviceGrid
      items={site.batteries.map((b) => <BatteryCard key={deviceKey(b)} d={b} bms={b.bms} unitOf={site.unitOf} title={site.labelOf(b)} />)}
      empty={{ icon: <BatteryCharging size={18} />, title: t('solar.empty.noBatteries'), description: t('solar.empty.noBatteriesHint') }}
    />
  )
}

function BmsTab({ site }: { site: SiteModel }) {
  const cards = [
    ...site.batteries.flatMap((b) => b.bms.map((m) => <BMSCard key={deviceKey(m)} d={m} unitOf={site.unitOf} battery={site.labelOf(b)} title={site.labelOf(m)} />)),
    ...site.looseBms.map((m) => <BMSCard key={deviceKey(m)} d={m} unitOf={site.unitOf} title={site.labelOf(m)} />),
  ]
  if (!cards.length) return <EmptyState icon={<Activity size={18} />} title={t('solar.empty.noBms')} description={t('solar.empty.noBmsHint')} />
  return <div className='grid gap-3'>{cards}</div>
}

function InvertersTab({ site }: { site: SiteModel }) {
  return (
    <DeviceGrid
      items={site.inverters.map((d) => <InverterCard key={deviceKey(d)} d={d} unitOf={site.unitOf} title={site.labelOf(d)} />)}
      empty={{ icon: <Cpu size={18} />, title: t('solar.empty.noInverters'), description: t('solar.empty.noInvertersHint') }}
    />
  )
}

const kindLabel = (k: DeviceKind) => t(`solar.kinds.${k}`)

/** Any numeric metric in the catalogue can be charted — including ones added later. */
function HistoryTab({ siteId, o, site }: { siteId: string; o: SolarOverview; site: SiteModel }) {
  const numeric = o.metrics.filter((m) => m.valueType === 'number' && !m.key.startsWith('forecast_'))
  const [sel, setSel] = useState(() => {
    const d = numeric.find((m) => m.deviceKind === 'SYSTEM' && m.key === 'pv_power_w') ?? numeric[0]
    return d ? `${d.deviceKind}:${d.key}` : ''
  })
  const [range, setRange] = useState<RangeId>('24h')
  const { refreshKey } = useShell()
  if (!numeric.length) return <EmptyState title={t('solar.empty.noHistory')} description={t('solar.empty.noHistoryHint')} />
  const [kind, metric] = sel.split(':') as [DeviceKind, string]
  const labels = Object.fromEntries(o.devices.map((d) => [seriesKey(d.installationId, d.externalId), site.labelOf(d)]))
  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <select aria-label={t('solar.metric')} className={`${inputClass} w-auto max-w-full sm:min-w-[280px]`} value={sel} onChange={(e) => setSel(e.target.value)}>
          {(['SYSTEM', 'INVERTER', 'BATTERY', 'BMS'] as DeviceKind[]).map((k) => {
            const opts = numeric.filter((m) => m.deviceKind === k)
            return opts.length ? (
              <optgroup key={k} label={kindLabel(k)}>
                {opts.map((m) => (
                  <option key={m.key} value={`${k}:${m.key}`}>
                    {metricMeta(m.key).label}
                    {m.unit ? ` (${m.unit})` : ''}
                  </option>
                ))}
              </optgroup>
            ) : null
          })}
        </select>
        <RangePicker value={range} onChange={setRange} />
      </div>
      <HistoryChart siteId={siteId} metric={metric} kind={kind} range={range} refreshKey={refreshKey} labels={labels} />
    </div>
  )
}

function ForecastTab({ siteId }: { siteId: string }) {
  const f = useGetSolarForecastQuery(siteId)
  if (f.isError) return <ErrorState title={t('solar.errors.forecast')} onRetry={f.refetch} />
  const fc = f.data?.data
  const keys = fc ? [...new Set(fc.points.flatMap((p) => Object.keys(p).filter((k) => k !== 'ts')))] : []
  return (
    <div className='flex flex-col gap-3'>
      <ForecastChart forecast={fc} loading={f.isLoading} />
      {fc && fc.points.length > 0 && (
        <DataTable
          rows={fc.points}
          rowKey={(p) => p.ts}
          columns={[
            { title: t('solar.table.time'), key: 'ts', render: (_, p) => <span className='tabular text-fg-2'>{formatDate(p.ts, { dateStyle: 'short', timeStyle: 'short' })}</span> },
            ...keys.map((k) => ({
              title: metricMeta(k).label,
              key: k,
              render: (_: unknown, p: Record<string, MetricValue>) => {
                const f = formatMetric(k, p[k])
                return <span className='tabular'>{f.value} {f.unit}</span>
              },
            })),
          ]}
        />
      )}
    </div>
  )
}

function EventsTab({ siteId }: { siteId: string }) {
  const [filter, setFilter] = useState<'all' | 'active'>('all')
  const ev = useGetSolarEventsQuery({ siteId, active: filter === 'active' ? true : undefined, limit: 200 }, { pollingInterval: POLL_MS })
  if (ev.isError) return <ErrorState title={t('solar.errors.events')} onRetry={ev.refetch} />
  return (
    <div className='flex flex-col gap-3'>
      <div className='flex justify-end'>
        <Segmented<'all' | 'active'> options={[{ id: 'all', label: t('common.all') }, { id: 'active', label: t('common.active') }]} value={filter} onChange={setFilter} label={t('solar.eventFilter')} />
      </div>
      <EventTable events={ev.data?.data} loading={ev.isFetching && !ev.data} />
    </div>
  )
}

function SystemTab({ o, site }: { o: SolarOverview; site: SiteModel }) {
  return (
    <div className='flex flex-col gap-4'>
      <Freshness o={o} />
      {site.systems
        .filter((d) => d.latest)
        .map((d) => (
          <StatusCardFromDevice key={deviceKey(d)} title={site.systems.length > 1 ? `${t('solar.allSystemValues')} · ${site.labelOf(d)}` : t('solar.allSystemValues')} d={d} site={site} />
        ))}
      <div>
        <p className='mb-2 text-[15px] font-semibold text-fg'>{t('solar.devices')}</p>
        <DataTable<SolarDevice>
          rows={o.devices}
          rowKey={deviceKey}
          empty={{ title: t('solar.empty.noDevices') }}
          columns={[
            { title: t('solar.table.type'), key: 'kind', render: (_, d) => kindLabel(d.kind) },
            { title: t('solar.table.device'), key: 'name', render: (_, d) => <span className='font-medium text-fg'>{site.labelOf(d)}</span> },
            { title: t('solar.table.id'), key: 'id', render: (_, d) => <span className='font-mono text-[12px] text-fg-2'>{d.externalId}</span> },
            { title: t('solar.table.status'), key: 'status', render: (_, d) => d.latest?.status ?? '—' },
            { title: t('solar.table.values'), key: 'n', render: (_, d) => Object.keys(d.latest?.metrics ?? {}).length },
            {
              title: t('solar.table.lastReading'),
              key: 'seen',
              render: (_, d) =>
                d.latest ? (
                  <span className='flex items-center gap-2'>
                    {relativeTime(Date.parse(d.latest.ts))}
                    {d.latest.stale && <StatusBadge tone='warning'>{t('solar.fresh.delayed')}</StatusBadge>}
                  </span>
                ) : (
                  '—'
                ),
            },
          ]}
        />
      </div>
      <AllValues o={o} site={site} />
      <div>
        <p className='mb-2 text-[15px] font-semibold text-fg'>{t('solar.reportedMetrics')}</p>
        <DataTable
          rows={o.metrics}
          rowKey={(m) => `${m.deviceKind}:${m.key}`}
          empty={{ title: t('solar.empty.noMetrics') }}
          columns={[
            { title: t('solar.metric'), key: 'label', render: (_, m) => <span className='font-medium text-fg'>{metricMeta(m.key).label}</span> },
            { title: t('solar.table.key'), key: 'key', render: (_, m) => <span className='font-mono text-[12px] text-fg-2'>{m.key}</span> },
            { title: t('solar.table.deviceType'), key: 'kind', render: (_, m) => kindLabel(m.deviceKind) },
            { title: t('solar.table.unit'), key: 'unit', render: (_, m) => m.unit ?? '—' },
          ]}
        />
      </div>
    </div>
  )
}

/** Every current value of every device, searchable — covers metrics no card was designed for. */
function AllValues({ o, site }: { o: SolarOverview; site: SiteModel }) {
  const [q, setQ] = useState('')
  const rows = useMemo(() => allMetricRows(o.devices, q), [o.devices, q])
  return (
    <div>
      <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
        <p className='text-[15px] font-semibold text-fg'>{t('solar.allValues')}</p>
        <input type='search' aria-label={t('solar.filterValues')} placeholder={t('solar.filterValues')} value={q} onChange={(e) => setQ(e.target.value)} className={`${inputClass} sm:w-60`} />
      </div>
      <DataTable<MetricRow>
        rows={rows}
        rowKey={(r) => `${deviceKey(r.device)}:${r.key}`}
        pageSize={25}
        empty={{ title: q ? t('solar.empty.noValueMatch') : t('solar.empty.noValues') }}
        columns={[
          { title: t('solar.table.device'), key: 'device', render: (_, r) => <span className='text-fg-2'>{site.labelOf(r.device)}</span> },
          { title: t('solar.table.value'), key: 'label', render: (_, r) => <span className='font-medium text-fg'>{metricMeta(r.key).label}</span> },
          {
            title: t('solar.table.current'),
            key: 'value',
            render: (_, r) => {
              const f = formatMetric(r.key, r.value, site.unitOf(r.device.kind, r.key))
              return (
                <span className='tabular-nums text-fg'>
                  {f.value}
                  {f.unit && <span className='ml-1 text-muted'>{f.unit}</span>}
                </span>
              )
            },
          },
          { title: t('solar.table.key'), key: 'key', render: (_, r) => <span className='font-mono text-[12px] text-fg-2'>{r.key}</span> },
          {
            title: t('solar.table.updated'),
            key: 'ts',
            render: (_, r) => (
              <span className='flex items-center gap-2 whitespace-nowrap'>
                {relativeTime(Date.parse(r.ts))}
                {r.stale && <StatusBadge tone='warning'>{t('solar.fresh.delayed')}</StatusBadge>}
              </span>
            ),
          },
        ]}
      />
    </div>
  )
}
