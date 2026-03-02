import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import handleAPIRequests from '../../helpers/handleApiRequest'
import { setToLocal } from '../../helpers/handleStorage'
import {
  AuthResponse,
  useVerifyMutation,
  verifyUserDTO,
} from '../../lib/api/Auth/authEndpoints'
import { GeneralContentLoader } from '../common/loader/loader'

const VerifyEmail = () => {
  const navigate = useNavigate()
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token')
  const [verify, { isLoading }] = useVerifyMutation()

  const onSuccess = (res: AuthResponse): void => {
    if (res.data) {
      setToLocal('token', res.data.token)
      navigate('/ds')
    }
  }

  useEffect(() => {
    if (token) {
      const values: verifyUserDTO = {
        token,
      }
      handleAPIRequests({
        request: verify,
        ...values,
        onSuccess: onSuccess,
      })
    }
  }, [token])

  if (isLoading)
    return (
      <div className='h-[100vh] w-[100%] flex items-center justify-center' style={{ background: 'var(--surface-base)' }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className='flex flex-col items-center gap-6'
        >
          <GeneralContentLoader />
          <p className='text-lg font-semibold' style={{ color: 'var(--text-primary)' }}>
            Verifying your email, please wait...
          </p>
        </motion.div>
      </div>
    )

  return null
}

export default VerifyEmail
