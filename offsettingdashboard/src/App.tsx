import { Route, Routes, useLocation } from 'react-router-dom'
import { BootLoader } from './components/common/loader/loader'
import ForgotPassword from './components/auth/forgotPassword'
import SsoEntry from './components/auth/SsoEntry'
import Login from './components/auth/login'
import ResetPassword from './components/auth/resetPassword'
import Signup from './components/auth/signup'
import VerifyEmail from './components/auth/verifyEmail'
import VerifyResetPassword from './components/auth/verifyresetPassword'
import ChoosePartnersTypeForm from './components/firststep/choosetype'
import ErrorPage from './components/notfound/ErrorPage'
import UserSteps from './components/steps/steps'
import SystemUserSteps from './components/systemSteps/systemSteps'
import { AdminDashboardRoutes } from './routes/admin.dashboard'
import PrivateDashboard from './routes/dashboard.route'
import { isSso } from './lib/auth/session'

function App() {
  const { pathname } = useLocation()
  return (
    <>
      {/^\/(ds|admin)(\/|$)/.test(pathname) && <BootLoader />}
      <Routes>
        <Route path='/' element={isSso ? <SsoEntry /> : <Login />} />
        <Route path='/signup' element={isSso ? <SsoEntry register /> : <Signup />} />
        <Route path='/forgot-password' element={isSso ? <SsoEntry /> : <ForgotPassword />} />
        <Route path='/ds/*' element={<PrivateDashboard />} />
        <Route path='/admin/*' element={<AdminDashboardRoutes />} />
        <Route path='/redexsteps' element={<UserSteps />} />
        <Route path='/systemsteps' element={<SystemUserSteps />} />
        <Route path='/onboarding' element={<ChoosePartnersTypeForm />} />
        <Route path='/verify-email' element={<VerifyEmail />} />
        <Route path='/resetPassword' element={<VerifyResetPassword />} />
        <Route path='/password-reset' element={<ResetPassword />} />
        <Route path='*' element={<ErrorPage />} />
      </Routes>
    </>
  )
}

export default App
