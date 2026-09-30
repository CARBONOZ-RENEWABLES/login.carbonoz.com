import { Check, Copy, Search, ShieldAlert } from 'lucide-react'
import { ReactNode, useState } from 'react'
import { Button, Callout, cn, Dialog, ErrorState, inputClass, StatusBadge } from '../../design'
import type { CredentialStatus, IngestStatus, IssuedCredential, SiteStatus } from './api'
import { apiError, CREDENTIAL_BADGE, INGEST_BADGE, LIVE_BADGE } from './model'

/** Admin list/detail container, same surface as the existing admin pages. */
export function Panel({ title, action, toolbar, children, className, id }: { title: ReactNode; action?: ReactNode; toolbar?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn('overflow-hidden rounded-xl border border-line bg-panel shadow-card', className)}>
      <div className='flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5'>
        <h2 className='text-[15px] font-semibold tracking-[-0.01em] text-fg'>{title}</h2>
        {action}
      </div>
      {toolbar && <div className='flex flex-wrap items-end gap-3 border-b border-line px-4 py-3'>{toolbar}</div>}
      <div className='p-4'>{children}</div>
    </section>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search', label = 'Search' }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
  return (
    <label className='relative block w-full sm:w-72'>
      <span className='sr-only'>{label}</span>
      <Search size={15} className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle' aria-hidden />
      <input type='search' value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn(inputClass, 'pl-9')} />
    </label>
  )
}

export function SelectFilter<T extends string>({ label, value, onChange, options }: { label: string; value: T | ''; onChange: (v: T | '') => void; options: { value: T; label: string }[] }) {
  return (
    <label className='block min-w-[150px]'>
      <span className='mb-1 block text-[12px] font-medium text-muted'>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T | '')} className={inputClass}>
        <option value=''>All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Labelled control inside dialogs. */
export function FormField({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className='block'>
      <span className='mb-1 block text-[12.5px] font-medium text-fg-2'>{label}</span>
      {children}
      {hint && <span className='mt-1 block text-[11.5px] leading-relaxed text-muted'>{hint}</span>}
    </label>
  )
}

export const LiveBadge = ({ status }: { status: SiteStatus }) => (
  <StatusBadge tone={LIVE_BADGE[status].tone} dot pulse={status === 'online'}>
    {LIVE_BADGE[status].label}
  </StatusBadge>
)
export const CredentialBadge = ({ status }: { status: CredentialStatus }) => <StatusBadge tone={CREDENTIAL_BADGE[status].tone}>{CREDENTIAL_BADGE[status].label}</StatusBadge>
export const IngestBadge = ({ status }: { status: IngestStatus }) => <StatusBadge tone={INGEST_BADGE[status].tone}>{INGEST_BADGE[status].label}</StatusBadge>

export const Mono = ({ children, className }: { children: ReactNode; className?: string }) => <span className={cn('break-all font-mono text-[12px] text-fg-2', className)}>{children}</span>

export function QueryError({ error, onRetry, what }: { error: unknown; onRetry?: () => void; what: string }) {
  return <ErrorState title={`Could not load ${what}`} description={apiError(error, 'Please try again.')} onRetry={onRetry} />
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older browsers / non-secure contexts.
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  }
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      size='sm'
      variant='outline'
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true)
          setTimeout(() => setDone(false), 2000)
        }
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
      {done ? 'Copied' : label}
    </Button>
  )
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  danger,
  loading,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: ReactNode
  confirmLabel: string
  danger?: boolean
  loading?: boolean
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size='sm'
      footer={
        <>
          <Button variant='ghost' onClick={onClose}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className='text-[13.5px] leading-relaxed text-fg-2'>{description}</div>
    </Dialog>
  )
}

/**
 * Shows a newly issued machine credential. The API key exists only in this
 * response; closing the dialog discards it from the browser.
 */
export function SecretDialog({ issued, installationName, onClose }: { issued: IssuedCredential | null; installationName?: string; onClose: () => void }) {
  const [stored, setStored] = useState(false)
  const close = () => {
    setStored(false)
    onClose()
  }
  const isKey = !!issued?.apiKey
  return (
    <Dialog
      open={!!issued}
      onClose={close}
      title={isKey ? 'New machine credential' : 'Keycloak client registered'}
      description={installationName ? `For installation “${installationName}”` : undefined}
      footer={
        <Button variant='primary' onClick={close} disabled={isKey && !stored}>
          Done
        </Button>
      }
    >
      {issued && (
        <div className='space-y-4'>
          {isKey ? (
            <>
              <Callout tone='accent' className='mb-0' icon={<ShieldAlert size={16} />} title='The credential is shown only once. Store it securely on the SolarBMS Raspberry Pi.'>
                Carbonoz keeps only a hash. If it is lost, rotate the credential and configure the new one.
              </Callout>
              <div>
                <p className='mb-1 text-[12px] font-medium text-muted'>API key</p>
                <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
                  <code className='min-w-0 flex-1 break-all rounded-lg border border-line-strong bg-panel-2 px-3 py-2 font-mono text-[12.5px] text-fg' data-testid='issued-api-key'>
                    {issued.apiKey}
                  </code>
                  <CopyButton text={issued.apiKey!} />
                </div>
              </div>
              <div className='rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-fg-2'>
                The Pi sends it as <Mono>Authorization: Bearer &lt;API key&gt;</Mono> to <Mono>POST https://login.carbonoz.com/api/v1/ingest/solarbms</Mono>.
              </div>
              <label className='flex items-center gap-2 text-[13px] text-fg'>
                <input type='checkbox' checked={stored} onChange={(e) => setStored(e.target.checked)} className='h-4 w-4 accent-[rgb(var(--c-accent))]' />
                I have stored the API key securely
              </label>
            </>
          ) : (
            <div className='space-y-2 text-[13px] leading-relaxed text-fg-2'>
              <p>
                Client <Mono>{issued.clientId}</Mono> may now send data for this installation. Its secret stays in Keycloak (realm <Mono>machines</Mono>); the Pi obtains
                tokens with the client-credentials grant.
              </p>
            </div>
          )}
          {issued.revokedCredentialId && <p className='text-[12.5px] text-muted'>The previous credential was revoked and stops working immediately.</p>}
        </div>
      )}
    </Dialog>
  )
}
