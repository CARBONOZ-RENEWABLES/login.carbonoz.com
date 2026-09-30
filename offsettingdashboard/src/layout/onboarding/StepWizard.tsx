import { AnimatePresence, motion } from 'framer-motion'
import { Check, LucideIcon, ShieldCheck } from 'lucide-react'
import { ReactNode } from 'react'
import { cn } from '../../design'
import { OnboardingTopBar } from '../OnboardingTopBar'

export interface WizardStep {
  title: string
  description: string
  icon: LucideIcon
}

interface StepWizardProps {
  /** Name of the flow, e.g. "Set up your system". */
  flowTitle: string
  flowDescription: string
  steps: WizardStep[]
  current: number
  firstName?: string
  lastName?: string
  loading?: boolean
  children: ReactNode
  /** Action buttons (Previous / Next / Save). Rendered inline on desktop, sticky at the bottom on phones. */
  actions: ReactNode
}

function StepList({ steps, current }: { steps: WizardStep[]; current: number }) {
  return (
    <ol className='relative space-y-1'>
      {steps.map((s, i) => {
        const done = i < current
        const active = i === current
        const Icon = s.icon
        return (
          <li key={s.title} className='relative'>
            {i < steps.length - 1 && <span aria-hidden className={cn('absolute left-[19px] top-[42px] h-[calc(100%-30px)] w-px', done ? 'bg-accent' : 'bg-line-strong')} />}
            <div aria-current={active ? 'step' : undefined} className={cn('flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors', active && 'bg-accent/10')}>
              <span
                className={cn(
                  'relative z-10 grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full border-2 transition-colors',
                  done && 'border-accent bg-accent text-on-accent',
                  active && 'border-accent bg-panel text-accent-ink',
                  !done && !active && 'border-line-strong bg-panel text-subtle',
                )}
              >
                {done ? <Check size={17} strokeWidth={3} /> : <Icon size={16} />}
              </span>
              <span className='min-w-0 pt-0.5'>
                <span className={cn('block text-[13px] font-medium', active ? 'text-fg' : done ? 'text-fg-2' : 'text-muted')}>{s.title}</span>
                <span className='mt-0.5 block text-[11.5px] leading-snug text-subtle'>{s.description}</span>
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** Responsive registration wizard: progress rail on desktop, compact progress + sticky actions on phones. */
export function StepWizard({ flowTitle, flowDescription, steps, current, firstName, lastName, loading, children, actions }: StepWizardProps) {
  const step = steps[current] ?? steps[0]
  const pct = Math.round((current / steps.length) * 100)
  const Icon = step.icon
  return (
    <div className='flex h-dvh flex-col overflow-hidden'>
      <OnboardingTopBar firstName={firstName} lastName={lastName} />
      <div className='min-h-0 flex-1 overflow-y-auto'>
        <div className='mx-auto grid w-full max-w-[1240px] gap-6 px-4 pb-32 pt-5 sm:px-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:pb-10 lg:pt-8'>
          {/* Desktop progress rail */}
          <aside className='hidden lg:block'>
            <div className='sticky top-6 rounded-2xl border border-line bg-panel p-5 shadow-card'>
              <p className='text-[15px] font-semibold tracking-[-0.01em] text-fg'>{flowTitle}</p>
              <p className='mt-1 text-[12.5px] leading-relaxed text-muted'>{flowDescription}</p>
              <div className='mt-4 flex items-center gap-3'>
                <span className='relative h-1.5 flex-1 overflow-hidden rounded-full bg-line-strong'>
                  <motion.span className='absolute inset-y-0 left-0 rounded-full bg-accent' initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.4 }} />
                </span>
                <span className='tabular text-[12px] font-medium text-fg-2'>{pct}%</span>
              </div>
              <div className='mt-5'>
                <StepList steps={steps} current={current} />
              </div>
              <p className='mt-5 flex items-start gap-2 border-t border-line pt-4 text-[11.5px] leading-relaxed text-muted'>
                <ShieldCheck size={14} className='mt-0.5 shrink-0 text-batt' />
                Your answers are saved after each step, so you can come back and continue later.
              </p>
            </div>
          </aside>

          <div className='min-w-0'>
            {/* Phone progress */}
            <div className='mb-4 lg:hidden'>
              <div className='flex items-center justify-between text-[12px]'>
                <span className='font-medium text-accent-ink'>
                  Step {current + 1} of {steps.length}
                </span>
                <span className='text-muted'>{flowTitle}</span>
              </div>
              <div className='mt-2 flex gap-1.5' aria-hidden>
                {steps.map((s, i) => (
                  <span key={s.title} className={cn('h-1.5 flex-1 rounded-full transition-colors', i <= current ? 'bg-accent' : 'bg-line-strong')} />
                ))}
              </div>
            </div>

            <AnimatePresence mode='wait' initial={false}>
              <motion.div key={current} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                <div className='mb-4 flex items-start gap-3.5'>
                  <span className='grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent-ink'>
                    <Icon size={20} />
                  </span>
                  <div className='min-w-0'>
                    <p className='hidden text-[12px] font-medium text-accent-ink lg:block'>
                      Step {current + 1} of {steps.length}
                    </p>
                    <h1 className='text-[20px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[22px]'>{step.title}</h1>
                    <p className='mt-1 text-[13px] text-fg-2'>{step.description}</p>
                  </div>
                </div>

                <section className='rounded-2xl border border-line bg-panel p-4 shadow-card sm:p-6'>
                  {loading ? (
                    <div className='space-y-3' aria-busy='true'>
                      <div className='skeleton h-12 rounded-xl' />
                      <div className='grid gap-3 sm:grid-cols-2'>
                        {Array.from({ length: 6 }, (_, i) => (
                          <div key={i} className='skeleton h-16 rounded-lg' />
                        ))}
                      </div>
                    </div>
                  ) : (
                    children
                  )}
                </section>

                <div className='mt-5 hidden flex-wrap items-center justify-end gap-2.5 lg:flex'>{actions}</div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Phone sticky actions */}
      <div className='fixed inset-x-0 bottom-0 z-40 border-t border-line bg-panel/95 px-4 pt-3 backdrop-blur-lg lg:hidden' style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <div className='flex flex-wrap items-center gap-2 [&>*]:min-w-[calc(50%-4px)] [&>*]:flex-1'>{actions}</div>
      </div>
    </div>
  )
}
