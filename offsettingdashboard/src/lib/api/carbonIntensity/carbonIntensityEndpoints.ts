import { baseAPI } from '../api'

export interface CarbonIntensityData {
  message: string
  data: {
    totalUnavoidableEmissions: number
    totalAvoidedEmissions: number
    avgCarbonIntensity: number
    selfSufficiencyScore: number
    last7Days: Array<CarbonEmissionInt>
    last30Days: Array<CarbonEmissionInt>
    last12Months: Array<CarbonEmissionInt>
  }
}

export interface CarbonEmissionInt {
  date: string
  carbonIntensity: number
  gridEnergy: number
  solarEnergy: number
  unavoidableEmissions: number
  avoidedEmissions: number
  selfSufficiencyScore: number
}

export interface CarbonIntensityQueryDto {
  zone: string
  timeZone?: string
}

const carbonIntensityEndpoints = baseAPI.injectEndpoints({
  endpoints: (builder) => ({
    getCarbonIntensity: builder.query<CarbonIntensityData, CarbonIntensityQueryDto>({
      providesTags: ['CarbonIntensity'],
      query: (dto) => {
        const queryParams = new URLSearchParams()
        queryParams.append('zone', dto.zone)
        if (dto?.timeZone) queryParams.append('timezone', dto.timeZone)

        return {
          url: `carbon-intensity?${queryParams}`,
          method: 'GET',
        }
      },
    }),
    getCarbonIntensityFor7Days: builder.query<CarbonIntensityData, CarbonIntensityQueryDto>({
      providesTags: ['CarbonIntensity'],
      query: (dto) => {
        const queryParams = new URLSearchParams()
        queryParams.append('zone', dto.zone)
        if (dto?.timeZone) queryParams.append('timezone', dto.timeZone)

        return {
          url: `carbon-intensity/7?${queryParams}`,
          method: 'GET',
        }
      },
    }),
    getCarbonIntensityFor30Days: builder.query<CarbonIntensityData, CarbonIntensityQueryDto>({
      providesTags: ['CarbonIntensity'],
      query: (dto) => {
        const queryParams = new URLSearchParams()
        queryParams.append('zone', dto.zone)
        if (dto?.timeZone) queryParams.append('timezone', dto.timeZone)

        return {
          url: `carbon-intensity/30?${queryParams}`,
          method: 'GET',
        }
      },
    }),
    getCarbonIntensityFor12Months: builder.query<CarbonIntensityData, CarbonIntensityQueryDto>({
      providesTags: ['CarbonIntensity'],
      query: (dto) => {
        const queryParams = new URLSearchParams()
        queryParams.append('zone', dto.zone)
        if (dto?.timeZone) queryParams.append('timezone', dto.timeZone)

        return {
          url: `carbon-intensity/12?${queryParams}`,
          method: 'GET',
        }
      },
    }),
  }),
})

export const {
  useGetCarbonIntensityQuery,
  useGetCarbonIntensityFor7DaysQuery,
  useGetCarbonIntensityFor30DaysQuery,
  useGetCarbonIntensityFor12MonthsQuery,
} = carbonIntensityEndpoints
