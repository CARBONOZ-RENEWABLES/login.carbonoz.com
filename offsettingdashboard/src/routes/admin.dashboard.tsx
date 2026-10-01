import { FC, ReactElement } from 'react'
import { Route, Routes } from 'react-router-dom'
import Logs from '../components/admin/dashboard/logsM/logs'
import AdminRedexInformation from '../components/admin/dashboard/redex/redex'
import Users from '../components/admin/dashboard/users/users'
import NotFound from '../components/notfound/notFound'
import CredentialsPage from '../features/admin/pages/CredentialsPage'
import CustomerDetailPage from '../features/admin/pages/CustomerDetailPage'
import CustomersPage from '../features/admin/pages/CustomersPage'
import IngestionPage from '../features/admin/pages/IngestionPage'
import InstallationsPage from '../features/admin/pages/InstallationsPage'
import OverviewPage from '../features/admin/pages/OverviewPage'
import SitesPage from '../features/admin/pages/SitesPage'
import SolarDataPage from '../features/admin/pages/SolarDataPage'
import EnergyFlowPage from '../features/solar/EnergyFlowPage'
import SolarPage from '../features/solar/SolarPage'
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
          <Route path='/overview' element={<OverviewPage />} />
          <Route path='/customers' element={<CustomersPage />} />
          <Route path='/customers/:customerId' element={<CustomerDetailPage />} />
          <Route path='/sites' element={<SitesPage />} />
          <Route path='/installations' element={<InstallationsPage />} />
          <Route path='/credentials' element={<CredentialsPage />} />
          <Route path='/solar' element={<IngestionPage />} />
          <Route path='/solar/data' element={<SolarDataPage />} />
          {/* The customer Solar dashboard, for any site (ADMIN may read every site). */}
          <Route path='/dashboard/:siteId/energy-flow' element={<EnergyFlowPage basePath='/admin/dashboard' />} />
          <Route path='/dashboard/:siteId?/:tab?' element={<SolarPage basePath='/admin/dashboard' />} />
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
