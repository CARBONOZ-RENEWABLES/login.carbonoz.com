import { FC, ReactElement } from 'react'
import { Route, Routes } from 'react-router-dom'
import Logs from '../components/admin/dashboard/logsM/logs'
import AdminRedexInformation from '../components/admin/dashboard/redex/redex'
import Users from '../components/admin/dashboard/users/users'
import PlansManagement from '../components/admin/dashboard/plans/plans'
import AdminSidebar from '../components/admin/sidebar'
import ContentWrapper from '../components/common/contentwrapper/contentwrapper'
import NavBar from '../components/common/header/header'
import NotFound from '../components/notfound/notFound'
import Private from './private'

export const AdminDashboardRoutes: FC = (): ReactElement => {
  return (
    <div className='h-[100vh] bg-white overflow-y-hidden w-[100%]'>
      <div className='flex h-[100%] w-[100%] '>
        <AdminSidebar />
        <div className='flex-1 h-[100%] flex flex-col  mb-16 w-[100%] '>
          <NavBar isAdmin={true} />
          <ContentWrapper>
            <Routes>
              <Route path='/' element={<AdminRedexInformation />} />
              <Route path='/logs' element={<Logs />} />
              <Route path='/users' element={<Users />} />
              <Route path='/plans' element={<PlansManagement />} />
              <Route path='*' element={<NotFound />} />
            </Routes>
          </ContentWrapper>
        </div>
      </div>
    </div>
  )
}

const PrivateDashboard = Private(AdminDashboardRoutes)
export default PrivateDashboard
