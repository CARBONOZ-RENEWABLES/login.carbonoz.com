import { Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useSelector } from 'react-redux'
import { EmptyState, StatusBadge, Tone } from '../../../design'
import { RootState } from '../../../lib/redux/store'
import { SolarEvent } from '../api'

/** Thin wrapper so every Solar table uses the app's existing antd table styling. */
export function DataTable<T extends object>({ rows, columns, rowKey, loading, empty, pageSize }: { rows: T[] | undefined; columns: ColumnsType<T>; rowKey: (r: T) => string; loading?: boolean; empty?: { title: string; description?: string }; pageSize?: number }) {
  const darkMode = useSelector((s: RootState) => s.theme.darkMode)
  if (!loading && !rows?.length) return <EmptyState title={empty?.title ?? 'No data available'} description={empty?.description} />
  return (
    <Table<T>
      className={`data_table w-full border-collapse ${darkMode ? 'dark-table' : ''}`}
      dataSource={rows}
      columns={columns}
      rowKey={rowKey}
      loading={loading}
      pagination={pageSize ? { pageSize, hideOnSinglePage: true, showSizeChanger: false } : false}
      bordered={false}
      scroll={{ x: 'max-content' }}
      size='small'
    />
  )
}

const SEVERITY: Record<SolarEvent['severity'], Tone> = { INFO: 'info', WARNING: 'warning', ALARM: 'critical', CRITICAL: 'critical' }

export function EventTable({ events, loading }: { events: SolarEvent[] | undefined; loading?: boolean }) {
  return (
    <DataTable<SolarEvent>
      rows={events}
      loading={loading}
      rowKey={(e) => e.id}
      empty={{ title: 'No events', description: 'Alarms and events reported by your SolarBMS will appear here.' }}
      columns={[
        { title: 'Time', key: 'ts', render: (_, e) => <span className='tabular text-fg-2'>{dayjs(e.ts).format('DD/MM/YYYY HH:mm')}</span> },
        { title: 'Severity', key: 'severity', render: (_, e) => <StatusBadge tone={SEVERITY[e.severity]}>{e.severity.toLowerCase()}</StatusBadge> },
        { title: 'Event', key: 'message', render: (_, e) => <span className='font-medium text-fg'>{e.message}</span> },
        { title: 'Device', key: 'device', render: (_, e) => <span className='text-fg-2'>{[e.deviceKind?.toLowerCase(), e.deviceExternalId].filter(Boolean).join(' ') || '—'}</span> },
        { title: 'State', key: 'active', render: (_, e) => (e.active ? <StatusBadge tone='critical' dot pulse>active</StatusBadge> : <span className='text-muted'>cleared</span>) },
      ]}
    />
  )
}
