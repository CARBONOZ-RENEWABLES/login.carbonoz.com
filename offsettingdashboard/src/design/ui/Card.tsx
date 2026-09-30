import { forwardRef, HTMLAttributes, ReactNode } from 'react'
import { cn } from '../cn'

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { interactive?: boolean }>(
  ({ className, interactive, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-xl border border-line bg-panel shadow-card',
        interactive && 'transition-[border-color,transform,background-color] duration-200 hover:-translate-y-px hover:border-line-strong',
        className,
      )}
      {...props}
    />
  ),
)
Card.displayName = 'Card'

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
  className,
  id,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  className?: string
  id?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className='flex min-w-0 items-center gap-2.5'>
        {icon && <span className='grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-panel-3 text-fg-2'>{icon}</span>}
        <div className='min-w-0'>
          <h2 id={id} className='truncate text-[15px] font-semibold tracking-[-0.01em] text-fg'>
            {title}
          </h2>
          {subtitle && <p className='mt-0.5 truncate text-[12px] text-muted'>{subtitle}</p>}
        </div>
      </div>
      {action && <div className='flex shrink-0 items-center gap-2'>{action}</div>}
    </div>
  )
}

export function LinkButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type='button' className={cn('rounded text-[11.5px] font-medium text-accent-ink transition-colors hover:text-fg', className)} {...props}>
      {children}
    </button>
  )
}
