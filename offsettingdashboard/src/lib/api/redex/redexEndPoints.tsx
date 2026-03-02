import { baseAPI } from '../api'

export interface Inverter {
  RemoteInvId: string
  ElectronicSerialNumber: string
  BrandCode: string
  OtherBrandName: string
  InstalledCapacity: number
}

export interface Device {
  InstallationName: string
  Address: string
  PostalCode: string
  Longitude: number
  Latitude: number
  GridConnectionDate: string
  OwnersDeclarationStartDate: string
  OwnersDeclarationEndDate: string
  Domestic: boolean
  FeedInTariff: boolean
  DeclarationFormFileId: string | undefined
  PercentageRenewable: number
  Inverters: Inverter[]
}

export interface RegisterDeviceDTO {
  CountryCode: string
  GroupedEnglishName: string
  GroupedLocalName: string
  Province: string
  Timezone: string
  GenerationDataFrequency: string
  Devices: Device[]
}

const redexEndpoints = baseAPI.injectEndpoints({
  endpoints: (builder) => ({
    registerDevice: builder.mutation<unknown, RegisterDeviceDTO>({
      query: (DTO) => ({
        url: `/redex/device`,
        method: 'POST',
        body: DTO,
      }),
    }),
  }),
})

export const { useRegisterDeviceMutation } = redexEndpoints
