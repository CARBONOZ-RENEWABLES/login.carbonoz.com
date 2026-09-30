import { AlertTriangle, Building2, Cpu, Database, Inbox, RefreshCw, Server, Workflow } from 'lucide-react'
import { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, CardHeader, PageSkeleton, StatusBadge } from '../../../design'
import { useGetAdminCustomersQuery, useGetAdminSitesQuery, useGetSolarHealthQuery } from '../api'
import { ago, count } from '../model'
import { QueryError } from '../ui'

function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'good' | 'warning' | 'critical' }) {
  const color = tone === 'critical' ? 'text-danger' : tone === 'warning' ? 'text-gridp' : tone === 'good' ? 'text-batt' : 'text-fg'
  return (
    <div className='min-w-0'>
      <p className='text-[11.5px] font-medium text-muted'>{label}</p>
      <p className={`mt-0.5 text-[20px] font-semibold tabular-nums tracking-[-0.02em] ${color}`}>{value}</p>
      {hint && <p className='text-[11.5px] text-subtle'>{hint}</p>}
    </div>
  )
}

const Ok = ({ ok, label }: { ok: boolean; label?: string }) => (
  <StatusBadge tone={ok ? 'good' : 'critical'} dot>
    {label ?? (ok ? 'Connected' : 'Unavailable')}
  </StatusBadge>
)

/** Admin landing for SolarBMS: pipeline health and where to look next. */
export default function OverviewPage() {
  const navigate = useNavigate()
  const health = useGetSolarHealthQuery(undefined, { pollingInterval: 30_000 })
  const customers = useGetAdminCustomersQuery({})
  const sites = useGetAdminSitesQuery({})
  const h = health.data?.data

  if (health.isLoading) return <PageSkeleton cards={3} />
  if (health.isError || !h) return <QueryError error={health.error} onRetry={health.refetch} what='system health' />

  const failed24 = h.ingests24h.FAILED
  const deadLetters = (h.deadLetters.stored ?? 0) + (h.deadLetters.redisFallback ?? 0)
  const backlog = h.stream.length ?? 0

  return (
    <div className='flex flex-col gap-4 pb-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-[12.5px] text-muted'>
          Checked {ago(h.checkedAt)} · last SolarBMS message {ago(h.lastReceivedAt)} · readings older than {Math.round(h.staleAfterSeconds / 60)} min count as offline
        </p>
        <Button size='sm' variant='outline' onClick={() => health.refetch()}>
          <RefreshCw size={14} /> Refresh
        </Button>
      </div>

      {(failed24 > 0 || deadLetters > 0 || !h.mongo.ok || !h.redis.ok) && (
        <Card className='flex flex-wrap items-center gap-3 border-danger/30 bg-danger/5 p-4'>
          <AlertTriangle size={18} className='text-danger' />
          <p className='flex-1 text-[13px] text-fg'>
            {!h.mongo.ok && 'MongoDB is unreachable. '}
            {!h.redis.ok && 'Redis is unreachable: ingestion answers 503 and the Pi buffers. '}
            {failed24 > 0 && `${failed24} message(s) failed in the last 24 h. `}
            {deadLetters > 0 && `${deadLetters} message(s) are in the dead-letter store.`}
          </p>
          <Button size='sm' variant='outline' onClick={() => navigate('/admin/solar?status=FAILED')}>
            Review ingestion
          </Button>
        </Card>
      )}

      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
        <Card className='p-4'>
          <CardHeader title='Installations' icon={<Cpu size={16} />} />
          <div className='mt-3 grid grid-cols-2 gap-4'>
            <Stat label='Online' value={h.installations.online} tone={h.installations.online ? 'good' : undefined} />
            <Stat label='Offline' value={h.installations.offline} tone={h.installations.offline ? 'warning' : undefined} />
            <Stat label='No data yet' value={h.installations.never} />
            <Stat label='Deactivated' value={h.installations.inactive} />
          </div>
          <Button size='sm' variant='ghost' className='mt-3' onClick={() => navigate('/admin/installations')}>
            Manage installations
          </Button>
        </Card>

        <Card className='p-4'>
          <CardHeader title='Ingestion · last 24 h' icon={<Inbox size={16} />} />
          <div className='mt-3 grid grid-cols-3 gap-4'>
            <Stat label='Processed' value={count(h.ingests24h.PROCESSED)} />
            <Stat label='Queued' value={count(h.ingests24h.QUEUED)} />
            <Stat label='Failed' value={count(failed24)} tone={failed24 ? 'critical' : undefined} />
          </div>
          <Button size='sm' variant='ghost' className='mt-3' onClick={() => navigate('/admin/solar')}>
            Open ingestion
          </Button>
        </Card>

        <Card className='p-4'>
          <CardHeader title='Stream and worker' icon={<Workflow size={16} />} action={<Ok ok={h.worker.enabled && !!h.worker.consumerGroup} label={h.worker.enabled ? (h.worker.consumerGroup ? 'Running' : 'Starting') : 'Disabled here'} />} />
          <div className='mt-3 grid grid-cols-3 gap-4'>
            <Stat label='Backlog' value={count(h.stream.length)} tone={backlog > 1000 ? 'warning' : undefined} hint='entries in stream' />
            <Stat label='Pending' value={count(h.stream.pending)} hint='being processed' />
            <Stat label='Workers' value={count(h.worker.consumers)} />
          </div>
        </Card>

        <Card className='p-4'>
          <CardHeader title='Dead letters' icon={<AlertTriangle size={16} />} />
          <div className='mt-3 grid grid-cols-2 gap-4'>
            <Stat label='Stored (MongoDB)' value={count(h.deadLetters.stored)} tone={h.deadLetters.stored ? 'critical' : undefined} />
            <Stat label='Fallback (Redis)' value={count(h.deadLetters.redisFallback)} tone={h.deadLetters.redisFallback ? 'critical' : undefined} />
          </div>
          <p className='mt-2 text-[11.5px] text-subtle'>Messages that failed permanently after repeated attempts. They are kept verbatim and can be requeued.</p>
        </Card>

        <Card className='p-4'>
          <CardHeader title='Databases' icon={<Database size={16} />} />
          <div className='mt-3 space-y-2.5 text-[13px]'>
            <div className='flex items-center justify-between'>
              <span className='text-fg-2'>MongoDB</span>
              <span className='flex items-center gap-2'>
                {h.mongo.latencyMs != null && <span className='text-[12px] tabular-nums text-muted'>{h.mongo.latencyMs} ms</span>}
                <Ok ok={h.mongo.ok} />
              </span>
            </div>
            <div className='flex items-center justify-between'>
              <span className='text-fg-2'>Redis</span>
              <Ok ok={h.redis.ok} />
            </div>
          </div>
        </Card>

        <Card className='p-4'>
          <CardHeader title='Customers and sites' icon={<Building2 size={16} />} />
          <div className='mt-3 grid grid-cols-2 gap-4'>
            <Stat label='Customers' value={customers.data ? customers.data.data.length : '—'} />
            <Stat label='Sites' value={sites.data ? sites.data.data.length : '—'} />
          </div>
          <div className='mt-3 flex flex-wrap gap-1'>
            <Button size='sm' variant='ghost' onClick={() => navigate('/admin/customers')}>
              Customers
            </Button>
            <Button size='sm' variant='ghost' onClick={() => navigate('/admin/sites')}>
              <Server size={14} /> Sites
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
