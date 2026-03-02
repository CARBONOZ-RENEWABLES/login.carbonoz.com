import { ESystemSteps } from '../../../config/constant'
import { baseAPI } from '../api'

export interface stepDTO {
  step: ESystemSteps
}

export interface StepData {
  message: string
  data: Array<stepInt>
}

export interface stepInt {
  id: string
  userId: string
  step: ESystemSteps
  status: boolean
  createdAt: string
  updatedAt: string
}

export const sytemStepsApi = baseAPI.injectEndpoints({
  endpoints: (builder) => ({
    makeSystemStep: builder.mutation<unknown, stepDTO>({
      invalidatesTags: ['SystemSteps'],
      query: (DTO) => ({
        url: `/systemsteps/step`,
        method: 'POST',
        body: DTO,
      }),
    }),
    getSystemSteps: builder.query<StepData, void>({
      providesTags: ['SystemSteps'],
      query: () => ({
        url: `/systemsteps/step`,
        method: 'GET',
      }),
    }),
  }),
})

export const { useGetSystemStepsQuery, useMakeSystemStepMutation } =
  sytemStepsApi
