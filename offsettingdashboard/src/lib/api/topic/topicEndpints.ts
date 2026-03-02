import { baseAPI } from '../api'

export interface topicResponse {
  message: string
  data: topicInt
}

export interface topicInt {
  id: string
  createdAt: string
  updatedAt: string
  userId: string
  topicName: string
}

const topicEndpoints = baseAPI.injectEndpoints({
  endpoints: (builder) => ({
    getTopics: builder.query<topicResponse, void>({
      providesTags: ['Topic'],
      query: () => ({
        url: `topic/retrieve`,
        method: 'GET',
      }),
    }),
  }),
})

export const { useGetTopicsQuery } = topicEndpoints
