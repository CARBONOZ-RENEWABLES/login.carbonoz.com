import { Activity, ChevronDown, Cpu, LogOut, Moon, RefreshCw, Settings, Sun, User as UserIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn, MenuItem, Popover } from '../design'
import { logout as endSession } from '../lib/auth/session'
import { useTheme } from '../lib/hooks/useTheme'
import { relativeTime, tokenClaims, useShell } from './ShellContext'

const ctrl = 'grid h-9 w-9 place-items-center rounded-lg text-fg-2 transition-colors hover:bg-panel-3 hover:text-fg'

export function ThemeToggle() {
  const { isDark, toggle } = useTheme()
  return (
    <button type='button' onClick={toggle} className={ctrl} aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`} title='Toggle theme'>
      {isDark ? <Sun size={18} strokeWidth={1.7} /> : <Moon size={18} strokeWidth={1.7} />}
    </button>
  )
}

export function RefreshButton() {
  const { refresh } = useShell()
  const [spin, setSpin] = useState(false)
  return (
    <button
      type='button'
      className={ctrl}
      aria-label='Refresh data'
      title='Refresh data'
      onClick={() => {
        refresh()
        setSpin(true)
        window.setTimeout(() => setSpin(false), 700)
      }}
    >
      <RefreshCw size={17} strokeWidth={1.7} className={cn(spin && 'animate-spin')} />
    </button>
  )
}

/** SolarBMS connection indicator, reported by the Solar dashboard. */
export function LiveStatusPill({ compact }: { compact?: boolean }) {
  const { liveStatus, liveUpdatedAt } = useShell()
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 5000)
    return () => window.clearInterval(id)
  }, [])
  if (!liveStatus || liveStatus === 'loading') return null
  const map = {
    live: { dot: 'bg-batt', text: 'Live', hint: liveUpdatedAt ? `Updated ${relativeTime(liveUpdatedAt)}` : '' },
    'no-data': { dot: 'bg-gridp', text: 'No recent data', hint: 'Your SolarBMS has not reported recently' },
    error: { dot: 'bg-danger', text: 'Data unavailable', hint: 'Live data could not be loaded' },
  }[liveStatus]
  return (
    <span
      className={cn('flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-panel/50 text-[12.5px] font-medium text-fg-2', compact ? 'px-2.5' : 'px-3')}
      title={map.hint}
      role='status'
      aria-live='polite'
    >
      <span className='relative flex h-2 w-2'>
        {liveStatus === 'live' && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', map.dot)} />}
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', map.dot)} />
      </span>
      <span className={cn(compact && 'sr-only')}>{map.text}</span>
      {!compact && liveStatus === 'live' && liveUpdatedAt && <span className='hidden text-[11.5px] font-normal text-muted 2xl:inline'>{relativeTime(liveUpdatedAt)}</span>}
    </span>
  )
}

/** Mobile top-bar selector (HomeOS home-selector position): your system and its connection status. */
export function SystemSelector() {
  const navigate = useNavigate()
  const { liveStatus, liveUpdatedAt } = useShell()
  const dot = liveStatus === 'live' ? 'bg-batt' : liveStatus === 'no-data' ? 'bg-gridp' : liveStatus === 'error' ? 'bg-danger' : 'bg-subtle'
  const label = liveStatus === 'live' ? 'Online' : liveStatus === 'no-data' ? 'No recent data' : liveStatus === 'error' ? 'Data unavailable' : 'Checking…'
  return (
    <Popover
      label='Your system'
      className='w-64'
      trigger={({ toggle, ref, ...aria }) => (
        <button ref={ref} type='button' onClick={toggle} {...aria} aria-label={`System: ${label}`} className='flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-panel/50 px-2.5 text-[12.5px] font-medium text-fg transition-colors hover:border-subtle'>
          <span className='relative flex h-2 w-2'>
            {liveStatus === 'live' && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', dot)} />}
            <span className={cn('relative inline-flex h-2 w-2 rounded-full', dot)} />
          </span>
          System
          <ChevronDown size={14} className='text-muted' />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className='border-b border-line px-2.5 pb-2.5 pt-1.5'>
            <p className='text-[13px] font-medium text-fg'>Solar system</p>
            <p className='text-[11.5px] text-muted'>
              {label}
              {liveStatus === 'live' && liveUpdatedAt ? ` · ${relativeTime(liveUpdatedAt)}` : ''}
            </p>
          </div>
          <div className='pt-1'>
            <MenuItem icon={<Cpu size={14} />} onSelect={() => { close(); navigate('/ds/solar/system') }}>System details</MenuItem>
            <MenuItem icon={<Activity size={14} />} onSelect={() => { close(); navigate('/ds/solar/events') }}>Events</MenuItem>
          </div>
        </>
      )}
    </Popover>
  )
}

function initials(first?: string, last?: string, email?: string) {
  const s = `${(first ?? '')[0] ?? ''}${(last ?? '')[0] ?? ''}`.toUpperCase()
  return s || (email ?? '?')[0].toUpperCase()
}

export function Avatar({ first, last, email, size = 36 }: { first?: string; last?: string; email?: string; size?: number }) {
  return (
    <span
      className='grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#f4d774] to-[#c99a07] font-semibold text-[#3a2c02] ring-2 ring-line-strong'
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials(first, last, email)}
    </span>
  )
}

export function UserMenu({ firstName, lastName, isAdmin, compact }: { firstName?: string; lastName?: string; isAdmin?: boolean; compact?: boolean }) {
  const navigate = useNavigate()
  const { email } = tokenClaims()
  const name = isAdmin ? 'Administrator' : [firstName, lastName].filter(Boolean).join(' ') || email || 'Account'
  const logout = () => {
    endSession()
  }
  return (
    <Popover
      label='Account'
      className='w-60'
      trigger={({ toggle, ref, ...aria }) =>
        compact ? (
          <button ref={ref} type='button' onClick={toggle} {...aria} className={ctrl} aria-label='Account menu'>
            <Avatar first={isAdmin ? 'A' : firstName} last={isAdmin ? '' : lastName} email={email} size={28} />
          </button>
        ) : (
        <button ref={ref} type='button' onClick={toggle} {...aria} className='flex items-center gap-3 rounded-xl py-1 pl-1 pr-1 transition-colors hover:bg-panel-3' aria-label='Account menu'>
          <Avatar first={isAdmin ? 'A' : firstName} last={isAdmin ? '' : lastName} email={email} />
          <span className='hidden max-w-[160px] text-left min-[1380px]:block'>
            <span className='block truncate text-[13.5px] font-medium text-fg'>{name}</span>
            <span className='block truncate text-[11.5px] text-muted'>{isAdmin ? 'Admin' : 'Customer'}</span>
          </span>
          <ChevronDown size={16} className='mr-1 text-fg-2' />
        </button>
        )
      }
    >
      {(close) => (
        <>
          <div className='border-b border-line px-2.5 pb-2.5 pt-1.5'>
            <p className='truncate text-[13px] font-medium text-fg'>{name}</p>
            {email && <p className='truncate text-[11.5px] text-muted'>{email}</p>}
          </div>
          <div className='pt-1'>
            {!isAdmin && (
              <>
                <MenuItem
                  icon={<UserIcon size={14} />}
                  onSelect={() => {
                    close()
                    navigate('/ds/profile')
                  }}
                >
                  Profile
                </MenuItem>
                <MenuItem
                  icon={<Settings size={14} />}
                  onSelect={() => {
                    close()
                    navigate('/ds/settings')
                  }}
                >
                  Settings
                </MenuItem>
              </>
            )}
            <MenuItem icon={<LogOut size={14} />} danger onSelect={logout}>
              Log out
            </MenuItem>
          </div>
        </>
      )}
    </Popover>
  )
}
