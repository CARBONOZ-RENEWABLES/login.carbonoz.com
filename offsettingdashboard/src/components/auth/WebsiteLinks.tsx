import { ArrowUpRight } from 'lucide-react'
import { cn } from '../../design'

/** Our public websites, shown under the sign-in forms. */
const WEBSITES = [
  { href: 'https://carbonoz.com', label: 'carbonoz.com' },
  { href: 'https://www.solarautopilot.com', label: 'solarautopilot.com' },
]

/** `onDark`: over the photo background of the sign-in pages; otherwise themed text. */
export function WebsiteLinks({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  return (
    <nav aria-label='Our websites' className={cn('flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px]', className)}>
      <span className={onDark ? 'text-white/70' : 'text-muted'}>Visit us:</span>
      {WEBSITES.map((w) => (
        <a
          key={w.href}
          href={w.href}
          target='_blank'
          rel='noopener noreferrer'
          className={cn('inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline', onDark ? 'text-white drop-shadow' : 'text-fg-2 hover:text-fg')}
        >
          {w.label}
          <ArrowUpRight size={14} aria-hidden />
        </a>
      ))}
    </nav>
  )
}
