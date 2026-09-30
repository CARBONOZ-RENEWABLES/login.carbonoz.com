import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { ReactNode, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../cn'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-5xl' }

/** Accessible modal: focus trap, Escape to close, focus restore, scroll lock. Bottom sheet on phones. */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md', className }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const raf = requestAnimationFrame(() => {
      const first = panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE)
      first?.focus()
    })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
      if (e.key === 'Tab' && panel.current) {
        const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        if (!items.length) return
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className='fixed inset-0 z-[1000] flex items-end justify-center p-0 sm:items-center sm:p-6'>
          <motion.div
            className='absolute inset-0 bg-black/50 backdrop-blur-[2px]'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            role='dialog'
            aria-modal='true'
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            className={cn('relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line-strong bg-panel shadow-pop sm:rounded-2xl', widths[size], className)}
          >
            <div className='flex items-start justify-between gap-4 border-b border-line px-5 py-4'>
              <div>
                <h2 id={titleId} className='text-[16px] font-semibold text-fg'>
                  {title}
                </h2>
                {description && (
                  <p id={descId} className='mt-0.5 text-[12.5px] text-muted'>
                    {description}
                  </p>
                )}
              </div>
              <button
                type='button'
                onClick={onClose}
                aria-label='Close dialog'
                className='-mr-1 grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-panel-3 hover:text-fg'
              >
                <X size={16} />
              </button>
            </div>
            <div className='min-h-0 flex-1 overflow-y-auto px-5 py-4'>{children}</div>
            {footer && <div className='flex items-center justify-end gap-2 border-t border-line px-5 py-3'>{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
