import { formatDate, translate as t } from '../../../i18n'
import { Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useSelector } from 'react-redux'
import { EmptyState, SkeletonRows, StatusBadge, Tone } from '../../../design'
import { RootState } from '../../../lib/redux/store'
import { SolarEvent } from '../api'

/** Thin wrapper so every Solar table uses the app's existing antd table styling. */
export function DataTable<T extends object>({ rows, columns, rowKey, loading, empty, pageSize }: { rows: T[] | undefined; columns: ColumnsType<T>; rowKey: (r: T) => string; loading?: boolean; empty?: { title: string; description?: string }; pageSize?: number }) {
  const darkMode = useSelector((s: RootState) => s.theme.darkMode)
  // No rows yet: keep the space quietly; the page loader is the only spinner.
  if (loading && !rows?.length)
    return <SkeletonRows />
  if (!loading && !rows?.length) return <EmptyState title={empty?.title ?? 'No data available'} description={empty?.description} />
  return (
    <Table<T>
      className={`data_table w-full border-collapse ${darkMode ? 'dark-table' : ''}`}
      dataSource={rows}
      columns={columns}
      rowKey={rowKey}
      loading={false}
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
      empty={{ title: t('solar.events.empty'), description: t('solar.events.emptyHint') }}
      columns={[
        { title: t('solar.table.time'), key: 'ts', render: (_, e) => <span className='tabular text-fg-2'>{formatDate(e.ts, { dateStyle: 'short', timeStyle: 'short' })}</span> },
        { title: t('solar.events.severity'), key: 'severity', render: (_, e) => <StatusBadge tone={SEVERITY[e.severity]}>{t(`solar.severity.${e.severity}`)}</StatusBadge> },
        { title: t('solar.events.event'), key: 'message', render: (_, e) => <span className='font-medium text-fg'>{e.message}</span> },
        { title: t('solar.table.device'), key: 'device', render: (_, e) => <span className='text-fg-2'>{[e.deviceKind && t(`solar.kinds.${e.deviceKind}`), e.deviceExternalId].filter(Boolean).join(' ') || '—'}</span> },
        { title: t('solar.events.state'), key: 'active', render: (_, e) => (e.active ? <StatusBadge tone='critical' dot pulse>{t('solar.events.activeState')}</StatusBadge> : <span className='text-muted'>{t('solar.events.cleared')}</span>) },
      ]}
    />
  )
}
