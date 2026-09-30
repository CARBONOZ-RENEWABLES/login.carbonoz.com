import { ChevronLeft, ChevronRight, RefreshCw, RotateCcw, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Notify from '../../../components/common/notification/notification'
import { Button, Dialog, Field, LinkButton, SkeletonRows, StatusBadge } from '../../../design'
import { DataTable } from '../../solar/components/tables'
import {
  DeadLetter,
  IngestStatus,
  IngestSummary,
  InstallationStats,
  useGetDeadLettersQuery,
  useGetIngestQuery,
  useGetIngestsQuery,
  useGetInstallationStatsQuery,
  useReprocessIngestMutation,
  useRequeueDeadLetterMutation,
} from '../api'
import { ago, apiError, count, formatDate, prettyJson } from '../model'
import { ConfirmDialog, IngestBadge, LiveBadge, Mono, Panel, QueryError, SearchInput, SelectFilter } from '../ui'
import { useDebounced } from '../hooks'

const PAGE_SIZE = 25

export default function IngestionPage() {
  const [params, setParams] = useSearchParams()
  const siteId = params.get('siteId') ?? undefined
  const status = (params.get('status') as IngestStatus | null) ?? ''
  const installationId = params.get('installationId') ?? ''
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  const stats = useGetInstallationStatsQuery({ siteId }, { pollingInterval: 30_000 })
  const names = useMemo(() => new Map((stats.data?.data ?? []).map((s) => [s.installation.id, s])), [stats.data])
  const siteName = siteId ? stats.data?.data[0]?.site.name : undefined

  return (
    <div className='flex flex-col gap-4 pb-4'>
      {siteId && (
        <div>
          <Button size='sm' variant='outline' onClick={() => setParam('siteId', '')}>
            Site: {siteName ?? 'selected'} <X size={13} />
          </Button>
        </div>
      )}
      <Panel
        title='SolarBMS installations'
        action={
          <Button size='sm' variant='outline' onClick={() => stats.refetch()}>
            <RefreshCw size={14} /> Refresh
          </Button>
        }
      >
        {stats.isError ? (
          <QueryError error={stats.error} onRetry={stats.refetch} what='ingestion status' />
        ) : (
          <DataTable<InstallationStats>
            rows={stats.data?.data}
            loading={stats.isLoading}
            rowKey={(s) => s.installation.id}
            pageSize={20}
            empty={{ title: 'No installations', description: 'Create an installation and issue a machine credential; its messages appear here.' }}
            columns={[
              {
                title: 'Installation',
                key: 'inst',
                render: (_, s) => (
                  <div className='min-w-[150px]'>
                    <span className='font-medium text-fg'>{s.installation.name}</span>
                    <div className='text-[12px] text-muted'>
                      {s.site.name} ·{' '}
                      <Link to={`/admin/customers/${s.customer.id}`} className='text-accent-ink hover:underline'>
                        {s.customer.name}
                      </Link>
                    </div>
                  </div>
                ),
              },
              { title: 'systemId', key: 'sys', render: (_, s) => (s.installation.externalSystemId ? <Mono>{s.installation.externalSystemId}</Mono> : '—') },
              { title: 'Status', key: 'status', render: (_, s) => <LiveBadge status={s.installation.status} /> },
              { title: 'Last received', key: 'rx', render: (_, s) => <span title={formatDate(s.lastReceivedAt)}>{ago(s.lastReceivedAt)}</span> },
              { title: 'Last processed', key: 'px', render: (_, s) => <span title={formatDate(s.lastProcessedAt)}>{ago(s.lastProcessedAt)}</span> },
              {
                title: '24 h',
                key: '24h',
                render: (_, s) => (
                  <span className='whitespace-nowrap tabular-nums'>
                    {s.last24h.processed} ok
                    {s.last24h.failed > 0 && <span className='text-danger'> · {s.last24h.failed} failed</span>}
                  </span>
                ),
              },
              { title: 'Accepted', key: 'acc', align: 'right', render: (_, s) => count(s.accepted) },
              { title: 'Duplicates', key: 'dup', align: 'right', render: (_, s) => count(s.duplicates) },
              { title: 'Failed', key: 'fail', align: 'right', render: (_, s) => <span className={s.failedTotal ? 'text-danger' : undefined}>{s.failedTotal}</span> },
              { title: 'Queued', key: 'q', align: 'right', render: (_, s) => s.queued },
              {
                title: 'Devices',
                key: 'dev',
                render: (_, s) => (
                  <span className='whitespace-nowrap text-[12.5px]'>
                    {s.devices.INVERTER} inv · {s.devices.BATTERY} bat · {s.devices.BMS} BMS
                  </span>
                ),
              },
              { title: 'Cells', key: 'cells', align: 'right', render: (_, s) => s.cells },
              { title: 'Alarms', key: 'alarms', align: 'right', render: (_, s) => (s.activeAlarms ? <StatusBadge tone='critical'>{s.activeAlarms}</StatusBadge> : count(s.activeAlarms)) },
              { title: 'Latest', key: 'latest', render: (_, s) => (s.latest ? <IngestBadge status={s.latest.status} /> : '—') },
              { title: '', key: 'a', render: (_, s) => <LinkButton onClick={() => setParam('installationId', s.installation.id)}>Messages</LinkButton> },
            ]}
          />
        )}
        <p className='mt-3 text-[11.5px] text-subtle'>Accepted and duplicate counts start when this version was deployed; “—” means Redis is not reachable.</p>
      </Panel>

      <IngestRecords
        siteId={siteId}
        status={status}
        installationId={installationId}
        onStatus={(v) => setParam('status', v)}
        onInstallation={(v) => setParam('installationId', v)}
        names={names}
      />

      <DeadLetters />
    </div>
  )
}

function IngestRecords({
  siteId,
  status,
  installationId,
  onStatus,
  onInstallation,
  names,
}: {
  siteId?: string
  status: IngestStatus | ''
  installationId: string
  onStatus: (v: string) => void
  onInstallation: (v: string) => void
  names: Map<string, InstallationStats>
}) {
  const [q, setQ] = useState('')
  const search = useDebounced(q)
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const list = useGetIngestsQuery({ siteId, status: status || undefined, installationId: installationId || undefined, q: search || undefined, page, size: PAGE_SIZE })
  const data = list.data?.data
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    setPage(0)
    fn(v)
  }

  return (
    <Panel
      title={data ? `Messages (${data.total.toLocaleString()})` : 'Messages'}
      toolbar={
        <>
          <SearchInput value={q} onChange={reset(setQ)} placeholder='messageId' label='Search by messageId' />
          <SelectFilter<IngestStatus>
            label='Status'
            value={status}
            onChange={reset(onStatus)}
            options={[
              { value: 'PROCESSED', label: 'Processed' },
              { value: 'QUEUED', label: 'Queued' },
              { value: 'FAILED', label: 'Failed' },
            ]}
          />
          <SelectFilter<string>
            label='Installation'
            value={installationId}
            onChange={reset(onInstallation)}
            options={[...names.values()].map((s) => ({ value: s.installation.id, label: s.installation.name }))}
          />
        </>
      }
    >
      {list.isError ? (
        <QueryError error={list.error} onRetry={list.refetch} what='messages' />
      ) : (
        <>
          <DataTable<IngestSummary>
            rows={data?.items}
            loading={list.isFetching && !data}
            rowKey={(r) => r.id}
            empty={{ title: 'No messages match', description: 'Messages appear here as soon as the Raspberry Pi sends data.' }}
            columns={[
              { title: 'Received', key: 'rx', render: (_, r) => <span className='whitespace-nowrap'>{formatDate(r.receivedAt)}</span> },
              { title: 'messageId', key: 'mid', render: (_, r) => <Mono className='text-fg'>{r.messageId.length > 40 ? `${r.messageId.slice(0, 40)}…` : r.messageId}</Mono> },
              { title: 'Installation', key: 'inst', render: (_, r) => names.get(r.installationId)?.installation.name ?? <Mono>{r.installationId}</Mono> },
              { title: 'Reading time', key: 'src', render: (_, r) => <span className='whitespace-nowrap'>{formatDate(r.sourceTimestamp)}</span> },
              { title: 'Status', key: 'status', render: (_, r) => <IngestBadge status={r.status} /> },
              { title: 'Processed', key: 'px', render: (_, r) => <span className='whitespace-nowrap'>{formatDate(r.processedAt)}</span> },
              {
                title: 'Notes',
                key: 'err',
                render: (_, r) => (r.error ? <span className={`block max-w-[280px] truncate text-[12px] ${r.status === 'FAILED' ? 'text-danger' : 'text-muted'}`} title={r.error}>{r.error}</span> : '—'),
              },
              { title: '', key: 'a', render: (_, r) => <LinkButton onClick={() => setOpen(r.id)}>Inspect</LinkButton> },
            ]}
          />
          {data && data.total > PAGE_SIZE && (
            <div className='mt-3 flex items-center justify-end gap-2 text-[12.5px] text-muted'>
              <span>
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.total)} of {data.total.toLocaleString()}
              </span>
              <Button size='icon-sm' variant='outline' aria-label='Previous page' disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={15} />
              </Button>
              <Button size='icon-sm' variant='outline' aria-label='Next page' disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight size={15} />
              </Button>
            </div>
          )}
        </>
      )}
      {open && <IngestDialog id={open} onClose={() => setOpen(null)} />}
    </Panel>
  )
}

function IngestDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useGetIngestQuery(id)
  const [reprocess, { isLoading }] = useReprocessIngestMutation()
  const r = q.data?.data
  return (
    <Dialog
      open
      onClose={onClose}
      size='lg'
      title='SolarBMS message'
      description={r ? r.messageId : undefined}
      footer={
        <>
          <Button variant='ghost' onClick={onClose}>
            Close
          </Button>
          <Button
            variant='primary'
            loading={isLoading}
            disabled={!r}
            onClick={async () => {
              try {
                const res = await reprocess({ id }).unwrap()
                Notify({
                  type: res.data.status === 'FAILED' ? 'error' : 'success',
                  message: res.data.status === 'FAILED' ? 'Reprocessing failed' : 'Reprocessed',
                  description: res.data.error ?? 'Derived data was rebuilt from the stored raw payload.',
                })
                q.refetch()
              } catch (err) {
                Notify({ type: 'error', message: 'Not reprocessed', description: apiError(err) })
              }
            }}
          >
            <RotateCcw size={14} /> Reprocess
          </Button>
        </>
      }
    >
      {q.isLoading ? (
        <SkeletonRows rows={6} />
      ) : q.isError || !r ? (
        <QueryError error={q.error} onRetry={q.refetch} what='this message' />
      ) : (
        <div className='space-y-4'>
          <div className='grid gap-3 sm:grid-cols-3'>
            <Field label='Status'>
              <IngestBadge status={r.status} />
            </Field>
            <Field label='Installation'>{r.installation ? `${r.installation.name} · ${r.installation.site.name}` : <Mono>{r.installationId}</Mono>}</Field>
            <Field label='systemId'>{r.installation?.externalSystemId ?? '—'}</Field>
            <Field label='Received'>{formatDate(r.receivedAt)}</Field>
            <Field label='Reading time'>{formatDate(r.sourceTimestamp)}</Field>
            <Field label='Processed'>{formatDate(r.processedAt)}</Field>
            <Field label='Schema version'>{r.schemaVersion ?? '—'}</Field>
            <Field label='Record ID'>
              <Mono>{r.id}</Mono>
            </Field>
          </div>
          {r.error && (
            <div className={`rounded-lg border px-3 py-2.5 text-[12.5px] ${r.status === 'FAILED' ? 'border-danger/30 bg-danger/5 text-danger' : 'border-line bg-panel-2 text-fg-2'}`}>
              <p className='font-medium'>{r.status === 'FAILED' ? 'Failure reason' : 'Normalizer notes'}</p>
              <p className='mt-1 whitespace-pre-wrap break-words'>{r.error}</p>
            </div>
          )}
          <div>
            <p className='mb-1 text-[12px] font-medium text-muted'>Stored payload</p>
            <pre className='max-h-[360px] overflow-auto rounded-lg border border-line bg-panel-2 p-3 font-mono text-[11.5px] leading-relaxed text-fg'>{prettyJson(r.payload)}</pre>
          </div>
          {r.rawText && (
            <div>
              <p className='mb-1 text-[12px] font-medium text-muted'>Original message (field names had to be rewritten for storage)</p>
              <pre className='max-h-[200px] overflow-auto rounded-lg border border-line bg-panel-2 p-3 font-mono text-[11.5px] text-fg'>{r.rawText}</pre>
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}

function DeadLetters() {
  const q = useGetDeadLettersQuery()
  const [requeue, { isLoading }] = useRequeueDeadLetterMutation()
  const [target, setTarget] = useState<DeadLetter | null>(null)
  const [view, setView] = useState<DeadLetter | null>(null)
  const d = q.data?.data
  return (
    <Panel id='dead-letters' title={d ? `Dead letters (${d.stored.length})` : 'Dead letters'}>
      <p className='mb-4 text-[12.5px] leading-relaxed text-muted'>
        Messages the worker gave up on after repeated failures. They are kept verbatim; requeue one after fixing the cause.
        {d && d.redisFallback.length > 0 && ` ${d.redisFallback.length} more are in the Redis fallback stream (MongoDB was unavailable when they failed).`}
      </p>
      {q.isError ? (
        <QueryError error={q.error} onRetry={q.refetch} what='dead letters' />
      ) : (
        <DataTable<DeadLetter>
          rows={d?.stored}
          loading={q.isLoading}
          rowKey={(r) => r.id}
          pageSize={10}
          empty={{ title: 'No dead letters', description: 'Every message was processed or is still being retried.' }}
          columns={[
            { title: 'Failed at', key: 'at', render: (_, r) => <span className='whitespace-nowrap'>{formatDate(r.createdAt)}</span> },
            { title: 'messageId', key: 'mid', render: (_, r) => <Mono>{r.messageId ?? '—'}</Mono> },
            { title: 'Attempts', key: 'n', align: 'right', render: (_, r) => r.deliveries },
            { title: 'Error', key: 'err', render: (_, r) => <span className='block max-w-[320px] truncate text-[12px] text-danger' title={r.error ?? ''}>{r.error ?? '—'}</span> },
            {
              title: '',
              key: 'a',
              render: (_, r) => (
                <div className='flex gap-3 whitespace-nowrap'>
                  <LinkButton onClick={() => setView(r)}>View</LinkButton>
                  {r.installationId && r.siteId && r.messageId && <LinkButton onClick={() => setTarget(r)}>Requeue</LinkButton>}
                </div>
              ),
            },
          ]}
        />
      )}
      <ConfirmDialog
        open={!!target}
        onClose={() => setTarget(null)}
        title='Requeue message?'
        description='The original message goes back onto the ingestion stream and is processed again.'
        confirmLabel='Requeue'
        loading={isLoading}
        onConfirm={async () => {
          if (!target) return
          try {
            await requeue({ id: target.id }).unwrap()
            Notify({ message: 'Requeued', description: target.messageId ?? undefined })
          } catch (err) {
            Notify({ type: 'error', message: 'Not requeued', description: apiError(err) })
          }
          setTarget(null)
        }}
      />
      <Dialog open={!!view} onClose={() => setView(null)} title='Dead-lettered message' description={view?.messageId ?? undefined} size='lg'>
        {view && (
          <div className='space-y-3'>
            <p className='text-[12.5px] text-danger'>{view.error}</p>
            <pre className='max-h-[400px] overflow-auto rounded-lg border border-line bg-panel-2 p-3 font-mono text-[11.5px] text-fg'>{view.rawText}</pre>
          </div>
        )}
      </Dialog>
    </Panel>
  )
}
