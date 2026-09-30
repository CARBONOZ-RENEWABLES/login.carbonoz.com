import { AnimatePresence, motion } from 'framer-motion'
import { ReactNode, RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '../cn'
import { useClickOutside } from '../hooks'

interface TriggerProps {
  open: boolean
  toggle: () => void
  ref: RefObject<HTMLButtonElement>
  'aria-expanded': boolean
  'aria-haspopup': 'menu' | 'dialog'
}

interface PopoverProps {
  trigger: (props: TriggerProps) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  className?: string
  role?: 'menu' | 'dialog'
  label: string
}

/** Anchored popover for menus and panels. Escape / outside click close it; ↑/↓ move between menu items. */
export function Popover({ trigger, children, align = 'right', className, role = 'menu', label }: PopoverProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  const refs = useRef([triggerRef, panelRef] as RefObject<HTMLElement>[]).current
  useClickOutside(refs, close, open)

  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('[role=menuitem],[role=menuitemradio],button,input')?.focus())
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && panelRef.current) {
        const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>('[role=menuitem],[role=menuitemradio]'))
        if (!items.length) return
        e.preventDefault()
        const idx = items.indexOf(document.activeElement as HTMLElement)
        const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length
        items[next].focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className='relative'>
      {trigger({ open, toggle: () => setOpen((o) => !o), ref: triggerRef, 'aria-expanded': open, 'aria-haspopup': role })}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            role={role}
            aria-label={label}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            className={cn(
              'absolute top-[calc(100%+8px)] z-50 min-w-[200px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-line-strong bg-panel p-1.5 shadow-pop',
              align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
              className,
            )}
          >
            {children(close)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function MenuItem({
  children,
  onSelect,
  icon,
  selected,
  danger,
}: {
  children: ReactNode
  onSelect: () => void
  icon?: ReactNode
  selected?: boolean
  danger?: boolean
}) {
  return (
    <button
      type='button'
      role={selected === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] outline-none transition-colors hover:bg-panel-3 focus-visible:bg-panel-3 focus-visible:outline-none',
        danger ? 'text-danger' : selected ? 'text-fg' : 'text-fg-2',
      )}
    >
      {icon && <span className={cn('grid w-4 place-items-center', danger ? 'text-danger' : 'text-muted')}>{icon}</span>}
      <span className='flex-1'>{children}</span>
      {selected && <span className='h-1.5 w-1.5 rounded-full bg-accent' />}
    </button>
  )
}
