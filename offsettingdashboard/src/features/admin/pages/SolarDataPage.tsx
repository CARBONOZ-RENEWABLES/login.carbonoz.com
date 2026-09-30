import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EmptyState, inputClass, Segmented, StatusBadge, TabItem, Tabs } from '../../../design'
import type { DeviceKind, SolarEvent } from '../../solar/api'
import { DataTable, EventTable } from '../../solar/components/tables'
import { metricMeta } from '../../solar/model'
import { AdminDevice, CatalogueMetric, useGetAdminDevicesQuery, useGetAdminEventsQuery, useGetAdminInstallationsQuery, useGetAdminMetricsQuery, useGetAdminSitesQuery } from '../api'
import { ago, formatDate } from '../model'
import { Mono, Panel, QueryError, SearchInput, SelectFilter } from '../ui'
import { useDebounced } from '../hooks'

type Tab = 'devices' | 'events' | 'metrics'
const TABS: TabItem<Tab>[] = [
  { id: 'devices', label: 'Devices' },
  { id: 'events', label: 'Events' },
  { id: 'metrics', label: 'Metric catalogue' },
]
const KINDS: { value: DeviceKind; label: string }[] = [
  { value: 'SYSTEM', label: 'System' },
  { value: 'INVERTER', label: 'Inverter' },
  { value: 'BATTERY', label: 'Battery' },
  { value: 'BMS', label: 'BMS' },
]
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label])) as Record<DeviceKind, string>

export default function SolarDataPage() {
  const [params, setParams] = useSearchParams()
  const sites = useGetAdminSitesQuery({})
  const siteId = params.get('siteId') ?? sites.data?.data[0]?.id ?? ''
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'devices') as Tab
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    next.set(k, v)
    setParams(next, { replace: true })
  }
  const installs = useGetAdminInstallationsQuery({ siteId }, { skip: !siteId })
  const instName = useMemo(() => new Map((installs.data?.data ?? []).map((i) => [i.id, i.name])), [installs.data])

  if (sites.isError) return <QueryError error={sites.error} onRetry={sites.refetch} what='sites' />
  if (sites.data && !sites.data.data.length) return <EmptyState title='No sites yet' description='Create a customer and a site first.' />

  return (
    <div className='flex flex-col gap-4 pb-4'>
      <div className='flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div className='-mx-1 min-w-0 overflow-x-auto px-1'>
          <Tabs items={TABS} value={tab} onChange={(t) => set('tab', t)} label='Solar data sections' />
        </div>
        <select aria-label='Site' className={`${inputClass} sm:w-auto sm:max-w-[320px]`} value={siteId} onChange={(e) => set('siteId', e.target.value)}>
          {sites.data?.data.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.customer.name}
            </option>
          ))}
        </select>
      </div>
      {siteId && tab === 'devices' && <Devices siteId={siteId} instName={instName} />}
      {siteId && tab === 'events' && <Events siteId={siteId} />}
      {siteId && tab === 'metrics' && <Metrics siteId={siteId} />}
    </div>
  )
}

function Devices({ siteId, instName }: { siteId: string; instName: Map<string, string> }) {
  const [kind, setKind] = useState<DeviceKind | ''>('')
  const q = useGetAdminDevicesQuery({ siteId, kind: kind || undefined })
  const rows = q.data?.data
  return (
    <Panel title={rows ? `${rows.length} device${rows.length === 1 ? '' : 's'}` : 'Devices'} toolbar={<SelectFilter<DeviceKind> label='Type' value={kind} onChange={setKind} options={KINDS} />}>
      {q.isError ? (
        <QueryError error={q.error} onRetry={q.refetch} what='devices' />
      ) : (
        <DataTable<AdminDevice>
          rows={rows}
          loading={q.isFetching && !rows}
          rowKey={(d) => d.id}
          pageSize={25}
          empty={{ title: 'No devices reported yet', description: 'Devices are registered automatically from the first SolarBMS message.' }}
          columns={[
            { title: 'Type', key: 'kind', render: (_, d) => KIND_LABEL[d.kind] },
            { title: 'Device ID', key: 'id', render: (_, d) => <Mono className='text-fg'>{d.externalId}</Mono> },
            { title: 'Name / model', key: 'name', render: (_, d) => d.name || [d.manufacturer, d.model].filter(Boolean).join(' ') || '—' },
            { title: 'Belongs to', key: 'parent', render: (_, d) => (d.parentExternalId ? <Mono>{d.parentExternalId}</Mono> : '—') },
            { title: 'Installation', key: 'inst', render: (_, d) => instName.get(d.installationId) ?? <Mono>{d.installationId}</Mono> },
            { title: 'First seen', key: 'first', render: (_, d) => formatDate(d.firstSeenAt) },
            {
              title: 'Last seen',
              key: 'last',
              render: (_, d) => (
                <span className='flex items-center gap-2 whitespace-nowrap' title={formatDate(d.lastSeenAt)}>
                  {ago(d.lastSeenAt)}
                  {d.stale && <StatusBadge tone='warning'>Delayed</StatusBadge>}
                </span>
              ),
            },
          ]}
        />
      )}
    </Panel>
  )
}

function Events({ siteId }: { siteId: string }) {
  const [filter, setFilter] = useState<'all' | 'active'>('all')
  const [severity, setSeverity] = useState<SolarEvent['severity'] | ''>('')
  const q = useGetAdminEventsQuery({ siteId, active: filter === 'active' ? true : undefined, severity: severity || undefined, limit: 200 })
  return (
    <Panel
      title='Events and alarms'
      toolbar={
        <>
          <Segmented<'all' | 'active'>
            options={[
              { id: 'all', label: 'All' },
              { id: 'active', label: 'Active' },
            ]}
            value={filter}
            onChange={setFilter}
            label='Event filter'
          />
          <SelectFilter<SolarEvent['severity']>
            label='Severity'
            value={severity}
            onChange={setSeverity}
            options={[
              { value: 'INFO', label: 'Info' },
              { value: 'WARNING', label: 'Warning' },
              { value: 'ALARM', label: 'Alarm' },
              { value: 'CRITICAL', label: 'Critical' },
            ]}
          />
        </>
      }
    >
      {q.isError ? <QueryError error={q.error} onRetry={q.refetch} what='events' /> : <EventTable events={q.data?.data} loading={q.isFetching && !q.data} />}
    </Panel>
  )
}

function Metrics({ siteId }: { siteId: string }) {
  const [text, setText] = useState('')
  const [kind, setKind] = useState<DeviceKind | ''>('')
  const search = useDebounced(text)
  const q = useGetAdminMetricsQuery({ siteId, kind: kind || undefined, q: search || undefined })
  const rows = q.data?.data
  return (
    <Panel
      title={rows ? `${rows.length} metric${rows.length === 1 ? '' : 's'}` : 'Metric catalogue'}
      toolbar={
        <>
          <SearchInput value={text} onChange={setText} placeholder='Metric key' label='Search metrics' />
          <SelectFilter<DeviceKind> label='Device type' value={kind} onChange={setKind} options={KINDS} />
        </>
      }
    >
      <p className='mb-4 text-[12.5px] leading-relaxed text-muted'>
        Every value this site's SolarBMS systems have reported. New fields are added automatically; the dashboard shows them without code changes.
      </p>
      {q.isError ? (
        <QueryError error={q.error} onRetry={q.refetch} what='metrics' />
      ) : (
        <DataTable<CatalogueMetric>
          rows={rows}
          loading={q.isFetching && !rows}
          rowKey={(m) => m.id}
          pageSize={50}
          empty={{ title: 'No metrics yet' }}
          columns={[
            { title: 'Metric', key: 'label', render: (_, m) => <span className='font-medium text-fg'>{metricMeta(m.key).label}</span> },
            { title: 'Key', key: 'key', render: (_, m) => <Mono>{m.key}</Mono> },
            { title: 'Device type', key: 'kind', render: (_, m) => KIND_LABEL[m.deviceKind] },
            { title: 'Unit', key: 'unit', render: (_, m) => m.unit ?? '—' },
            { title: 'Type', key: 'type', render: (_, m) => m.valueType },
            { title: 'First seen', key: 'first', render: (_, m) => formatDate(m.firstSeenAt) },
            { title: 'Last seen', key: 'last', render: (_, m) => <span title={formatDate(m.lastSeenAt)}>{ago(m.lastSeenAt)}</span> },
          ]}
        />
      )}
    </Panel>
  )
}
