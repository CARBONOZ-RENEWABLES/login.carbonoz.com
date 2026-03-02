import { Route, Routes } from 'react-router-dom'
import ForgotPassword from './components/auth/forgotPassword'
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

function App() {
  return (
    <Routes>
      <Route path='/' element={<Login />} />
      <Route path='/signup' element={<Signup />} />
      <Route path='/forgot-password' element={<ForgotPassword />} />
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
  )
}

export default App
