import { ArrowLeft, Pencil, Plus, UserPlus } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Notify from '../../../components/common/notification/notification'
import { Button, Card, Dialog, Field, inputClass, LinkButton, PageSkeleton, StatusBadge } from '../../../design'
import { DataTable } from '../../solar/components/tables'
import { CustomerDetail, CustomerType, Member, MemberRole, SiteDetail, useAddMemberMutation, useGetAdminCustomerQuery, useRemoveMemberMutation, useUpdateCustomerMutation } from '../api'
import { ago, apiError, formatDate, personName } from '../model'
import { ConfirmDialog, FormField, LiveBadge, Mono, Panel, QueryError } from '../ui'
import { CreateSiteDialog, SiteActions } from './SiteParts'

const ROLE_LABEL: Record<MemberRole, string> = { OWNER: 'Owner', ADMIN: 'Admin', VIEWER: 'Viewer' }

export default function CustomerDetailPage() {
  const { customerId = '' } = useParams()
  const navigate = useNavigate()
  const q = useGetAdminCustomerQuery(customerId)
  const [editing, setEditing] = useState(false)
  const [addingSite, setAddingSite] = useState(false)
  const c = q.data?.data

  if (q.isLoading) return <PageSkeleton variant='list' />
  if (q.isError || !c) return <QueryError error={q.error} onRetry={q.refetch} what='this customer' />

  return (
    <div className='flex flex-col gap-4 pb-4'>
      <div>
        <Button size='sm' variant='ghost' onClick={() => navigate('/admin/customers')}>
          <ArrowLeft size={14} /> Customers
        </Button>
      </div>

      <Card className='flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5'>
        <div className='grid min-w-0 flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          <Field label='Customer'>
            <span className='text-[16px] font-semibold'>{c.name}</span>
          </Field>
          <Field label='Type'>{c.type === 'COMPANY' ? 'Company' : 'Individual'}</Field>
          <Field label='Customer ID'>
            <Mono>{c.id}</Mono>
          </Field>
          <Field label='Created'>{formatDate(c.createdAt)}</Field>
        </div>
        <Button variant='outline' size='sm' onClick={() => setEditing(true)}>
          <Pencil size={14} /> Edit
        </Button>
      </Card>

      <MembersPanel customer={c} />

      <Panel
        title={`Sites (${c.sites.length})`}
        action={
          <Button variant='primary' size='sm' onClick={() => setAddingSite(true)}>
            <Plus size={15} /> New site
          </Button>
        }
      >
        <DataTable<SiteDetail>
          rows={c.sites}
          rowKey={(s) => s.id}
          empty={{ title: 'No sites yet', description: 'Add a site, then a SolarBMS installation for it.' }}
          columns={[
            {
              title: 'Site',
              key: 'name',
              render: (_, s) => (
                <div>
                  <span className='font-medium text-fg'>{s.name}</span>
                  <div>
                    <Mono className='text-[11px] text-subtle'>{s.id}</Mono>
                  </div>
                </div>
              ),
            },
            { title: 'Location', key: 'loc', render: (_, s) => [s.address, s.country].filter(Boolean).join(', ') || '—' },
            { title: 'Installations', key: 'inst', align: 'right', render: (_, s) => s.installations.length },
            { title: 'Status', key: 'status', render: (_, s) => <LiveBadge status={s.status} /> },
            { title: 'Last reading', key: 'seen', render: (_, s) => <span title={formatDate(s.lastSeenAt)}>{ago(s.lastSeenAt)}</span> },
            { title: 'Created', key: 'created', render: (_, s) => formatDate(s.createdAt, false) },
            { title: '', key: 'actions', render: (_, s) => <SiteActions siteId={s.id} /> },
          ]}
        />
      </Panel>

      {editing && <EditCustomerDialog customer={c} open onClose={() => setEditing(false)} />}
      <CreateSiteDialog customerId={c.id} customerName={c.name} open={addingSite} onClose={() => setAddingSite(false)} />
    </div>
  )
}

function MembersPanel({ customer }: { customer: CustomerDetail }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('VIEWER')
  const [removing, setRemoving] = useState<Member | null>(null)
  const [add, { isLoading: adding }] = useAddMemberMutation()
  const [remove, { isLoading: removingNow }] = useRemoveMemberMutation()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await add({ customerId: customer.id, email: email.trim(), role }).unwrap()
      Notify({ message: 'Member added', description: email.trim() })
      setEmail('')
    } catch (err) {
      Notify({ type: 'error', message: 'Member not added', description: apiError(err) })
    }
  }

  return (
    <Panel title={`Members (${customer.members.length})`}>
      <p className='mb-4 text-[12.5px] leading-relaxed text-muted'>
        Members see this customer's sites in the Solar dashboard. Sign-in (password, OTP) is handled by Keycloak; this list only controls which Carbonoz data an
        account may access.
      </p>
      <form onSubmit={submit} className='mb-4 flex flex-col gap-3 sm:flex-row sm:items-end'>
        <FormField label='Add member by email' hint='The person must already have a Carbonoz account.'>
          <input className={`${inputClass} sm:w-80`} type='email' value={email} onChange={(e) => setEmail(e.target.value)} placeholder='name@example.com' required />
        </FormField>
        <FormField label='Role'>
          <select className={`${inputClass} sm:w-36`} value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
            <option value='VIEWER'>Viewer</option>
            <option value='ADMIN'>Admin</option>
            <option value='OWNER'>Owner</option>
          </select>
        </FormField>
        <Button type='submit' variant='primary' loading={adding} disabled={!email.trim()} className='sm:mb-[18px]'>
          <UserPlus size={15} /> Add
        </Button>
      </form>
      <DataTable<Member>
        rows={customer.members}
        rowKey={(m) => m.id}
        empty={{ title: 'No members', description: 'Nobody can see these sites yet.' }}
        columns={[
          { title: 'Email', key: 'email', render: (_, m) => <span className='font-medium text-fg'>{m.user.email ?? '—'}</span> },
          { title: 'Name', key: 'name', render: (_, m) => personName(m.user) },
          { title: 'Role', key: 'role', render: (_, m) => <StatusBadge tone={m.role === 'OWNER' ? 'solar' : m.role === 'ADMIN' ? 'info' : 'neutral'}>{ROLE_LABEL[m.role]}</StatusBadge> },
          { title: 'Account', key: 'account', render: (_, m) => (m.user.activeStatus ? <StatusBadge tone='good'>Enabled</StatusBadge> : <StatusBadge tone='critical'>Disabled</StatusBadge>) },
          { title: 'Member since', key: 'since', render: (_, m) => formatDate(m.createdAt, false) },
          { title: '', key: 'remove', render: (_, m) => <LinkButton onClick={() => setRemoving(m)}>Remove</LinkButton> },
        ]}
      />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title='Remove member?'
        description={
          <>
            <strong className='text-fg'>{removing?.user.email}</strong> loses access to every site of {customer.name} immediately. Their Carbonoz account is not
            deleted.
          </>
        }
        confirmLabel='Remove member'
        danger
        loading={removingNow}
        onConfirm={async () => {
          if (!removing) return
          try {
            await remove({ customerId: customer.id, userId: removing.userId }).unwrap()
            Notify({ message: 'Member removed', description: removing.user.email ?? undefined })
          } catch (err) {
            Notify({ type: 'error', message: 'Member not removed', description: apiError(err) })
          }
          setRemoving(null)
        }}
      />
    </Panel>
  )
}

function EditCustomerDialog({ customer, open, onClose }: { customer: CustomerDetail; open: boolean; onClose: () => void }) {
  const [name, setName] = useState(customer.name)
  const [type, setType] = useState<CustomerType>(customer.type)
  const [update, { isLoading }] = useUpdateCustomerMutation()
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await update({ id: customer.id, name: name.trim(), type }).unwrap()
      Notify({ message: 'Customer updated' })
      onClose()
    } catch (err) {
      Notify({ type: 'error', message: 'Not saved', description: apiError(err) })
    }
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title='Edit customer'
      footer={
        <>
          <Button variant='ghost' onClick={onClose}>
            Cancel
          </Button>
          <Button variant='primary' type='submit' form='edit-customer' loading={isLoading} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <form id='edit-customer' onSubmit={submit} className='space-y-4'>
        <FormField label='Name'>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required data-autofocus />
        </FormField>
        <FormField label='Type'>
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as CustomerType)}>
            <option value='COMPANY'>Company</option>
            <option value='INDIVIDUAL'>Individual</option>
          </select>
        </FormField>
      </form>
    </Dialog>
  )
}
