import { translate } from '../../i18n'
import { CircleAlert, Inbox, RefreshCw, WifiOff } from 'lucide-react'
import { ReactNode } from 'react'
import { cn } from '../cn'
import { Button } from './Button'
import { Skeleton } from './Skeleton'

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title?: ReactNode
  description?: ReactNode
  icon?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid place-items-center rounded-lg border border-dashed border-line-strong px-6 py-10 text-center', className)}>
      <div className='flex max-w-sm flex-col items-center'>
        <span className='grid h-10 w-10 place-items-center rounded-full bg-panel-3 text-muted'>{icon ?? <Inbox size={18} />}</span>
        <p className='mt-3 text-[13.5px] font-medium text-fg'>{title ?? translate('common.noData')}</p>
        {description && <p className='mt-1 text-[12.5px] leading-relaxed text-muted'>{description}</p>}
        {action && <div className='mt-4'>{action}</div>}
      </div>
    </div>
  )
}

export function ErrorState({
  title,
  description,
  onRetry,
  offline,
  className,
}: {
  title?: ReactNode
  description?: ReactNode
  onRetry?: () => void
  offline?: boolean
  className?: string
}) {
  return (
    <div role='alert' className={cn('flex flex-col items-center gap-3 rounded-lg border border-danger/25 bg-danger/5 px-5 py-6 text-center sm:flex-row sm:text-left', className)}>
      <span className='grid h-9 w-9 shrink-0 place-items-center rounded-full bg-danger/10 text-danger'>{offline ? <WifiOff size={17} /> : <CircleAlert size={17} />}</span>
      <div className='min-w-0 flex-1'>
        <p className='text-[13.5px] font-medium text-fg'>{title ?? translate('errors.generic')}</p>
        {description && <p className='mt-0.5 text-[12.5px] text-muted'>{description}</p>}
      </div>
      {onRetry && (
        <Button variant='outline' size='sm' onClick={onRetry}>
          <RefreshCw size={13} /> {translate('common.retry')}
        </Button>
      )}
    </div>
  )
}

/** Card-shaped skeleton block list for page-level loading. */
export function LoadingState({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('grid gap-3', className)} aria-busy='true' aria-label={translate('common.loading')}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cn('rounded-xl', i === 0 ? 'h-24' : 'h-40')} />
      ))}
    </div>
  )
}
