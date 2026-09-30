import { translate } from '../i18n'
import { Activity, Building2, Cpu, Database, FileText, Gauge, House, Inbox, KeyRound, LayoutDashboard, MapPin, Settings, User, Users, type LucideIcon } from 'lucide-react'

export interface NavItem {
  /** Absolute route of the page. */
  to: string
  label: string
  /** Short label for the phone bottom bar. */
  short?: string
  icon: LucideIcon
  description: string
  /** Sidebar group heading; items with the same section are listed together. */
  section?: string
  /** Translated label/description (customer navigation); admin items stay as written. */
  i18n?: 'dashboard' | 'profile' | 'settings'
}

/** Label, short label and description in the current language. */
export function navText(item: NavItem) {
  if (!item.i18n) return { label: item.label, short: item.short ?? item.label, description: item.description }
  const k = item.i18n
  const label = translate(`nav.${k}.label`)
  return { label, short: k === 'dashboard' ? translate('nav.dashboard.short') : label, description: translate(`nav.${k}.description`) }
}

/** Customer navigation. SolarBMS is the only data source, so the Solar dashboard is home. */
export const USER_NAV: NavItem[] = [
  { to: '/ds/solar', i18n: 'dashboard', label: 'Dashboard', short: 'Home', icon: House, description: 'Your SolarBMS system: energy, batteries, cells, inverters and history.' },
  { to: '/ds/profile', i18n: 'profile', label: 'Profile', icon: User, description: 'Your personal and contact information.' },
  { to: '/ds/settings', i18n: 'settings', label: 'Settings', icon: Settings, description: 'Preferences for this device.' },
]

export const USER_BOTTOM_NAV = ['/ds/solar', '/ds/profile', '/ds/settings']

export const ADMIN_NAV: NavItem[] = [
  { to: '/admin/overview', label: 'Overview', section: 'SolarBMS', icon: Gauge, description: 'Health of the SolarBMS pipeline and your installations.' },
  { to: '/admin/customers', label: 'Customers', section: 'SolarBMS', icon: Building2, description: 'Customers, their members and sites.' },
  { to: '/admin/sites', label: 'Sites', section: 'SolarBMS', icon: MapPin, description: 'Every site, its installations and live status.' },
  { to: '/admin/installations', label: 'Installations', short: 'Systems', section: 'SolarBMS', icon: Cpu, description: 'SolarBMS installations and their machine credentials.' },
  { to: '/admin/credentials', label: 'Machine credentials', short: 'Keys', section: 'SolarBMS', icon: KeyRound, description: 'Raspberry Pi credentials: issue, rotate and revoke.' },
  { to: '/admin/solar', label: 'Ingestion', section: 'SolarBMS', icon: Inbox, description: 'What each SolarBMS system sends, failures and reprocessing.' },
  { to: '/admin/solar/data', label: 'Devices & metrics', short: 'Data', section: 'SolarBMS', icon: Database, description: 'Devices, events and the metric catalogue per site.' },
  { to: '/admin/dashboard', label: 'Solar dashboard', short: 'Dashboard', section: 'SolarBMS', icon: LayoutDashboard, description: 'The customer Solar dashboard for any site.' },
  { to: '/admin', label: 'Redex', section: 'Carbonoz', icon: FileText, description: 'Redex registration data submitted by users.' },
  { to: '/admin/users', label: 'Users', section: 'Carbonoz', icon: Users, description: 'Accounts, activation and access.' },
  { to: '/admin/logs', label: 'Logs', section: 'Carbonoz', icon: Activity, description: 'Errors, slow requests and security events.' },
]

export const ADMIN_BOTTOM_NAV = ['/admin/overview', '/admin/customers', '/admin/solar']

/** Longest-prefix match so /ds/solar/… still highlights Dashboard. */
export function activeNav(items: NavItem[], pathname: string): NavItem | undefined {
  const path = pathname.replace(/\/+$/, '') || '/'
  return [...items].sort((a, b) => b.to.length - a.to.length).find((n) => path === n.to || path.startsWith(n.to + '/'))
}
