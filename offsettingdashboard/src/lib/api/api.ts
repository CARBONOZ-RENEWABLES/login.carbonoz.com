import {
  BaseQueryApi,
  createApi,
  FetchArgs,
  fetchBaseQuery,
} from '@reduxjs/toolkit/query/react'
import { API_CREDENTIALS, authHeaders, loginRedirect } from '../auth/session'

const API_URL = import.meta.env.VITE_API_URL

const BASE_URL = `${API_URL}/v1`

const baseQueryWithAuth = async (
  args: string | FetchArgs,
  api: BaseQueryApi,
  extraOptions: object
) => {
  const baseQuery = fetchBaseQuery({
    baseUrl: BASE_URL,
    // Sends the HttpOnly session cookie in SSO mode.
    credentials: API_CREDENTIALS,
    prepareHeaders: (headers: Headers): Headers => {
      for (const [k, v] of Object.entries(authHeaders())) headers.set(k, v)
      return headers
    },
  })

  const result = await baseQuery(args, api, extraOptions)

  if (result.error && result.error.status === 401) {
    loginRedirect()
  }

  return result
}

export const baseAPI = createApi({
  baseQuery: baseQueryWithAuth,
  tagTypes: [
    'User',
    'Steps',
    'Assets',
    'Info',
    'File',
    'Partners',
    'Redex-file',
    'SystemSteps',
    'Meter',
    'Certification',
    'Project',
    'Users',
    'Logs',
    'Redex-Info',
    'Admin-Tenancy',
    'Admin-Solar',
    'Solar-Site',
  ] as const,
  endpoints: () => ({}),
})
