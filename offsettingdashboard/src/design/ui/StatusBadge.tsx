import { ReactNode } from 'react'
import { cn } from '../cn'

export type Tone = 'good' | 'warning' | 'critical' | 'info' | 'neutral' | 'solar'

const tones: Record<Tone, string> = {
  good: 'bg-batt/10 text-batt border-batt/25',
  warning: 'bg-gridp/10 text-gridp border-gridp/25',
  critical: 'bg-danger/10 text-danger border-danger/25',
  info: 'bg-accent/10 text-accent-ink border-accent/30',
  neutral: 'bg-panel-3 text-muted border-line-strong',
  solar: 'bg-solar/10 text-solar border-solar/30',
}

const dots: Record<Tone, string> = {
  good: 'bg-batt',
  warning: 'bg-gridp',
  critical: 'bg-danger',
  info: 'bg-accent',
  neutral: 'bg-subtle',
  solar: 'bg-solar',
}

export function StatusBadge({ tone = 'neutral', children, dot, pulse, className }: { tone?: Tone; children: ReactNode; dot?: boolean; pulse?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium', tones[tone], className)}>
      {dot && (
        <span className='relative flex h-1.5 w-1.5'>
          {pulse && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', dots[tone])} />}
          <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', dots[tone])} />
        </span>
      )}
      {children}
    </span>
  )
}
