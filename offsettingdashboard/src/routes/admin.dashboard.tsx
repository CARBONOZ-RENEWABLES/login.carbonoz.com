import { FC, ReactElement } from 'react'
import { Route, Routes } from 'react-router-dom'
import Logs from '../components/admin/dashboard/logsM/logs'
import AdminRedexInformation from '../components/admin/dashboard/redex/redex'
import Users from '../components/admin/dashboard/users/users'
import NotFound from '../components/notfound/notFound'
import { AppShell } from '../layout/AppShell'
import { ADMIN_BOTTOM_NAV, ADMIN_NAV } from '../layout/nav'
import { ShellProvider } from '../layout/ShellContext'
import Private from './private'

export const AdminDashboardRoutes: FC = (): ReactElement => {
  return (
    <ShellProvider>
      <AppShell nav={ADMIN_NAV} bottomNav={ADMIN_BOTTOM_NAV} isAdmin>
        <Routes>
          <Route path='/' element={<AdminRedexInformation />} />
          <Route path='/logs' element={<Logs />} />
          <Route path='/users' element={<Users />} />
          <Route path='*' element={<NotFound />} />
        </Routes>
      </AppShell>
    </ShellProvider>
  )
}

const PrivateDashboard = Private(AdminDashboardRoutes)
export default PrivateDashboard
