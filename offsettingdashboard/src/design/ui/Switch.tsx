import { cn } from '../cn'

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  size = 'md',
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
  size?: 'sm' | 'md'
}) {
  return (
    <button
      type='button'
      role='switch'
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!checked)
      }}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50',
        size === 'md' ? 'h-6 w-11' : 'h-5 w-9',
        checked ? 'bg-batt' : 'bg-line-strong',
      )}
    >
      <span
        className={cn(
          'inline-block rounded-full bg-white shadow transition-transform duration-200',
          size === 'md' ? 'h-5 w-5' : 'h-4 w-4',
          checked ? (size === 'md' ? 'translate-x-[22px]' : 'translate-x-[18px]') : 'translate-x-0.5',
        )}
      />
    </button>
  )
}
