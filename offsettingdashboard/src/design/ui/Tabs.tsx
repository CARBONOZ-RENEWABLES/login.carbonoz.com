import { motion } from 'framer-motion'
import { KeyboardEvent, useId, useRef } from 'react'
import { cn } from '../cn'

export interface TabItem<T extends string> {
  id: T
  label: string
}

/** WAI-ARIA tablist with arrow-key navigation and an animated indicator. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: TabItem<T>[]
  value: T
  onChange: (id: T) => void
  label: string
  className?: string
}) {
  const layoutId = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const onKey = (e: KeyboardEvent, i: number) => {
    let next = -1
    if (e.key === 'ArrowRight') next = (i + 1) % items.length
    if (e.key === 'ArrowLeft') next = (i - 1 + items.length) % items.length
    if (e.key === 'Home') next = 0
    if (e.key === 'End') next = items.length - 1
    if (next >= 0) {
      e.preventDefault()
      refs.current[next]?.focus()
      onChange(items[next].id)
    }
  }

  return (
    <div role='tablist' aria-label={label} className={cn('flex items-center gap-1', className)}>
      {items.map((item, i) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            role='tab'
            type='button'
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn('relative h-8 shrink-0 rounded-lg px-3 text-[12.5px] font-medium transition-colors', active ? 'text-fg' : 'text-muted hover:text-fg-2')}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className='absolute inset-0 rounded-lg border border-line-strong bg-panel-3'
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className='relative'>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Two-to-four option pill switcher (theme, units, view mode). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
  label: string
}) {
  return (
    <div role='radiogroup' aria-label={label} className='flex rounded-lg border border-line-strong p-0.5'>
      {options.map((o) => (
        <button
          key={o.id}
          type='button'
          role='radio'
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn('rounded-md px-3 py-1 text-[12px] font-medium transition-colors', value === o.id ? 'bg-accent text-on-accent' : 'text-muted hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
