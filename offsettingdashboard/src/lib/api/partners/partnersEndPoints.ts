import { EPartner } from '../../../config/constant'
import { baseAPI } from '../api'
import { AuthInt } from '../Auth/authEndpoints'

export interface getPartnerResponse {
  message: string
  data: partnerInterface | null
}

export interface partnerResponse {
  message: string
  data: partnerInterface
}

export interface partnerInterface {
  id: string
  userId: string
  partner: Array<EPartner>
  status: boolean
  user: AuthInt
}

export interface RegisterPartnerDTO {
  partner: Array<EPartner>
}

const partnerEndpoints = baseAPI.injectEndpoints({
  endpoints: (builder) => ({
    getPartners: builder.query<getPartnerResponse, void>({
      providesTags: ['Partners'],
      query: () => ({
        url: `partners`,
        method: 'GET',
      }),
    }),
    registerPartners: builder.mutation<partnerResponse, RegisterPartnerDTO>({
      invalidatesTags: ['Partners'],
      query: (DTO) => ({
        url: `partners`,
        method: 'POST',
        body: DTO,
      }),
    }),
  }),
})

export const { useGetPartnersQuery, useRegisterPartnersMutation } =
  partnerEndpoints
