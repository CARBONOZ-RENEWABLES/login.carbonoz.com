/* eslint-disable @typescript-eslint/no-explicit-any */
import Notify from '../components/common/notification/notification'
import { removeFromLocal } from './handleStorage'

interface ErrorResponse {
  error: string
  message: string | string[]
}

interface HandleAPIRequestsOptions<T> {
  request: (props: any) => any
  message?: string
  onSuccess?: (res: T) => void
  onError?: (err: ErrorResponse) => void
  notify?: boolean
}

const handleAPIRequests = <T>({
  request,
  message,
  onSuccess = () => null,
  onError = () => null,
  notify = false,
  ...props
}: HandleAPIRequestsOptions<T>): void => {
  request({ ...props })
    .unwrap()
    .then((res: any) => {
      onSuccess(res)
      if (notify) {
        Notify({
          message: 'Success',
          description: message || 'Operation successful',
        })
      }
    })
    .catch((err: any) => {
      onError(err)

      if (err.statusCode === 401) {
        removeFromLocal('token')
        window.location.href = '/'
      }

      if (err?.data) {
        Notify({
          message: err?.data?.error || 'Error',
          description:
            typeof err?.data?.message === 'string'
              ? err?.data?.message
              : err?.data?.message?.length >= 1
              ? err?.data?.message[0]
              : 'Something went wrong. Please try again later!',
          type: 'error',
        })
      }
    })
}

export default handleAPIRequests
