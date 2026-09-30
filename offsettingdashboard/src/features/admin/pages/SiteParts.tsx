import { Select } from 'antd'
import { Globe2, MapPin } from 'lucide-react'
import { FormEvent, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Notify from '../../../components/common/notification/notification'
import { Button, Dialog, inputClass, LinkButton, StatusBadge } from '../../../design'
import { SiteRow, useCreateSiteMutation, useGetAdminCustomersQuery, useUpdateSiteTimeZoneMutation } from '../api'
import { apiError, knownTimeZone, timeZoneOptions, utcOffset } from '../model'
import { FormField, Mono } from '../ui'

const TZ_HINT = 'IANA name. Sets the calendar days, months and years of this site’s energy history (DST included).'

/** Searchable IANA time zone picker; the stored value is the IANA name shown. */
export function TimeZoneSelect({ value, onChange, id }: { value: string; onChange: (tz: string) => void; id?: string }) {
  const options = useMemo(() => {
    const now = new Date()
    return timeZoneOptions(value).map((tz) => ({ value: tz, label: tz, offset: utcOffset(tz, now) }))
  }, [value])
  return (
    <Select
      id={id}
      showSearch
      value={value || undefined}
      onChange={onChange}
      placeholder='Search a time zone, e.g. Berlin'
      className='h-9 w-full'
      data-testid='timezone-select'
      options={options}
      optionRender={(o) => (
        <div className='flex items-center justify-between gap-3'>
          <span className='font-mono text-[12.5px]'>{o.data.value}</span>
          <span className='text-[11.5px] text-muted'>{o.data.offset}</span>
        </div>
      )}
      filterOption={(input, o) => `${o?.value ?? ''} ${o?.offset ?? ''}`.toLowerCase().replace(/_/g, ' ').includes(input.toLowerCase().replace(/_/g, ' '))}
      // Inside the dialog, so choosing an option isn't an "outside" click.
      getPopupContainer={(el) => el.parentElement ?? document.body}
      listHeight={280}
    />
  )
}

/** Time zone of a site in the list, with an edit action. Unset or unknown values are shown as such, never repaired. */
export function SiteTimeZone({ site }: { site: Pick<SiteRow, 'id' | 'name' | 'timezone'> }) {
  const [editing, setEditing] = useState(false)
  const tz = site.timezone
  return (
    <div className='flex min-w-[170px] flex-col items-start gap-0.5' data-testid={`site-timezone-${site.id}`}>
      {!tz ? (
        <StatusBadge tone='warning'>Not set · energy uses UTC</StatusBadge>
      ) : knownTimeZone(tz) ? (
        <span>
          <Mono className='text-fg'>{tz}</Mono> <span className='text-[11.5px] text-muted'>{utcOffset(tz)}</span>
        </span>
      ) : (
        <StatusBadge tone='critical'>Invalid: {tz}</StatusBadge>
      )}
      <LinkButton onClick={() => setEditing(true)}>Change</LinkButton>
      {editing && <EditTimeZoneDialog site={site} onClose={() => setEditing(false)} />}
    </div>
  )
}

function EditTimeZoneDialog({ site, onClose }: { site: Pick<SiteRow, 'id' | 'name' | 'timezone'>; onClose: () => void }) {
  const [tz, setTz] = useState(site.timezone && knownTimeZone(site.timezone) ? site.timezone : '')
  const [update, { isLoading }] = useUpdateSiteTimeZoneMutation()
  const changed = !!tz && tz !== site.timezone
  const save = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await update({ siteId: site.id, timezone: tz }).unwrap()
      Notify({ message: 'Time zone changed', description: `${site.name}: ${tz}. Energy history now uses this calendar.` })
      onClose()
    } catch (err) {
      Notify({ type: 'error', message: 'Time zone not changed', description: apiError(err) })
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title='Site time zone'
      description={site.name}
      footer={
        <>
          <Button variant='ghost' onClick={onClose}>
            Cancel
          </Button>
          <Button variant='primary' type='submit' form='edit-timezone' loading={isLoading} disabled={!changed}>
            <Globe2 size={15} /> Save time zone
          </Button>
        </>
      }
    >
      <form id='edit-timezone' onSubmit={save} className='space-y-4'>
        <p className='text-[12.5px] text-muted'>
          Current: {site.timezone ? <Mono className='text-fg'>{site.timezone}</Mono> : 'not set (energy history uses UTC)'}
        </p>
        <FormField label='Time zone' hint={TZ_HINT}>
          <TimeZoneSelect value={tz} onChange={setTz} id='edit-timezone-select' />
        </FormField>
        <p className='rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-[12px] text-fg-2'>
          Stored readings are not changed. Daily, monthly and yearly energy is recalculated from them in the new time zone.
        </p>
      </form>
    </Dialog>
  )
}

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
        timezone: form.timezone,
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
          <Button variant='primary' type='submit' form='create-site' loading={isLoading} disabled={!form.name.trim() || !customerId || !form.timezone}>
            <MapPin size={15} /> Create site
          </Button>
        </>
      }
    >
      <form id='create-site' onSubmit={submit} className='space-y-4'>
        {!fixedCustomer && (
          <FormField label='Customer'>
            <select className={inputClass} value={picked} onChange={(e) => setPicked(e.target.value)} required>
              <option value=''>Choose a customer</option>
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
        </div>
        <FormField label='Time zone' hint={TZ_HINT}>
          <TimeZoneSelect value={form.timezone} onChange={(timezone) => setForm((f) => ({ ...f, timezone }))} id='create-timezone-select' />
        </FormField>
      </form>
    </Dialog>
  )
}
