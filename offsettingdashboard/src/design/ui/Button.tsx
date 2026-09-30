import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '../cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'brand'
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover shadow-[0_6px_18px_-8px_rgb(var(--c-accent)/0.8)]',
  brand: 'bg-brand text-[#1a1402] hover:brightness-95 shadow-[0_6px_18px_-8px_rgb(var(--c-brand)/0.9)]',
  secondary: 'bg-panel-3 text-fg-2 hover:text-fg hover:bg-line-strong/60 border border-line-strong/60',
  outline: 'border border-line-strong bg-panel/40 text-fg-2 hover:text-fg hover:border-subtle hover:bg-panel-2',
  ghost: 'text-muted hover:text-fg hover:bg-panel-3',
  danger: 'bg-danger/10 text-danger hover:bg-danger/20 border border-danger/25',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[12px] gap-1.5 rounded-lg',
  md: 'h-9 px-4 text-[13px] gap-2 rounded-lg',
  lg: 'h-11 px-5 text-[14px] gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-lg',
  'icon-sm': 'h-8 w-8 rounded-lg',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', loading, className, type = 'button', disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-[background-color,color,border-color,transform,box-shadow,filter] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <span className='h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent' aria-hidden />}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'

/** Square icon button used in toolbars (refresh, fullscreen …). */
export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(
  ({ label, className, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line-strong bg-panel/40 text-muted transition-colors hover:border-subtle hover:text-fg disabled:opacity-50 aria-pressed:border-accent aria-pressed:text-accent-ink',
        className,
      )}
      {...props}
    />
  ),
)
IconButton.displayName = 'IconButton'
