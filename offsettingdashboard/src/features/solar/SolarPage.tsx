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

type TabId = 'overview' | 'energy' | 'battery' | 'bms' | 'inverters' | 'history' | 'forecast' | 'events' | 'system'
const TABS: TabItem<TabId>[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'energy', label: 'Energy' },
  { id: 'battery', label: 'Battery' },
  { id: 'bms', label: 'BMS & Cells' },
  { id: 'inverters', label: 'Inverters' },
  { id: 'history', label: 'History' },
  { id: 'forecast', label: 'Forecast' },
  { id: 'events', label: 'Events' },
  { id: 'system', label: 'System' },
]
const RANGES: { id: RangeId; label: string }[] = [
  { id: '6h', label: '6h' },
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
]
const POLL_MS = 15_000

/**
 * Solar dashboard: /ds/solar/:siteId?/:tab? — data-driven from the normalized Solar API.
 * The admin panel mounts the same page under its own shell (`basePath`).
 */
export default function SolarPage({ basePath = '/ds/solar' }: { basePath?: string }) {
  const params = useParams()
  // /ds/solar/<tab> (no site id) opens that tab on the first site.
  const firstIsTab = TABS.some((t) => t.id === params.siteId)
  const routeSite = firstIsTab ? undefined : params.siteId
  const routeTab = firstIsTab ? params.siteId : params.tab
  const navigate = useNavigate()
  const sites = useGetSitesQuery()
  const list = sites.data?.data ?? []
  const siteId = list.find((s) => s.id === routeSite)?.id ?? list[0]?.id
  const tab: TabId = TABS.some((t) => t.id === routeTab) ? (routeTab as TabId) : 'overview'
  const go = (s: string | undefined, t: TabId) => navigate(`${basePath}/${s ?? ''}${t === 'overview' ? '' : `/${t}`}`, { replace: true })

  if (sites.isLoading) return <LoadingState rows={3} />
  if (sites.isError) return <ErrorState title='Could not load your sites' onRetry={sites.refetch} />
  if (!siteId) {
    return (
      <EmptyState
        icon={<Server size={18} />}
        title='No SolarBMS system connected'
        description='Once CARBONOZ connects your SolarBMS installation to your account, its live data, batteries, cells and history appear here.'
      />
    )
  }

  return (
    <div className='flex min-w-0 flex-col gap-4 pb-4'>
      <div className='flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div className='-mx-1 min-w-0 overflow-x-auto px-1 sm:flex-1'>
          <Tabs items={TABS} value={tab} onChange={(t) => go(siteId, t)} label='Solar sections' />
        </div>
        {list.length > 1 && (
          <select aria-label='Site' className={`${inputClass} sm:w-auto sm:max-w-[240px]`} value={siteId} onChange={(e) => go(e.target.value, tab)}>
            {list.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <SiteView key={siteId} summary={list.find((s) => s.id === siteId)!} tab={tab} onTab={(t) => go(siteId, t)} />
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
        title='No SolarBMS system connected'
        description='This site has no SolarBMS installation yet. Its live data appears here once CARBONOZ connects one.'
      />
    )
  }
  if (overview.isLoading) return <LoadingState rows={3} />
  if (overview.isError || !o) return <ErrorState title='Could not load solar data' onRetry={refetch} />

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
      {o.updatedAt && <span>{o.stale ? 'Last reading' : 'Updated'} {relativeTime(Date.parse(o.updatedAt))}</span>}
      {o.activeAlarms > 0 && <StatusBadge tone='critical'>{o.activeAlarms} active alarm{o.activeAlarms > 1 ? 's' : ''}</StatusBadge>}
    </div>
  )
}

function OverviewTab({ siteId, o, site, onTab, onRefresh }: { siteId: string; o: SolarOverview; site: SiteModel; onTab: (t: TabId) => void; onRefresh: () => void }) {
  const h = headline(site)
  // Delayed data keeps its values but never reads as current.
  const lastSeen = (o.stale || h.allStale) && o.updatedAt ? `Last reading ${relativeTime(Date.parse(o.updatedAt))}` : null
  const staleTone = lastSeen ? 'text-gridp' : undefined
  const flow = useMemo(() => solarFlow(h), [h.pv, h.load, h.grid, h.battery, h.soc]) // eslint-disable-line react-hooks/exhaustive-deps
  const cards = [
    h.pv != null && <MetricCard key='pv' icon={ICONS.pv} label='Solar' {...metricCardProps('pv_power_w', h.pv)} hint={lastSeen ?? (h.pv > 20 ? 'Producing' : 'Idle')} tone={staleTone ?? (h.pv > 20 ? 'text-batt' : undefined)} />,
    h.load != null && <MetricCard key='load' icon={ICONS.load} label='Home usage' {...metricCardProps('load_power_w', h.load)} hint={lastSeen} tone={staleTone} />,
    h.battery != null && <MetricCard key='batt' icon={ICONS.battery(h.soc)} label='Battery' {...metricCardProps('battery_power_w', h.battery)} hint={lastSeen ?? [h.soc != null && `${Math.round(h.soc)}%`, batteryHint(h.battery)].filter(Boolean).join(' · ')} tone={staleTone} />,
    h.battery == null && h.soc != null && <MetricCard key='soc' icon={ICONS.battery(h.soc)} label='Battery' value={String(Math.round(h.soc))} unit='%' hint={lastSeen} tone={staleTone} />,
    h.grid != null && <MetricCard key='grid' icon={ICONS.grid} label='Grid' {...metricCardProps('grid_power_w', h.grid)} hint={lastSeen ?? gridHint(h.grid)} tone={staleTone} />,
  ].filter(Boolean)

  return (
    <div className='flex flex-col gap-4'>
      <Freshness o={o} />
      {h.excludedInstallations > 0 && (
        <p className='-mt-2 text-[12.5px] text-muted'>
          <StatusBadge tone='warning'>{h.excludedInstallations} installation{h.excludedInstallations > 1 ? 's' : ''} delayed</StatusBadge>{' '}
          Not included in the totals below until {h.excludedInstallations > 1 ? 'they report' : 'it reports'} again.
        </p>
      )}
      {cards.length ? (
        <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>{cards}</div>
      ) : (
        <EmptyState title='No live values yet' description='Values appear as soon as your SolarBMS sends its first reading.' />
      )}
      <div className='grid gap-3 xl:grid-cols-3'>
        <EnergyFlowCard
          flow={flow}
          status={o.source === 'none' ? 'no-data' : o.stale ? 'no-data' : 'live'}
          onRetry={onRefresh}
          className='min-h-[280px] xl:col-span-2'
        />
        <StatusCard
          title='System status'
          icon={<Activity size={16} />}
          items={[
            { label: 'Inverters', value: site.inverters.length },
            { label: 'Batteries', value: site.batteries.length },
            { label: 'BMS', value: site.allBms.length },
            { label: 'Cells', value: site.allBms.reduce((n, b) => n + (b.latest?.cells?.length ?? 0), 0) },
            { label: 'Data', value: o.source === 'none' ? 'No data yet' : o.stale ? 'Delayed' : 'Live' },
            { label: 'Forecast', value: o.hasForecast ? 'Available' : 'Not provided' },
          ]}
        />
      </div>
      <div className='grid gap-3 xl:grid-cols-3'>
        <div className='grid content-start gap-3 xl:col-span-2'>
          {site.batteries.slice(0, 2).map((b) => (
            <BatteryCard key={deviceKey(b)} d={b} bms={b.bms} unitOf={site.unitOf} title={site.labelOf(b)} />
          ))}
          {!site.batteries.length &&
            site.systems.filter((d) => d.latest).map((d) => <StatusCardFromDevice key={deviceKey(d)} title={site.systems.length > 1 ? site.labelOf(d) : 'System values'} d={d} site={site} />)}
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
        <p className='text-[15px] font-semibold text-fg'>Active alarms</p>
        <button type='button' onClick={onMore} className='text-[12px] font-medium text-accent-ink hover:text-fg'>
          All events
        </button>
      </div>
      <EventTable events={ev.data?.data} loading={ev.isLoading} />
    </div>
  )
}

function RangePicker({ value, onChange }: { value: RangeId; onChange: (r: RangeId) => void }) {
  return <Segmented options={RANGES} value={value} onChange={onChange} label='Time range' />
}

function EnergyTab({ siteId, o, site }: { siteId: string; o: SolarOverview; site: SiteModel }) {
  const [range, setRange] = useState<RangeId>('24h')
  const { refreshKey } = useShell()
  const known = ['pv_power_w', 'load_power_w', 'grid_power_w', 'battery_power_w', 'soc_pct']
  const available = known.filter((k) => o.metrics.some((m) => m.deviceKind === 'SYSTEM' && m.key === k))
  if (!available.length) return <EmptyState title='No energy metrics yet' description='Solar, load, grid and battery power appear once SolarBMS reports system totals.' />
  return (
    <div className='flex flex-col gap-3'>
      <div className='flex justify-end'>
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
      empty={{ icon: <BatteryCharging size={18} />, title: 'No batteries reported', description: 'Battery packs appear here when SolarBMS reports them.' }}
    />
  )
}

function BmsTab({ site }: { site: SiteModel }) {
  const cards = [
    ...site.batteries.flatMap((b) => b.bms.map((m) => <BMSCard key={deviceKey(m)} d={m} unitOf={site.unitOf} battery={site.labelOf(b)} title={site.labelOf(m)} />)),
    ...site.looseBms.map((m) => <BMSCard key={deviceKey(m)} d={m} unitOf={site.unitOf} title={site.labelOf(m)} />),
  ]
  if (!cards.length) return <EmptyState icon={<Activity size={18} />} title='No BMS reported' description='BMS status, alarms and cell voltages appear here when SolarBMS reports them.' />
  return <div className='grid gap-3'>{cards}</div>
}

function InvertersTab({ site }: { site: SiteModel }) {
  return (
    <DeviceGrid
      items={site.inverters.map((d) => <InverterCard key={deviceKey(d)} d={d} unitOf={site.unitOf} title={site.labelOf(d)} />)}
      empty={{ icon: <Cpu size={18} />, title: 'No inverters reported', description: 'Inverter status and power appear here when SolarBMS reports them.' }}
    />
  )
}

const KIND_LABEL: Record<DeviceKind, string> = { SYSTEM: 'System', INVERTER: 'Inverter', BATTERY: 'Battery', BMS: 'BMS' }

/** Any numeric metric in the catalogue can be charted — including ones added later. */
function HistoryTab({ siteId, o, site }: { siteId: string; o: SolarOverview; site: SiteModel }) {
  const numeric = o.metrics.filter((m) => m.valueType === 'number' && !m.key.startsWith('forecast_'))
  const [sel, setSel] = useState(() => {
    const d = numeric.find((m) => m.deviceKind === 'SYSTEM' && m.key === 'pv_power_w') ?? numeric[0]
    return d ? `${d.deviceKind}:${d.key}` : ''
  })
  const [range, setRange] = useState<RangeId>('24h')
  const { refreshKey } = useShell()
  if (!numeric.length) return <EmptyState title='No history yet' description='History builds up as SolarBMS sends readings.' />
  const [kind, metric] = sel.split(':') as [DeviceKind, string]
  const labels = Object.fromEntries(o.devices.map((d) => [seriesKey(d.installationId, d.externalId), site.labelOf(d)]))
  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <select aria-label='Metric' className={`${inputClass} w-auto max-w-full sm:min-w-[280px]`} value={sel} onChange={(e) => setSel(e.target.value)}>
          {(['SYSTEM', 'INVERTER', 'BATTERY', 'BMS'] as DeviceKind[]).map((k) => {
            const opts = numeric.filter((m) => m.deviceKind === k)
            return opts.length ? (
              <optgroup key={k} label={KIND_LABEL[k]}>
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
  if (f.isError) return <ErrorState title='Could not load the forecast' onRetry={f.refetch} />
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
            { title: 'Time', key: 'ts', render: (_, p) => <span className='tabular text-fg-2'>{new Date(p.ts).toLocaleString()}</span> },
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
  if (ev.isError) return <ErrorState title='Could not load events' onRetry={ev.refetch} />
  return (
    <div className='flex flex-col gap-3'>
      <div className='flex justify-end'>
        <Segmented<'all' | 'active'> options={[{ id: 'all', label: 'All' }, { id: 'active', label: 'Active' }]} value={filter} onChange={setFilter} label='Event filter' />
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
          <StatusCardFromDevice key={deviceKey(d)} title={site.systems.length > 1 ? `All system values · ${site.labelOf(d)}` : 'All system values'} d={d} site={site} />
        ))}
      <div>
        <p className='mb-2 text-[15px] font-semibold text-fg'>Devices</p>
        <DataTable<SolarDevice>
          rows={o.devices}
          rowKey={deviceKey}
          empty={{ title: 'No devices reported yet' }}
          columns={[
            { title: 'Type', key: 'kind', render: (_, d) => KIND_LABEL[d.kind] },
            { title: 'Device', key: 'name', render: (_, d) => <span className='font-medium text-fg'>{site.labelOf(d)}</span> },
            { title: 'ID', key: 'id', render: (_, d) => <span className='font-mono text-[12px] text-fg-2'>{d.externalId}</span> },
            { title: 'Status', key: 'status', render: (_, d) => d.latest?.status ?? '—' },
            { title: 'Values', key: 'n', render: (_, d) => Object.keys(d.latest?.metrics ?? {}).length },
            {
              title: 'Last reading',
              key: 'seen',
              render: (_, d) =>
                d.latest ? (
                  <span className='flex items-center gap-2'>
                    {relativeTime(Date.parse(d.latest.ts))}
                    {d.latest.stale && <StatusBadge tone='warning'>Delayed</StatusBadge>}
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
        <p className='mb-2 text-[15px] font-semibold text-fg'>Reported metrics</p>
        <DataTable
          rows={o.metrics}
          rowKey={(m) => `${m.deviceKind}:${m.key}`}
          empty={{ title: 'No metrics reported yet' }}
          columns={[
            { title: 'Metric', key: 'label', render: (_, m) => <span className='font-medium text-fg'>{metricMeta(m.key).label}</span> },
            { title: 'Key', key: 'key', render: (_, m) => <span className='font-mono text-[12px] text-fg-2'>{m.key}</span> },
            { title: 'Device type', key: 'kind', render: (_, m) => KIND_LABEL[m.deviceKind] },
            { title: 'Unit', key: 'unit', render: (_, m) => m.unit ?? '—' },
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
        <p className='text-[15px] font-semibold text-fg'>All reported values</p>
        <input type='search' aria-label='Filter values' placeholder='Filter values' value={q} onChange={(e) => setQ(e.target.value)} className={`${inputClass} sm:w-60`} />
      </div>
      <DataTable<MetricRow>
        rows={rows}
        rowKey={(r) => `${deviceKey(r.device)}:${r.key}`}
        pageSize={25}
        empty={{ title: q ? 'No value matches' : 'No values reported yet' }}
        columns={[
          { title: 'Device', key: 'device', render: (_, r) => <span className='text-fg-2'>{site.labelOf(r.device)}</span> },
          { title: 'Value', key: 'label', render: (_, r) => <span className='font-medium text-fg'>{metricMeta(r.key).label}</span> },
          {
            title: 'Current',
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
          { title: 'Key', key: 'key', render: (_, r) => <span className='font-mono text-[12px] text-fg-2'>{r.key}</span> },
          {
            title: 'Updated',
            key: 'ts',
            render: (_, r) => (
              <span className='flex items-center gap-2 whitespace-nowrap'>
                {relativeTime(Date.parse(r.ts))}
                {r.stale && <StatusBadge tone='warning'>Delayed</StatusBadge>}
              </span>
            ),
          },
        ]}
      />
    </div>
  )
}
