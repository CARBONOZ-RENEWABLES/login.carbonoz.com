import { KeyRound, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Notify from '../../../components/common/notification/notification'
import { Button, LinkButton } from '../../../design'
import { DataTable } from '../../solar/components/tables'
import { CredentialRow, CredentialStatus, IssuedCredential, useGetAdminCredentialsQuery, useRevokeCredentialMutation, useRotateCredentialMutation } from '../api'
import { ago, apiError, CREDENTIAL_TYPE_LABEL, formatDate } from '../model'
import { ConfirmDialog, CredentialBadge, Mono, Panel, QueryError, SearchInput, SecretDialog, SelectFilter } from '../ui'
import { useDebounced } from '../hooks'
import { IssueCredentialDialog } from './CredentialParts'

export default function CredentialsPage() {
  const [params, setParams] = useSearchParams()
  const installationId = params.get('installationId') ?? undefined
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<CredentialStatus | ''>('')
  const search = useDebounced(q)
  const list = useGetAdminCredentialsQuery({ installationId, status: status || undefined, q: search || undefined })
  const rows = list.data?.data
  const [action, setAction] = useState<{ kind: 'rotate' | 'revoke'; cred: CredentialRow } | null>(null)
  const [issued, setIssued] = useState<{ cred: IssuedCredential; name: string } | null>(null)
  const [issuing, setIssuing] = useState(false)
  const [rotate, { isLoading: rotating }] = useRotateCredentialMutation()
  const [revoke, { isLoading: revoking }] = useRevokeCredentialMutation()
  const installation = rows?.[0]?.installation

  const confirm = async () => {
    if (!action) return
    const { kind, cred } = action
    try {
      if (kind === 'rotate') {
        const res = await rotate({ id: cred.id }).unwrap()
        setIssued({ cred: res.data, name: cred.installation.name })
      } else {
        await revoke({ id: cred.id }).unwrap()
        Notify({ message: 'Credential revoked', description: 'It is rejected from now on.' })
      }
    } catch (err) {
      Notify({ type: 'error', message: kind === 'rotate' ? 'Not rotated' : 'Not revoked', description: apiError(err) })
    }
    setAction(null)
  }

  return (
    <div className='pb-4'>
      <Panel
        title={rows ? `${rows.length} machine credential${rows.length === 1 ? '' : 's'}` : 'Machine credentials'}
        action={
          installationId && installation ? (
            <Button variant='primary' onClick={() => setIssuing(true)}>
              <KeyRound size={15} /> Issue credential
            </Button>
          ) : undefined
        }
        toolbar={
          <>
            <SearchInput value={q} onChange={setQ} placeholder='Client ID, label or installation' label='Search credentials' />
            <SelectFilter<CredentialStatus>
              label='Status'
              value={status}
              onChange={setStatus}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'revoked', label: 'Revoked' },
              ]}
            />
            {installationId && (
              <Button size='sm' variant='outline' onClick={() => setParams({})}>
                Installation: {installation?.name ?? 'selected'} <X size={13} />
              </Button>
            )}
          </>
        }
      >
        <p className='mb-4 text-[12.5px] leading-relaxed text-muted'>
          Machine credentials identify a SolarBMS installation, never a person. Each can send data only for its own installation and its registered systemId. Secrets
          are never shown again after they are issued.
        </p>
        {list.isError ? (
          <QueryError error={list.error} onRetry={list.refetch} what='credentials' />
        ) : (
          <DataTable<CredentialRow>
            rows={rows}
            loading={list.isFetching && !rows}
            rowKey={(c) => c.id}
            pageSize={25}
            empty={{ title: 'No credentials', description: 'Issue one from the Installations page.' }}
            columns={[
              {
                title: 'Credential',
                key: 'client',
                render: (_, c) => (
                  <div className='min-w-[160px]'>
                    <Mono className='text-fg'>{c.clientId}</Mono>
                    {c.label && <div className='text-[12px] text-muted'>{c.label}</div>}
                  </div>
                ),
              },
              { title: 'Type', key: 'type', render: (_, c) => CREDENTIAL_TYPE_LABEL[c.type] },
              {
                title: 'Installation',
                key: 'inst',
                render: (_, c) => (
                  <div className='min-w-[140px]'>
                    <span className='text-fg'>{c.installation.name}</span>
                    <div className='text-[12px] text-muted'>
                      {c.installation.site.name} ·{' '}
                      <Link to={`/admin/customers/${c.installation.site.customer.id}`} className='text-accent-ink hover:underline'>
                        {c.installation.site.customer.name}
                      </Link>
                    </div>
                  </div>
                ),
              },
              { title: 'Status', key: 'status', render: (_, c) => <CredentialBadge status={c.status} /> },
              { title: 'Created', key: 'created', render: (_, c) => formatDate(c.createdAt) },
              { title: 'Last used', key: 'used', render: (_, c) => <span title={formatDate(c.lastUsedAt)}>{c.lastUsedAt ? ago(c.lastUsedAt) : 'Never'}</span> },
              { title: 'Revoked', key: 'revoked', render: (_, c) => formatDate(c.revokedAt) },
              {
                title: '',
                key: 'actions',
                render: (_, c) =>
                  c.status === 'active' ? (
                    <div className='flex gap-3 whitespace-nowrap'>
                      {c.type === 'API_KEY' && <LinkButton onClick={() => setAction({ kind: 'rotate', cred: c })}>Rotate</LinkButton>}
                      <LinkButton onClick={() => setAction({ kind: 'revoke', cred: c })}>Revoke</LinkButton>
                    </div>
                  ) : null,
              },
            ]}
          />
        )}
      </Panel>

      <ConfirmDialog
        open={!!action}
        onClose={() => setAction(null)}
        title={action?.kind === 'rotate' ? 'Rotate API key?' : 'Revoke credential?'}
        description={
          action?.kind === 'rotate'
            ? 'A new API key is issued and the current one stops working immediately. Configure the new key on the Raspberry Pi right away; it buffers data until then.'
            : 'The Raspberry Pi using this credential is rejected from now on. This cannot be undone; issue a new credential if needed.'
        }
        confirmLabel={action?.kind === 'rotate' ? 'Rotate key' : 'Revoke'}
        danger
        loading={rotating || revoking}
        onConfirm={confirm}
      />
      <IssueCredentialDialog
        installation={issuing && installation ? { id: installation.id, name: installation.name } : null}
        onClose={() => setIssuing(false)}
        onIssued={(cred) => setIssued({ cred, name: installation?.name ?? '' })}
      />
      <SecretDialog issued={issued?.cred ?? null} installationName={issued?.name} onClose={() => setIssued(null)} />
    </div>
  )
}
