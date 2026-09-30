import { AnimatePresence, motion } from 'framer-motion'
import { Activity, BatteryCharging, Bell, Menu, Plus, RefreshCw, Users } from 'lucide-react'
import { ReactNode, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Logo from '../assets/1.jpg'
import { cn, Dialog, useGreeting } from '../design'
import { LiveStatusPill, RefreshButton, SystemSelector, ThemeToggle, UserMenu } from './HeaderControls'
import { useT } from '../i18n'
import { activeNav, NavItem, navText } from './nav'
import { useShell } from './ShellContext'

interface ShellProps {
  nav: NavItem[]
  bottomNav: string[]
  isAdmin?: boolean
  firstName?: string
  lastName?: string
  children: ReactNode
}

export function BrandMark({ size = 30, showName = true, className }: { size?: number; showName?: boolean; className?: string }) {
  return (
    <span className={cn('flex items-center gap-3', className)}>
      <img src={Logo} alt='' width={size} height={size} className='shrink-0 rounded-[9px] object-cover ring-1 ring-brand/40' style={{ width: size, height: size }} />
      {showName && <span className='text-[18px] font-semibold tracking-[-0.02em] text-fg'>CARBONOZ</span>}
    </span>
  )
}

function Sidebar({ nav, pathname, onNavigate }: { nav: NavItem[]; pathname: string; onNavigate: (to: string) => void }) {
  const active = activeNav(nav, pathname)
  const t = useT()
  return (
    <aside aria-label={t('shell.primaryNav')} className='relative z-20 hidden h-dvh w-[76px] shrink-0 flex-col border-r border-line bg-panel/70 backdrop-blur-sm lg:flex xl:w-[232px]'>
      <button type='button' onClick={() => onNavigate(nav[0].to)} className='flex h-[72px] items-center px-[23px] xl:px-6' aria-label={t('shell.brandHome')}>
        <BrandMark size={30} showName={false} className='xl:hidden' />
        <BrandMark size={30} className='hidden xl:flex' />
      </button>
      <nav className='px-3 pt-1'>
        <ul className='space-y-1'>
          {nav.map((item, i) => {
            const isActive = active?.to === item.to
            const Icon = item.icon
            const newSection = item.section && item.section !== nav[i - 1]?.section
            return (
              <li key={item.to}>
                {newSection && (
                  <>
                    {i > 0 && <span className='mx-2 my-2 block border-t border-line xl:hidden' aria-hidden />}
                    <p className={cn('hidden px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-subtle xl:block', i > 0 && 'pt-4')}>{item.section}</p>
                  </>
                )}
                <button
                  type='button'
                  onClick={() => onNavigate(item.to)}
                  aria-current={isActive ? 'page' : undefined}
                  title={navText(item).label}
                  className={cn(
                    'relative flex h-[38px] w-full items-center justify-center gap-3 rounded-lg px-3 text-[13.5px] font-medium transition-colors xl:justify-start',
                    isActive ? 'text-on-accent' : 'text-fg-2 hover:bg-panel-3 hover:text-fg',
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId='nav-active'
                      className='absolute inset-0 rounded-lg bg-gradient-to-r from-[#e8bc1c] to-[#c99d08] shadow-[0_8px_24px_-10px_rgb(222_175_11/0.8)]'
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    />
                  )}
                  <Icon size={17} strokeWidth={1.8} className='relative shrink-0' />
                  <span className='relative hidden flex-1 truncate text-left xl:inline'>{navText(item).label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
      <p className='mt-auto hidden px-6 pb-5 text-[11px] leading-relaxed text-subtle xl:block'>
        {t('shell.tagline1')}
        <br />
        {t('shell.tagline2')}
      </p>
    </aside>
  )
}

function Header({ title, description, isAdmin, firstName, lastName }: { title: ReactNode; description?: ReactNode; isAdmin?: boolean; firstName?: string; lastName?: string }) {
  return (
    <header className='hidden items-center justify-between gap-6 pb-[17px] pt-[18px] lg:flex'>
      <motion.div key={String(title)} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className='min-w-0'>
        <h1 className='truncate text-[22px] font-semibold leading-tight tracking-[-0.02em] text-fg'>{title}</h1>
        {description && <p className='mt-1 truncate text-[14px] text-fg-2'>{description}</p>}
      </motion.div>
      <div className='flex shrink-0 items-center gap-3'>
        {!isAdmin && <LiveStatusPill />}
        <div className='flex items-center gap-1.5 px-1'>
          <RefreshButton />
          <ThemeToggle />
        </div>
        <UserMenu firstName={firstName} lastName={lastName} isAdmin={isAdmin} />
      </div>
    </header>
  )
}

function MobileTopBar({ home, isAdmin, firstName, lastName }: { home: string; isAdmin?: boolean; firstName?: string; lastName?: string }) {
  const navigate = useNavigate()
  const t = useT()
  return (
    <header className='sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-line bg-app/85 px-4 py-2.5 backdrop-blur-md lg:hidden' style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
      <button type='button' onClick={() => navigate(home)} aria-label={t('shell.brandHome')}>
        <BrandMark size={26} className='[&>span]:text-[16px]' />
      </button>
      <div className='flex items-center gap-1'>
        {!isAdmin && <SystemSelector />}
        <ThemeToggle />
        <UserMenu compact firstName={firstName} lastName={lastName} isAdmin={isAdmin} />
      </div>
    </header>
  )
}

export interface QuickAction {
  label: string
  icon: ReactNode
  run: () => void
}

/** HomeOS bottom bar: two items, raised centre action button, one item, More. */
function BottomNav({ nav, bottom, pathname, onNavigate, quickActions }: { nav: NavItem[]; bottom: string[]; pathname: string; onNavigate: (to: string) => void; quickActions: QuickAction[] }) {
  const [sheet, setSheet] = useState<'none' | 'quick' | 'more'>('none')
  const t = useT()
  const active = activeNav(nav, pathname)
  const items = bottom.map((to) => nav.find((n) => n.to === to)).filter(Boolean) as NavItem[]
  const primary = items.slice(0, 2)
  const secondary = items.slice(2, 3)
  const shown = [...primary, ...secondary]
  const moreActive = !!active && !shown.includes(active)
  const go = (to: string) => {
    setSheet('none')
    onNavigate(to)
  }
  const Item = ({ n }: { n: NavItem }) => (
    <button type='button' onClick={() => go(n.to)} aria-current={active?.to === n.to ? 'page' : undefined} className={cn('flex min-w-14 flex-col items-center gap-1 py-1 text-[10.5px] font-medium transition-colors', active?.to === n.to ? 'text-accent-ink' : 'text-muted')}>
      <n.icon size={20} strokeWidth={1.8} />
      {navText(n).short}
    </button>
  )

  // Setup mode (no system yet): a single plain item, no action button.
  if (!items.length) {
    return (
      <nav aria-label={t('shell.primaryNav')} className='fixed inset-x-0 bottom-0 z-40 flex items-end justify-around border-t border-line bg-panel/90 px-2 pt-1.5 backdrop-blur-lg lg:hidden' style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
        {nav.map((n) => (
          <Item key={n.to} n={n} />
        ))}
      </nav>
    )
  }

  return (
    <>
      <nav aria-label={t('shell.primaryNav')} className='fixed inset-x-0 bottom-0 z-40 flex items-end justify-around border-t border-line bg-panel/90 px-2 pt-1.5 backdrop-blur-lg lg:hidden' style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
        {primary.map((n) => (
          <Item key={n.to} n={n} />
        ))}
        <button
          type='button'
          onClick={() => setSheet('quick')}
          aria-label={t('shell.quickActions')}
          aria-haspopup='dialog'
          className='-mt-6 grid h-14 w-14 place-items-center rounded-full bg-accent text-on-accent shadow-[0_10px_28px_-8px_rgb(222_175_11/0.9)] ring-4 ring-app transition-transform active:scale-95'
        >
          <Plus size={26} />
        </button>
        {secondary.map((n) => (
          <Item key={n.to} n={n} />
        ))}
        <button type='button' onClick={() => setSheet('more')} aria-haspopup='dialog' className={cn('flex min-w-14 flex-col items-center gap-1 py-1 text-[10.5px] font-medium', moreActive ? 'text-accent-ink' : 'text-muted')}>
          <Menu size={20} strokeWidth={1.8} />
          {t('shell.more')}
        </button>
      </nav>

      <Dialog open={sheet === 'quick'} onClose={() => setSheet('none')} title={t('shell.quickActions')} size='sm'>
        <div className='grid grid-cols-2 gap-2.5'>
          {quickActions.map((a) => (
            <button
              key={a.label}
              type='button'
              onClick={() => {
                setSheet('none')
                a.run()
              }}
              className='flex flex-col items-center gap-2 rounded-xl border border-line bg-panel-2 px-3 py-5 text-[13px] font-medium text-fg transition-colors hover:border-line-strong'
            >
              <span className='text-accent-ink'>{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>
      </Dialog>

      <Dialog open={sheet === 'more'} onClose={() => setSheet('none')} title={t('shell.menu')} size='sm'>
        <ul className='space-y-1'>
          {nav.map((n) => (
            <li key={n.to}>
              <button
                type='button'
                onClick={() => go(n.to)}
                aria-current={active?.to === n.to ? 'page' : undefined}
                className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-medium transition-colors', active?.to === n.to ? 'bg-accent/15 text-fg' : 'text-fg-2 hover:bg-panel-3')}
              >
                <n.icon size={18} />
                <span className='flex-1 text-left'>{navText(n).label}</span>
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  )
}

/** HomeOS-style application frame: sidebar, header, page transition, mobile chrome. */
export function AppShell({ nav, bottomNav, isAdmin, firstName, lastName, children }: ShellProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const greeting = useGreeting()
  const { refresh } = useShell()
  const t = useT()
  const current = activeNav(nav, pathname)
  const isHome = !isAdmin && current?.to === '/ds/solar'
  const title = isHome ? (
    <>
      {greeting}
      {firstName ? `, ${firstName}` : ''} <span aria-hidden>👋</span>
    </>
  ) : (
    (current ? navText(current).label : 'CARBONOZ')
  )
  const description = isHome ? t('shell.homeDescription') : current ? navText(current).description : undefined
  const quickActions: QuickAction[] = isAdmin
    ? [
        { label: t('common.refreshData'), icon: <RefreshCw size={20} />, run: refresh },
        { label: 'Users', icon: <Users size={20} />, run: () => navigate('/admin/users') },
        { label: 'Logs', icon: <Activity size={20} />, run: () => navigate('/admin/logs') },
      ]
    : [
        { label: t('common.refreshData'), icon: <RefreshCw size={20} />, run: refresh },
        { label: t('shell.battery'), icon: <BatteryCharging size={20} />, run: () => navigate('/ds/solar/battery') },
        { label: t('shell.bmsCells'), icon: <Activity size={20} />, run: () => navigate('/ds/solar/bms') },
        { label: t('shell.events'), icon: <Bell size={20} />, run: () => navigate('/ds/solar/events') },
      ]

  return (
    <div className='flex h-dvh overflow-hidden text-fg'>
      <a href='#main' className='sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-on-accent'>
        {t('shell.skipToContent')}
      </a>
      <Sidebar nav={nav} pathname={pathname} onNavigate={navigate} />
      <main id='main' tabIndex={-1} className='relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden focus:outline-none'>
        <MobileTopBar home={nav[0].to} isAdmin={isAdmin} firstName={firstName} lastName={lastName} />
        <div className='mx-auto flex min-h-full max-w-[1760px] flex-col px-4 pb-28 sm:px-6 lg:px-5 lg:pb-6 xl:px-[22px]'>
          <Header title={title} description={description} isAdmin={isAdmin} firstName={firstName} lastName={lastName} />
          <AnimatePresence mode='wait' initial={false}>
            <motion.div
              key={current?.to ?? pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className='flex min-h-0 min-w-0 flex-1 flex-col pt-4 lg:pt-0'
            >
              {isHome ? (
                <div className='mb-4 lg:hidden'>
                  <p className='text-[16px] text-fg-2'>{greeting},</p>
                  <h1 className='text-[24px] font-semibold tracking-[-0.02em] text-fg'>
                    {firstName || t('greeting.welcome')} <span aria-hidden>👋</span>
                  </h1>
                </div>
              ) : (
                <div className='mb-4 lg:hidden'>
                  <h1 className='text-[22px] font-semibold leading-tight tracking-[-0.02em] text-fg'>{title}</h1>
                  {description && <p className='mt-1 text-[13px] text-fg-2'>{description}</p>}
                </div>
              )}
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <BottomNav nav={nav} bottom={bottomNav} pathname={pathname} onNavigate={navigate} quickActions={quickActions} />
    </div>
  )
}
