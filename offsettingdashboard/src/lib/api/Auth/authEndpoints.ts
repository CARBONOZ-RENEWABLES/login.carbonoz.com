import { ERoles } from '../../../config/constant'
import { baseAPI } from '../api'

export interface LoginDTO {
  email: string
  password?: string
}

export interface SignupDTO extends LoginDTO {
  role?: ERoles
}

export interface verifyUserDTO {
  token: string
}

export interface resetPasswordDTO {
  email: string
}

export interface AuthResponse {
  data: {
    token: string
    user: AuthInt
  }
}

export interface AuthInt {
  id: string
  createdAt: string
  updatedAt: string
  active: boolean
  role: string
  email: string
}

const authApi = baseAPI.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<AuthResponse, LoginDTO>({
      query: (DTO) => ({
        url: `/auth/login`,
        method: 'POST',
        body: DTO,
      }),
    }),
    signup: builder.mutation<AuthResponse, SignupDTO>({
      query: (DTO) => ({
        url: `/auth/sign-up`,
        method: 'POST',
        body: DTO,
      }),
    }),
    verify: builder.mutation<AuthResponse, verifyUserDTO>({
      query: (DTO) => ({
        url: `/auth/verify-user`,
        method: 'POST',
        body: DTO,
      }),
    }),
    resetAuthPassword: builder.mutation<AuthResponse, resetPasswordDTO>({
      query: (DTO) => ({
        url: `/auth/forgot-password`,
        method: 'POST',
        body: DTO,
      }),
    }),
    verifyOnResetEmail: builder.mutation<AuthResponse, verifyUserDTO>({
      query: (DTO) => ({
        url: `/auth/verify-user-email`,
        method: 'POST',
        body: DTO,
      }),
    }),
  }),
})

export const {
  useLoginMutation,
  useSignupMutation,
  useVerifyMutation,
  useResetAuthPasswordMutation,
  useVerifyOnResetEmailMutation,
} = authApi
