import { cn } from '../cn'
import { Card } from './Card'

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton rounded-md', className)} />
}

/** Table rows still loading: shimmer bars, no spinner. */
export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('grid gap-2', className)} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className='h-8 rounded-md' />
      ))}
    </div>
  )
}

/**
 * Placeholder while a page's data loads: the shape of the page with the subtle
 * shimmer, no spinner and no "Loading…" text (the app loader is the only one).
 */
export function PageSkeleton({ variant = 'cards', tabs, cards = 4 }: { variant?: 'cards' | 'list'; tabs?: boolean; cards?: number }) {
  return (
    <div className='flex min-w-0 flex-col gap-4 pb-4' aria-busy='true' data-testid='page-skeleton'>
      {tabs && (
        <div className='flex gap-2 overflow-hidden'>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className='h-9 w-24 shrink-0 rounded-lg' />
          ))}
        </div>
      )}
      {variant === 'cards' && (
        <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
          {Array.from({ length: cards }, (_, i) => (
            <Card key={i} className='flex flex-col gap-3 p-4'>
              <Skeleton className='h-3 w-20' />
              <Skeleton className='h-7 w-28' />
              <Skeleton className='h-3 w-16' />
            </Card>
          ))}
        </div>
      )}
      <Card className='flex flex-col gap-4 p-4'>
        <Skeleton className='h-4 w-40' />
        {variant === 'cards' ? <Skeleton className='h-[280px] w-full rounded-lg' /> : <SkeletonRows rows={6} className='gap-3' />}
      </Card>
    </div>
  )
}
