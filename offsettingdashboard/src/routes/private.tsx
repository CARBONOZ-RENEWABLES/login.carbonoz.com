import { ComponentType, FC, useEffect, useState } from 'react'
import { AppLoader } from '../components/common/loader/loader'
import { getFromLocal } from '../helpers/handleStorage'
import { fetchSession, isSso, loginRedirect } from '../lib/auth/session'

const Private = <P extends object>(Wrapped: ComponentType<P>): FC<P> => {
  const PrivateComponent: FC<P> = (props) => {
    // SSO: the session cookie is HttpOnly, so ask the API whether it is valid.
    const [state, setState] = useState<'checking' | 'ok'>(isSso ? 'checking' : 'ok')
    useEffect(() => {
      if (!isSso) return
      fetchSession().then((u) => (u ? setState('ok') : loginRedirect()))
    }, [])

    if (!isSso) {
      const localToken = getFromLocal<string>('token')
      if (!localToken) {
        window.location.href = '/'
        return null
      }
    }
    if (state === 'checking') return <AppLoader />
    return <Wrapped {...props} />
  }
  return PrivateComponent
}

export default Private
