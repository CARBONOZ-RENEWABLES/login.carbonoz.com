import { Cpu, Pencil, Plus, X } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Notify from '../../../components/common/notification/notification'
import { Button, Dialog, inputClass, LinkButton, Switch } from '../../../design'
import { DataTable } from '../../solar/components/tables'
import { InstallationRow, IssuedCredential, useCreateInstallationMutation, useGetAdminInstallationsQuery, useGetAdminSitesQuery, useUpdateInstallationMutation } from '../api'
import { ago, apiError, formatDate } from '../model'
import { ConfirmDialog, FormField, LiveBadge, Mono, Panel, QueryError, SearchInput, SecretDialog } from '../ui'
import { useDebounced } from '../hooks'
import { IssueCredentialDialog } from './CredentialParts'

export default function InstallationsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const siteId = params.get('siteId') ?? undefined
  const [q, setQ] = useState('')
  const search = useDebounced(q)
  const list = useGetAdminInstallationsQuery({ q: search || undefined, siteId })
  const rows = list.data?.data
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<InstallationRow | null>(null)
  const [issuingFor, setIssuingFor] = useState<InstallationRow | null>(null)
  const [issued, setIssued] = useState<{ cred: IssuedCredential; name: string } | null>(null)

  return (
    <div className='pb-4'>
      <Panel
        title={rows ? `${rows.length} installation${rows.length === 1 ? '' : 's'}` : 'Installations'}
        action={
          <Button variant='primary' onClick={() => setCreating(true)}>
            <Plus size={16} /> New installation
          </Button>
        }
        toolbar={
          <>
            <SearchInput value={q} onChange={setQ} placeholder='Name, systemId, site or ID' label='Search installations' />
            {siteId && (
              <Button size='sm' variant='outline' onClick={() => setParams({})}>
                Site: {rows?.[0]?.site.name ?? 'selected'} <X size={13} />
              </Button>
            )}
          </>
        }
      >
        {list.isError ? (
          <QueryError error={list.error} onRetry={list.refetch} what='installations' />
        ) : (
          <DataTable<InstallationRow>
            rows={rows}
            loading={list.isFetching && !rows}
            rowKey={(i) => i.id}
            pageSize={20}
            empty={{ title: 'No installations', description: 'An installation is one SolarBMS system (Raspberry Pi) on a site.' }}
            columns={[
              {
                title: 'Installation',
                key: 'name',
                render: (_, i) => (
                  <div className='min-w-[160px]'>
                    <span className='font-medium text-fg'>{i.name}</span>
                    <div>
                      <Mono className='text-[11px] text-subtle'>{i.id}</Mono>
                    </div>
                  </div>
                ),
              },
              {
                title: 'Site / customer',
                key: 'site',
                render: (_, i) => (
                  <div className='min-w-[140px]'>
                    <span className='text-fg'>{i.site.name}</span>
                    <div>
                      <Link to={`/admin/customers/${i.site.customer.id}`} className='text-[12px] text-accent-ink hover:underline'>
                        {i.site.customer.name}
                      </Link>
                    </div>
                  </div>
                ),
              },
              { title: 'Kind', key: 'kind', render: (_, i) => i.kind },
              { title: 'systemId', key: 'sys', render: (_, i) => (i.externalSystemId ? <Mono>{i.externalSystemId}</Mono> : <span className='text-muted'>any</span>) },
              { title: 'Status', key: 'status', render: (_, i) => <LiveBadge status={i.status} /> },
              { title: 'Last seen', key: 'seen', render: (_, i) => <span title={formatDate(i.lastSeenAt)}>{ago(i.lastSeenAt)}</span> },
              { title: 'Devices', key: 'dev', align: 'right', render: (_, i) => i.deviceCount },
              {
                title: 'Credentials',
                key: 'cred',
                render: (_, i) => (
                  <LinkButton onClick={() => navigate(`/admin/credentials?installationId=${i.id}`)}>
                    {i.activeCredentials} active{i.machineCredentials.length > i.activeCredentials ? ` · ${i.machineCredentials.length - i.activeCredentials} revoked` : ''}
                  </LinkButton>
                ),
              },
              { title: 'Created', key: 'created', render: (_, i) => formatDate(i.createdAt, false) },
              {
                title: '',
                key: 'actions',
                render: (_, i) => (
                  <div className='flex flex-wrap gap-x-3 gap-y-1 whitespace-nowrap'>
                    <LinkButton onClick={() => setIssuingFor(i)}>Issue credential</LinkButton>
                    <LinkButton onClick={() => setEditing(i)}>Edit</LinkButton>
                    <LinkButton onClick={() => navigate(`/admin/solar?siteId=${i.siteId}`)}>Ingestion</LinkButton>
                    <LinkButton onClick={() => navigate(`/admin/dashboard/${i.siteId}`)}>Dashboard</LinkButton>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Panel>

      <CreateInstallationDialog open={creating} presetSiteId={siteId} onClose={() => setCreating(false)} />
      {editing && <EditInstallationDialog installation={editing} onClose={() => setEditing(null)} />}
      <IssueCredentialDialog
        installation={issuingFor}
        onClose={() => setIssuingFor(null)}
        onIssued={(cred) => setIssued({ cred, name: issuingFor?.name ?? '' })}
      />
      <SecretDialog issued={issued?.cred ?? null} installationName={issued?.name} onClose={() => setIssued(null)} />
    </div>
  )
}

function CreateInstallationDialog({ open, presetSiteId, onClose }: { open: boolean; presetSiteId?: string; onClose: () => void }) {
  const sites = useGetAdminSitesQuery({}, { skip: !open })
  const [siteId, setSiteId] = useState(presetSiteId ?? '')
  const [name, setName] = useState('')
  const [systemId, setSystemId] = useState('')
  const [create, { isLoading }] = useCreateInstallationMutation()
  const chosenSite = siteId || presetSiteId || ''
  const close = () => {
    setName('')
    setSystemId('')
    setSiteId(presetSiteId ?? '')
    onClose()
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await create({ siteId: chosenSite, name: name.trim(), externalSystemId: systemId.trim() || undefined }).unwrap()
      Notify({ message: 'Installation created', description: 'Issue a machine credential for its Raspberry Pi next.' })
      close()
    } catch (err) {
      Notify({ type: 'error', message: 'Installation not created', description: apiError(err) })
    }
  }
  return (
    <Dialog
      open={open}
      onClose={close}
      title='New SolarBMS installation'
      description='One installation per SolarBMS system (Raspberry Pi).'
      footer={
        <>
          <Button variant='ghost' onClick={close}>
            Cancel
          </Button>
          <Button variant='primary' type='submit' form='create-installation' loading={isLoading} disabled={!name.trim() || !chosenSite}>
            <Cpu size={15} /> Create installation
          </Button>
        </>
      }
    >
      <form id='create-installation' onSubmit={submit} className='space-y-4'>
        <FormField label='Site'>
          <select className={inputClass} value={chosenSite} onChange={(e) => setSiteId(e.target.value)} required>
            <option value=''>Choose a site</option>
            {sites.data?.data.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.customer.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label='Name'>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder='SolarBMS Pi' required data-autofocus />
        </FormField>
        <FormField
          label='systemId (recommended)'
          hint='The id the SolarBMS system reports in every message. Messages with a different systemId are rejected (409). Leave empty to accept any.'
        >
          <input className={inputClass} value={systemId} onChange={(e) => setSystemId(e.target.value)} maxLength={200} />
        </FormField>
      </form>
    </Dialog>
  )
}

function EditInstallationDialog({ installation, onClose }: { installation: InstallationRow; onClose: () => void }) {
  const [name, setName] = useState(installation.name)
  const [systemId, setSystemId] = useState(installation.externalSystemId ?? '')
  const [active, setActive] = useState(installation.active)
  const [confirming, setConfirming] = useState(false)
  const [update, { isLoading }] = useUpdateInstallationMutation()
  const save = async () => {
    try {
      await update({ id: installation.id, name: name.trim(), externalSystemId: systemId.trim(), active }).unwrap()
      Notify({ message: 'Installation saved', description: active ? undefined : 'Deactivated: its credentials are rejected immediately.' })
      onClose()
    } catch (err) {
      Notify({ type: 'error', message: 'Not saved', description: apiError(err) })
    }
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (installation.active && !active) setConfirming(true)
    else save()
  }
  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title='Edit installation'
        footer={
          <>
            <Button variant='ghost' onClick={onClose}>
              Cancel
            </Button>
            <Button variant='primary' type='submit' form='edit-installation' loading={isLoading} disabled={!name.trim()}>
              <Pencil size={14} /> Save
            </Button>
          </>
        }
      >
        <form id='edit-installation' onSubmit={submit} className='space-y-4'>
          <FormField label='Name'>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required data-autofocus />
          </FormField>
          <FormField label='systemId' hint='Changing it takes effect immediately; the Pi must report the new id.'>
            <input className={inputClass} value={systemId} onChange={(e) => setSystemId(e.target.value)} maxLength={200} placeholder='any' />
          </FormField>
          <div className='flex items-center justify-between rounded-lg border border-line bg-panel-2 px-3.5 py-3'>
            <div>
              <p className='text-[13px] text-fg'>Active</p>
              <p className='text-[11.5px] text-muted'>When off, every credential of this installation is rejected.</p>
            </div>
            <Switch checked={active} onChange={setActive} label='Installation active' />
          </div>
        </form>
      </Dialog>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title='Deactivate installation?'
        description={`“${installation.name}” stops being able to send data right away. Stored data stays; you can reactivate it later.`}
        confirmLabel='Deactivate'
        danger
        loading={isLoading}
        onConfirm={() => {
          setConfirming(false)
          save()
        }}
      />
    </>
  )
}
