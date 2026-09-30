import { motion } from 'framer-motion'
import { ReactNode } from 'react'
import { cn } from '../cn'

/** Page title block used at the top of every page body (the app header carries global controls). */
export function PageHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn('flex flex-wrap items-end justify-between gap-3', className)}
    >
      <div className='min-w-0'>
        <h1 className='text-[20px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[22px]'>{title}</h1>
        {description && <p className='mt-1 text-[13.5px] text-fg-2'>{description}</p>}
      </div>
      {action && <div className='flex flex-wrap items-center gap-2'>{action}</div>}
    </motion.div>
  )
}

/** Small uppercase heading that groups cards inside a page. */
export function SectionHeader({ title, action, className }: { title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <h3 className='text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted'>{title}</h3>
      {action}
    </div>
  )
}
