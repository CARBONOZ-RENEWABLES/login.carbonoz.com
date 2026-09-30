import { translate } from '../../i18n'
import { CircleAlert, Inbox, RefreshCw, WifiOff } from 'lucide-react'
import { ReactNode } from 'react'
import { cn } from '../cn'
import { Button } from './Button'

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

/** Brand spinner (same ring as the app loader). */
export function Spinner({ size = 28, className }: { size?: number; className?: string }) {
  return <span className={cn('inline-block shrink-0 animate-spin rounded-full border-2 border-line-strong border-t-accent', className)} style={{ width: size, height: size }} aria-hidden />
}

/**
 * The page loading screen: one spinner centred horizontally and vertically in
 * the page area. Sections inside a page don't show their own loaders.
 * `compact` is for the rare self-contained box (e.g. a dialog).
 */
export function LoadingState({ className, compact }: { rows?: number; className?: string; compact?: boolean }) {
  return (
    <div
      role='status'
      aria-busy='true'
      aria-label={translate('common.loading')}
      className={cn('flex w-full flex-1 flex-col items-center justify-center gap-3', className)}
      style={{ minHeight: compact ? 96 : 'calc(100dvh - 260px)' }}
    >
      <Spinner size={compact ? 22 : 28} />
      <span className='text-[12.5px] text-muted'>{translate('common.loading')}</span>
    </div>
  )
}
