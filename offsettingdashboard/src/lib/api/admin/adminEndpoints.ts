import { ELogType, ERoles, EUserStatus } from '../../../config/constant'
import { baseAPI } from '../api'
import { AuthInt, SignupDTO } from '../Auth/authEndpoints'

export interface AccountUser {
  id: string
  createdAt: string
  updatedAt: string
  active: boolean
  activeStatus: boolean
  role: ERoles
  email: string
  firstName: string
  lastName: string
  customerTimezone: string
}

export interface LogInfo {
  id: string
  createdAt: string
  eventType: ELogType
  description: string
  metadata: string
  ipAddress: string
  userAgent: string
  requestUrl: string
  method: string
  responseTime: string
  statusCode: string
}

export interface RedexInfo {
  id: string
  countryCode: string
  groupedEnglishName: string
  groupedLocalName: string
  province: string
  timezone: string
  generationDataFrequency: string
  deviceRegistered: boolean
  createdAt: string
  updatedAt: string
}

interface UsersResponse {
  message: string
  data: {
    items: AccountUser[]
    totalItems: number
    itemCount: number
    itemsPerPage: number
    totalPages: number
    currentPage: number
  }
}

interface LogsResponse {
  message: string
  data: {
    items: LogInfo[]
    totalItems: number
    itemCount: number
    itemsPerPage: number
    totalPages: number
    currentPage: number
  }
}

interface RedexResponse {
  message: string
  data: {
    items: RedexInfo[]
    totalItems: number
    itemCount: number
    itemsPerPage: number
    totalPages: number
    currentPage: number
  }
}

export interface PaginationDTO {
  page?: string
  size?: string
}

interface filterUsers extends PaginationDTO {
  status?: string
  email?: string
  name?: string
}

export interface toogleActivationResponse {
  message: string
  affectedAccount: number
}

export interface toogleAccountDto {
  userIds: string[]
  status: string
}

export interface AdminAuthResponse {
  data: {
    token: string
    user: AuthInt
  }
}

interface filterRedex extends PaginationDTO {
  status?: string
}

const adminEndpoints = baseAPI.injectEndpoints({
  endpoints: (builder) => ({
    getAllUsers: builder.query<UsersResponse, filterUsers>({
      providesTags: ['Users'],
      query: ({ page = '', size = '', status, email = '', name = '' }) => ({
        url: `admin/users?page=${page}&limit=${size}&status=${
          status || EUserStatus.ENABLED
        }&email=${email}&name=${name}`,
        method: 'GET',
      }),
    }),
    toogleActivation: builder.mutation<
      toogleActivationResponse,
      toogleAccountDto
    >({
      invalidatesTags: ['Users'],
      query: (DTO) => ({
        url: `admin/toogle-activation`,
        method: 'PATCH',
        body: DTO,
      }),
    }),
    addNewUser: builder.mutation<AdminAuthResponse, SignupDTO>({
      invalidatesTags: ['Users'],
      query: (DTO) => ({
        url: `admin/sign-users`,
        method: 'POST',
        body: DTO,
      }),
    }),
    logs: builder.query<LogsResponse, PaginationDTO>({
      providesTags: ['Logs'],
      query: ({ page = '', size = '' }) => ({
        url: `admin/logs?page=${page}&limit=${size}`,
        method: 'GET',
      }),
    }),
    redexInfos: builder.query<RedexResponse, filterRedex>({
      providesTags: ['Redex-Info'],
      query: ({ page = '', size = '', status = '' }) => ({
        url: `admin/redex-info?page=${page}&limit=${size}&registered=${status}`,
        method: 'GET',
      }),
    }),
    sendToRedex: builder.mutation<void, void>({
      invalidatesTags: ['Redex-Info'],
      query: () => ({
        url: `admin/send-to-redex`,
        method: 'POST',
        body: {},
      }),
    }),
  }),
})

export const {
  useGetAllUsersQuery,
  useToogleActivationMutation,
  useAddNewUserMutation,
  useLogsQuery,
  useRedexInfosQuery,
  useSendToRedexMutation,
} = adminEndpoints
