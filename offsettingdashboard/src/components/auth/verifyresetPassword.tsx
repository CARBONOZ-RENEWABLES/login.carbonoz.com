import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import handleAPIRequests from '../../helpers/handleApiRequest'
import { setToLocal } from '../../helpers/handleStorage'
import {
  AuthResponse,
  useVerifyOnResetEmailMutation,
  verifyUserDTO,
} from '../../lib/api/Auth/authEndpoints'
import { GeneralContentLoader } from '../common/loader/loader'

const VerifyResetPassword = () => {
  const navigate = useNavigate()
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token')
  const [verify, { isLoading }] = useVerifyOnResetEmailMutation()

  const onSuccess = (res: AuthResponse): void => {
    if (res.data) {
      setToLocal('token', res.data.token)
      navigate('/password-reset')
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  if (isLoading)
    return (
      <div className='flex justify-center'>
        <div className='flex flex-col '>
          <GeneralContentLoader />
          <p>Verifying your Email please wait</p>
        </div>
      </div>
    )

  return
}

export default VerifyResetPassword
