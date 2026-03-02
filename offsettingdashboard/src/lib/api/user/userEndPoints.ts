import { baseAPI } from '../api'

export interface AssetResponse {
  message: string
  data: assetInt
}

export interface RedexFileResponse {
  message: string
  data: string
}

export interface assetInt {
  id: string
  assetName: string
  assetOwner: string
  fuelType: string
  country: string
  latitude: number
  longitude: number
  capacityKwp: number
  service: string
  codDate: string
  amountOfInverters: number
  amountOfPanels: number
  panelBrand: string
  panelPower: number
  amountOfBatteries?: number
  batteryBrand?: string
  batteryModel?: string
  inverterModel: string
  monitoringSystemName: string
  monitoringSystemURL: string
  buildingPhotoUpload: string
  inverterSetupPhotoUpload: string
  solarPanelsPhotoUpload: string
  inverterBrand: string
  BatterySerialNumber1: string
  BatterySerialNumber2: string
  BatterySerialNumber3: string
  InverterSerialnumber1: string
  InverterSerialnumber2: string
  InverterSerialnumber3: string
  userId: string
}
export interface AdditionalInfoResponse {
  message: string
  data: AdditionalInfoInt
}

export interface AdditionalInfoInt {
  id: string
  firstName: string
  lastName: string
  street: string
  city: string
  telephone: string
  customerLanguage: string
  customerTimezone: string
  userId: string
}

export interface AssetDTO {
  assetName: string
  assetOwner: string
  fuelType: string
  country: string
  latitude: number
  longitude: number
  capacityKwp: number
  service: string
  codDate: string
  amountOfInverters: number
  amountOfPanels: number
  panelBrand: string
  panelPower: number
  amountOfBatteries?: number
  batteryBrand?: string
  batteryModel?: string
  inverterModel: string
  monitoringSystemName: string
  monitoringSystemURL: string
  buildingPhotoUpload: string
  inverterSetupPhotoUpload: string
  solarPanelsPhotoUpload: string
  inverterBrand: string
  BatterySerialNumber1: string
  BatterySerialNumber2: string
  BatterySerialNumber3: string
  InverterSerialnumber1: string
  InverterSerialnumber2: string
  InverterSerialnumber3: string
}

export interface additionalInfoInt {
  firstName?: string
  lastName?: string
  street?: string
  city?: string
  telephone?: string
  customerLanguage?: string
  customerTimezone?: string
}

export interface getPortsResponse {
  message: string
  data: Array<getPort>
}

export interface getPort {
  id: string
  createdAt: string
  updatedAt: string
  mqttUsername: string
  mqttPassword: string
  mqttPort: number
  userId: string
  port: string
}

export interface MeterDTO {
  meterId: null | string
  meterBrand: null | string
  meterType: null | string
  meteringEvidencePhotoUpload: string
}

export interface MeterResponse {
  message: string
  data: MeterInterface
}

export interface MeterInterface {
  id: string
  meterId: null | string
  meterBrand: null | string
  meterType: null | string
  meteringEvidencePhotoUpload: string
}

export interface ProjectResponse {
  message: string
  data: ProjectInterface
}

export interface ProjectInterface {
  id: string
  projectBackground: null | string
  projectDescription: null | string
  projectImpact: null | string
}

export interface ProjectDTO {
  projectBackground: null | string
  projectDescription: null | string
  projectImpact: null | string
}

export interface AgreementDTO {
  powerPurchaseAgreement?: string | null
  interconnectionAgreement?: string | null
  commissioningCertificationToGrid?: string | null
  commissioningCertificationOrInspection?: string | null
  powerQualityTest?: string | null
  IDPhotoUploadorCompanyCertificate?: string | null
}
export interface CertifacateResponse {
  message: string
  data: AgreementInterface
}

export interface AgreementInterface {
  id: string
  powerPurchaseAgreement?: string
  interconnectionAgreement?: string
  commissioningCertificationToGrid?: string
  commissioningCertificationOrInspection?: string
  powerQualityTest?: string
  IDPhotoUploadorCompanyCertificate: string
}

export interface ResetPasswordDto {
  password: string
}

export interface CredentialsResponse {
  message: string
  data: CredentialsInterface
}

export interface CredentialsInterface {
  id: string
  userId: string
  clientId: string
  clientSecret: string
}

const userEndpoints = baseAPI.injectEndpoints({
  endpoints: (builder) => ({
    getAssets: builder.query<AssetResponse, void>({
      providesTags: ['Assets'],
      query: () => ({
        url: `user/assets`,
        method: 'GET',
      }),
    }),
    getAdditionalInfo: builder.query<AdditionalInfoResponse, void>({
      providesTags: ['Info'],
      query: () => ({
        url: `user/infos`,
        method: 'GET',
      }),
      keepUnusedDataFor: 0,
    }),
    addAsset: builder.mutation<unknown, AssetDTO>({
      invalidatesTags: ['Assets'],
      query: (DTO) => ({
        url: `user/asset`,
        method: 'POST',
        body: DTO,
      }),
    }),
    addAdditionalInfo: builder.mutation<unknown, additionalInfoInt>({
      invalidatesTags: ['Info'],
      query: (DTO) => ({
        url: `user/info`,
        method: 'POST',
        body: DTO,
      }),
    }),
    editAdditionalInfo: builder.mutation<unknown, additionalInfoInt>({
      invalidatesTags: ['Info'],
      query: (DTO) => ({
        url: `user/edit-user`,
        method: 'PATCH',
        body: DTO,
      }),
    }),
    uploadRedexFile: builder.mutation<unknown, FormData>({
      invalidatesTags: ['File'],
      query: (DTO) => ({
        url: `user/redex-file`,
        method: 'POST',
        body: DTO,
      }),
    }),
    getUserPorts: builder.query<getPortsResponse, void>({
      providesTags: ['Ports'],
      query: () => ({
        url: `user/ports`,
        method: 'GET',
      }),
    }),
    getRedexFileId: builder.query<RedexFileResponse, void>({
      providesTags: ['Redex-file'],
      query: () => ({
        url: `user/redex`,
        method: 'GET',
      }),
    }),
    addMeter: builder.mutation<unknown, MeterDTO>({
      invalidatesTags: ['Meter'],
      query: (DTO) => ({
        url: `user/meter`,
        method: 'POST',
        body: DTO,
      }),
    }),
    getMeter: builder.query<MeterResponse, void>({
      providesTags: ['Meter'],
      query: () => ({
        url: `user/meter`,
        method: 'GET',
      }),
    }),
    addProject: builder.mutation<unknown, ProjectDTO>({
      invalidatesTags: ['Project'],
      query: (DTO) => ({
        url: `user/project`,
        method: 'POST',
        body: DTO,
      }),
    }),
    getProject: builder.query<ProjectResponse, void>({
      providesTags: ['Project'],
      query: () => ({
        url: `user/project`,
        method: 'GET',
      }),
    }),
    addCertificate: builder.mutation<unknown, AgreementDTO>({
      invalidatesTags: ['Certification'],
      query: (DTO) => ({
        url: `user/certification`,
        method: 'POST',
        body: DTO,
      }),
    }),
    getCertificate: builder.query<CertifacateResponse, void>({
      providesTags: ['Certification'],
      query: () => ({
        url: `user/certification`,
        method: 'GET',
      }),
    }),
    resetPassword: builder.mutation<unknown, ResetPasswordDto>({
      query: (DTO) => ({
        url: `user/reset-password`,
        method: 'PATCH',
        body: DTO,
      }),
    }),
    getCredentials: builder.query<CredentialsResponse, void>({
      query: () => ({
        url: `user/credentials`,
        method: 'GET',
      }),
    }),
  }),
})

export const {
  useGetAssetsQuery,
  useGetAdditionalInfoQuery,
  useAddAssetMutation,
  useAddAdditionalInfoMutation,
  useUploadRedexFileMutation,
  useGetUserPortsQuery,
  useGetRedexFileIdQuery,
  useAddMeterMutation,
  useGetMeterQuery,
  useAddProjectMutation,
  useGetProjectQuery,
  useAddCertificateMutation,
  useGetCertificateQuery,
  useResetPasswordMutation,
  useGetCredentialsQuery,
  useEditAdditionalInfoMutation,
} = userEndpoints
