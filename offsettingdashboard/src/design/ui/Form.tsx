import { ReactNode } from 'react'
import { cn } from '../cn'
import { Card } from './Card'

/** Settings-style section: label column on the left, fields on the right; stacks on phones. */
export function FormSection({
  title,
  description,
  children,
  action,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <Card className={cn('grid gap-4 p-4 sm:p-5 md:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)]', className)}>
      <div className='min-w-0'>
        <h2 className='text-[14px] font-semibold text-fg'>{title}</h2>
        {description && <p className='mt-1 text-[12.5px] leading-relaxed text-muted'>{description}</p>}
        {action && <div className='mt-3'>{action}</div>}
      </div>
      <div className='min-w-0 space-y-3'>{children}</div>
    </Card>
  )
}

/** A row inside a FormSection: label + hint on the left, control on the right. */
export function FormRow({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-line bg-panel-2 px-3.5 py-3', className)}>
      <div className='min-w-0'>
        <p className='text-[13px] text-fg'>{label}</p>
        {hint && <p className='text-[11.5px] text-muted'>{hint}</p>}
      </div>
      {children}
    </div>
  )
}

/** Labelled read-only value, e.g. a credential or a profile field. */
export function Field({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className='text-[11.5px] font-medium text-muted'>{label}</p>
      <div className='mt-1 min-w-0 text-[13.5px] text-fg'>{children}</div>
    </div>
  )
}

export const inputClass =
  'h-9 w-full rounded-lg border border-line-strong bg-panel px-3 text-[13px] text-fg placeholder:text-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15'
