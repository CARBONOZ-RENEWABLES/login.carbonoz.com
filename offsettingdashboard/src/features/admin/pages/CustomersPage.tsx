import { Building2, Plus } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Notify from '../../../components/common/notification/notification'
import { Button, Dialog, inputClass, LinkButton } from '../../../design'
import { DataTable } from '../../solar/components/tables'
import { CustomerRow, CustomerType, useAddMemberMutation, useCreateCustomerMutation, useGetAdminCustomersQuery } from '../api'
import { ago, apiError, formatDate } from '../model'
import { FormField, LiveBadge, Mono, Panel, QueryError, SearchInput } from '../ui'
import { useDebounced } from '../hooks'

export default function CustomersPage() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const search = useDebounced(q)
  const list = useGetAdminCustomersQuery({ q: search || undefined })
  const [creating, setCreating] = useState(false)
  const rows = list.data?.data

  return (
    <div className='pb-4'>
      <Panel
        title={rows ? `${rows.length} customer${rows.length === 1 ? '' : 's'}` : 'Customers'}
        action={
          <Button variant='primary' onClick={() => setCreating(true)}>
            <Plus size={16} /> New customer
          </Button>
        }
        toolbar={<SearchInput value={q} onChange={setQ} placeholder='Name or customer ID' label='Search customers' />}
      >
        {list.isError ? (
          <QueryError error={list.error} onRetry={list.refetch} what='customers' />
        ) : (
          <DataTable<CustomerRow>
            rows={rows}
            loading={list.isFetching && !rows}
            rowKey={(c) => c.id}
            pageSize={20}
            empty={{ title: search ? 'No customer matches this search' : 'No customers yet', description: search ? undefined : 'Create a customer, then add a site and a SolarBMS installation.' }}
            columns={[
              {
                title: 'Customer',
                key: 'name',
                render: (_, c) => (
                  <div className='min-w-[180px]'>
                    <Link to={`/admin/customers/${c.id}`} className='font-medium text-accent-ink hover:underline'>
                      {c.name}
                    </Link>
                    <div>
                      <Mono className='text-[11px] text-subtle'>{c.id}</Mono>
                    </div>
                  </div>
                ),
              },
              { title: 'Type', key: 'type', render: (_, c) => (c.type === 'COMPANY' ? 'Company' : 'Individual') },
              { title: 'Members', key: 'members', align: 'right', render: (_, c) => c.memberCount },
              { title: 'Sites', key: 'sites', align: 'right', render: (_, c) => c.siteCount },
              { title: 'Installations', key: 'inst', align: 'right', render: (_, c) => c.installationCount },
              { title: 'Status', key: 'status', render: (_, c) => <LiveBadge status={c.status} /> },
              { title: 'Created', key: 'created', render: (_, c) => formatDate(c.createdAt, false) },
              { title: 'Last activity', key: 'activity', render: (_, c) => <span title={formatDate(c.lastActivityAt)}>{ago(c.lastActivityAt)}</span> },
              {
                title: '',
                key: 'actions',
                render: (_, c) => (
                  <div className='flex gap-3 whitespace-nowrap'>
                    <LinkButton onClick={() => navigate(`/admin/customers/${c.id}`)}>Manage</LinkButton>
                    <LinkButton onClick={() => navigate(`/admin/sites?customerId=${c.id}`)}>Sites</LinkButton>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Panel>
      <CreateCustomerDialog open={creating} onClose={() => setCreating(false)} onCreated={(id) => navigate(`/admin/customers/${id}`)} />
    </div>
  )
}

function CreateCustomerDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<CustomerType>('COMPANY')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [create, { isLoading }] = useCreateCustomerMutation()
  const [addMember, { isLoading: adding }] = useAddMemberMutation()

  const reset = () => {
    setName('')
    setType('COMPANY')
    setOwnerEmail('')
    onClose()
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    let id: string
    try {
      id = (await create({ name: name.trim(), type }).unwrap()).data.id
    } catch (err) {
      Notify({ type: 'error', message: 'Customer not created', description: apiError(err) })
      return
    }
    if (ownerEmail.trim()) {
      try {
        await addMember({ customerId: id, email: ownerEmail.trim(), role: 'OWNER' }).unwrap()
      } catch (err) {
        Notify({ type: 'warning', message: 'Customer created without owner', description: `${apiError(err)}. Add the member on the customer page once the account exists.` })
        reset()
        onCreated(id)
        return
      }
    }
    Notify({ message: 'Customer created', description: name.trim() })
    reset()
    onCreated(id)
  }

  return (
    <Dialog
      open={open}
      onClose={reset}
      title='New customer'
      description='A customer owns sites. People get access by being members of the customer.'
      footer={
        <>
          <Button variant='ghost' onClick={reset}>
            Cancel
          </Button>
          <Button variant='primary' type='submit' form='create-customer' loading={isLoading || adding} disabled={!name.trim()}>
            <Building2 size={15} /> Create customer
          </Button>
        </>
      }
    >
      <form id='create-customer' onSubmit={submit} className='space-y-4'>
        <FormField label='Name'>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required data-autofocus />
        </FormField>
        <FormField label='Type'>
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as CustomerType)}>
            <option value='COMPANY'>Company</option>
            <option value='INDIVIDUAL'>Individual</option>
          </select>
        </FormField>
        <FormField label='Owner (optional)' hint='Email of an existing Carbonoz account. It becomes OWNER of this customer. You can add more members later.'>
          <input className={inputClass} type='email' value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder='name@example.com' />
        </FormField>
      </form>
    </Dialog>
  )
}
