import { MapPin } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Notify from '../../../components/common/notification/notification'
import { Button, Dialog, inputClass, LinkButton } from '../../../design'
import { useCreateSiteMutation, useGetAdminCustomersQuery } from '../api'
import { apiError } from '../model'
import { FormField } from '../ui'

/** Where an admin goes from a site: the customer dashboard and the operational views. */
export function SiteActions({ siteId }: { siteId: string }) {
  const navigate = useNavigate()
  return (
    <div className='flex flex-wrap gap-x-3 gap-y-1 whitespace-nowrap'>
      <LinkButton onClick={() => navigate(`/admin/dashboard/${siteId}`)}>Dashboard</LinkButton>
      <LinkButton onClick={() => navigate(`/admin/installations?siteId=${siteId}`)}>Installations</LinkButton>
      <LinkButton onClick={() => navigate(`/admin/solar?siteId=${siteId}`)}>Ingestion</LinkButton>
      <LinkButton onClick={() => navigate(`/admin/solar/data?siteId=${siteId}`)}>Devices & events</LinkButton>
    </div>
  )
}

/** `customerId` fixed (customer page) or chosen in the dialog (sites list). */
export function CreateSiteDialog({ customerId: fixedCustomer, customerName, open, onClose }: { customerId?: string; customerName?: string; open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ name: '', address: '', country: '', timezone: 'Europe/Berlin' })
  const [picked, setPicked] = useState('')
  const customers = useGetAdminCustomersQuery({}, { skip: !!fixedCustomer || !open })
  const customerId = fixedCustomer ?? picked
  const [create, { isLoading }] = useCreateSiteMutation()
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const close = () => {
    setForm({ name: '', address: '', country: '', timezone: 'Europe/Berlin' })
    setPicked('')
    onClose()
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await create({
        customerId,
        name: form.name.trim(),
        address: form.address.trim() || undefined,
        country: form.country.trim() || undefined,
        timezone: form.timezone.trim() || undefined,
      }).unwrap()
      Notify({ message: 'Site created', description: form.name.trim() })
      close()
    } catch (err) {
      Notify({ type: 'error', message: 'Site not created', description: apiError(err) })
    }
  }
  return (
    <Dialog
      open={open}
      onClose={close}
      title='New site'
      description={customerName ? `Belongs to ${customerName}. Every member of this customer can see it.` : undefined}
      footer={
        <>
          <Button variant='ghost' onClick={close}>
            Cancel
          </Button>
          <Button variant='primary' type='submit' form='create-site' loading={isLoading} disabled={!form.name.trim() || !customerId}>
            <MapPin size={15} /> Create site
          </Button>
        </>
      }
    >
      <form id='create-site' onSubmit={submit} className='space-y-4'>
        {!fixedCustomer && (
          <FormField label='Customer'>
            <select className={inputClass} value={picked} onChange={(e) => setPicked(e.target.value)} required>
              <option value=''>{customers.isFetching ? 'Loading…' : 'Choose a customer'}</option>
              {customers.data?.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FormField>
        )}
        <FormField label='Name'>
          <input className={inputClass} value={form.name} onChange={set('name')} maxLength={200} required data-autofocus />
        </FormField>
        <FormField label='Address (optional)'>
          <input className={inputClass} value={form.address} onChange={set('address')} />
        </FormField>
        <div className='grid gap-4 sm:grid-cols-2'>
          <FormField label='Country (optional)'>
            <input className={inputClass} value={form.country} onChange={set('country')} />
          </FormField>
          <FormField label='Time zone' hint='IANA name, used for daily energy totals.'>
            <input className={inputClass} value={form.timezone} onChange={set('timezone')} placeholder='Europe/Berlin' />
          </FormField>
        </div>
      </form>
    </Dialog>
  )
}
