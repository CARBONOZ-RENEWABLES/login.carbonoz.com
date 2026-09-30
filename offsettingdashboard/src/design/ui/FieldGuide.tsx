import { ChevronDown, Info } from 'lucide-react'
import { ReactNode } from 'react'
import { cn } from '../cn'

/** Collapsible help panel for form field explanations (replaces the static explanation boxes). */
export function FieldGuide({ title = 'Field guide', children, defaultOpen, className }: { title?: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  return (
    <details open={defaultOpen} className={cn('group mb-5 rounded-xl border border-line bg-panel-2/70', className)}>
      <summary className='flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 text-[13px] font-medium text-fg [&::-webkit-details-marker]:hidden'>
        <span className='grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent-ink'>
          <Info size={14} />
        </span>
        <span className='flex-1'>{title}</span>
        <ChevronDown size={16} className='text-muted transition-transform duration-200 group-open:rotate-180' />
      </summary>
      <div className='border-t border-line px-4 pb-4 pt-3 text-[12.5px] leading-relaxed text-muted [&_li]:pl-0 [&_p]:mb-2 [&_strong]:font-medium [&_strong]:text-fg [&_ul]:ml-0 [&_ul]:list-none [&_ul]:space-y-2'>
        {children}
      </div>
    </details>
  )
}

/** Highlighted note for important instructions (e.g. "sign and upload this form"). */
export function Callout({ title, children, icon, tone = 'accent', className }: { title: ReactNode; children: ReactNode; icon?: ReactNode; tone?: 'accent' | 'info'; className?: string }) {
  return (
    <div className={cn('mb-5 flex items-start gap-3 rounded-xl border px-4 py-3.5', tone === 'accent' ? 'border-accent/30 bg-accent/5' : 'border-line bg-panel-2', className)}>
      <span className='mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent-ink'>{icon ?? <Info size={14} />}</span>
      <div className='min-w-0'>
        <p className='text-[13.5px] font-semibold text-fg'>{title}</p>
        <div className='mt-1 text-[12.5px] leading-relaxed text-muted'>{children}</div>
      </div>
    </div>
  )
}
