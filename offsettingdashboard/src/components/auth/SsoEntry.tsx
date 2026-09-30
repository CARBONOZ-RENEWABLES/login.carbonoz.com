import { FC, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, ErrorState } from '../../design'
import { homePath } from '../../lib/auth/session'
import { AuthLayout } from '../../layout/AuthLayout'
import { GeneralContentLoader } from '../common/loader/loader'

const API_V1 = `${import.meta.env.VITE_API_URL}/v1`

const MESSAGES: Record<string, string> = {
  email_unverified: 'Please verify your email address with CARBONOZ sign-in first, then try again.',
  account_disabled: 'This account has been disabled. Contact CARBONOZ support.',
  access_denied: 'Sign-in was cancelled.',
}

/**
 * VITE_AUTH_MODE=keycloak replaces the sign-in, sign-up and forgot-password
 * pages with a hand-off to Keycloak (which owns passwords, registration and
 * resets). Errors coming back from the callback are shown instead of looping.
 */
const SsoEntry: FC<{ register?: boolean }> = ({ register }) => {
  const [params] = useSearchParams()
  const error = params.get('sso_error')
  const start = () => {
    const returnTo = encodeURIComponent(window.location.origin + homePath())
    window.location.href = `${API_V1}/auth/oidc/login?returnTo=${returnTo}${register ? '&register=1' : ''}`
  }

  useEffect(() => {
    if (!error) start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error])

  if (!error) return <GeneralContentLoader />
  return (
    <AuthLayout title='Sign in to CARBONOZ' subtitle='We could not complete your sign-in.'>
      <ErrorState title='Sign-in failed' description={MESSAGES[error] ?? 'Something went wrong. Please try again.'} />
      <Button variant='primary' className='mt-4 w-full' onClick={start}>
        Try again
      </Button>
    </AuthLayout>
  )
}

export default SsoEntry
