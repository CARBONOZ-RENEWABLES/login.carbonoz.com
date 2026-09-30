import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '../../../design'
import { DataTable } from '../../solar/components/tables'
import { SiteRow, useGetAdminSitesQuery } from '../api'
import { ago, formatDate } from '../model'
import { LiveBadge, Mono, Panel, QueryError, SearchInput } from '../ui'
import { useDebounced } from '../hooks'
import { CreateSiteDialog, SiteActions } from './SiteParts'

export default function SitesPage() {
  const [params, setParams] = useSearchParams()
  const customerId = params.get('customerId') ?? undefined
  const [q, setQ] = useState('')
  const search = useDebounced(q)
  const list = useGetAdminSitesQuery({ q: search || undefined, customerId })
  const [creating, setCreating] = useState(false)
  const rows = list.data?.data
  const filteredCustomer = customerId ? rows?.[0]?.customer.name ?? 'this customer' : undefined

  return (
    <div className='pb-4'>
      <Panel
        title={rows ? `${rows.length} site${rows.length === 1 ? '' : 's'}` : 'Sites'}
        action={
          <Button variant='primary' onClick={() => setCreating(true)}>
            <Plus size={16} /> New site
          </Button>
        }
        toolbar={
          <>
            <SearchInput value={q} onChange={setQ} placeholder='Site, customer or site ID' label='Search sites' />
            {customerId && (
              <Button size='sm' variant='outline' onClick={() => setParams({})}>
                Customer: {filteredCustomer} <X size={13} />
              </Button>
            )}
          </>
        }
      >
        {list.isError ? (
          <QueryError error={list.error} onRetry={list.refetch} what='sites' />
        ) : (
          <DataTable<SiteRow>
            rows={rows}
            loading={list.isFetching && !rows}
            rowKey={(s) => s.id}
            pageSize={20}
            empty={{ title: search || customerId ? 'No site matches' : 'No sites yet', description: 'Sites belong to a customer; create one from here or from the customer page.' }}
            columns={[
              {
                title: 'Site',
                key: 'name',
                render: (_, s) => (
                  <div className='min-w-[160px]'>
                    <span className='font-medium text-fg'>{s.name}</span>
                    <div>
                      <Mono className='text-[11px] text-subtle'>{s.id}</Mono>
                    </div>
                  </div>
                ),
              },
              {
                title: 'Customer',
                key: 'customer',
                render: (_, s) => (
                  <Link to={`/admin/customers/${s.customer.id}`} className='text-accent-ink hover:underline'>
                    {s.customer.name}
                  </Link>
                ),
              },
              { title: 'Location', key: 'loc', render: (_, s) => [s.address, s.country].filter(Boolean).join(', ') || '—' },
              { title: 'Installations', key: 'inst', align: 'right', render: (_, s) => s.installationCount },
              { title: 'Status', key: 'status', render: (_, s) => <LiveBadge status={s.status} /> },
              { title: 'Last SolarBMS reading', key: 'seen', render: (_, s) => <span title={formatDate(s.lastSeenAt)}>{ago(s.lastSeenAt)}</span> },
              { title: 'Created', key: 'created', render: (_, s) => formatDate(s.createdAt, false) },
              { title: '', key: 'actions', render: (_, s) => <SiteActions siteId={s.id} /> },
            ]}
          />
        )}
      </Panel>
      <CreateSiteDialog customerId={customerId} open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
