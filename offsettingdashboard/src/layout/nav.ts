import { Activity, FileText, House, Settings, User, Users, type LucideIcon } from 'lucide-react'

export interface NavItem {
  /** Absolute route of the page. */
  to: string
  label: string
  /** Short label for the phone bottom bar. */
  short?: string
  icon: LucideIcon
  description: string
}

/** Customer navigation. SolarBMS is the only data source, so the Solar dashboard is home. */
export const USER_NAV: NavItem[] = [
  { to: '/ds/solar', label: 'Dashboard', short: 'Home', icon: House, description: 'Your SolarBMS system: energy, batteries, cells, inverters and history.' },
  { to: '/ds/profile', label: 'Profile', icon: User, description: 'Your personal and contact information.' },
  { to: '/ds/settings', label: 'Settings', icon: Settings, description: 'Preferences for this device.' },
]

export const USER_BOTTOM_NAV = ['/ds/solar', '/ds/profile', '/ds/settings']

export const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Redex', icon: FileText, description: 'Redex registration data submitted by users.' },
  { to: '/admin/users', label: 'Users', icon: Users, description: 'Accounts, activation and access.' },
  { to: '/admin/logs', label: 'Logs', icon: Activity, description: 'Errors, slow requests and security events.' },
]

export const ADMIN_BOTTOM_NAV = ['/admin', '/admin/users', '/admin/logs']

/** Longest-prefix match so /ds/solar/… still highlights Dashboard. */
export function activeNav(items: NavItem[], pathname: string): NavItem | undefined {
  const path = pathname.replace(/\/+$/, '') || '/'
  return [...items].sort((a, b) => b.to.length - a.to.length).find((n) => path === n.to || path.startsWith(n.to + '/'))
}
