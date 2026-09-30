import { Form } from 'antd'
import { Pencil } from 'lucide-react'
import { FC, ReactElement, useEffect, useState } from 'react'
import { Button, Card, EmptyState, Field, FormSection, Skeleton } from '../../../design'
import handleAPIRequests from '../../../helpers/handleApiRequest'
import { Avatar } from '../../../layout/HeaderControls'
import { tokenClaims } from '../../../layout/ShellContext'
import {
  AdditionalInfoInt,
  additionalInfoInt,
  useEditAdditionalInfoMutation,
  useGetAssetsQuery,
} from '../../../lib/api/user/userEndPoints'
import CustomButton from '../../common/button/button'
import CustomModal from '../../common/modal/customModal'
import EditUserInformationForm from '../../forms/edituserInfo'

interface props {
  additionalData: AdditionalInfoInt | undefined
}

const val = (v: unknown) => (v === undefined || v === null || v === '' ? <span className='text-subtle'>Not provided</span> : String(v))

const Profile: FC<props> = ({ additionalData }): ReactElement => {
  const [isVisible, setIsVisible] = useState<boolean>(false)
  const { data: assetsData, refetch, isLoading: assetsLoading } = useGetAssetsQuery()
  const { email } = tokenClaims()

  useEffect(() => {
    refetch()
  }, [refetch])

  const handleCancel = () => setIsVisible(false)
  const [editAdditionalInfo, { isLoading }] = useEditAdditionalInfoMutation()
  const [form] = Form.useForm()

  const onFinish = (values: additionalInfoInt) => {
    handleAPIRequests({
      request: editAdditionalInfo,
      ...values,
      onSuccess: handleCancel,
    })
  }

  const asset = assetsData?.data

  return (
    <>
      <CustomModal
        isVisible={isVisible}
        setIsVisible={setIsVisible}
        title='Edit profile'
        subTitle='Update your personal and contact information.'
        width={760}
        handleCancel={handleCancel}
        footerContent={
          <div className='flex justify-end gap-2'>
            <CustomButton variant='ghost' onClick={handleCancel}>
              Cancel
            </CustomButton>
            <CustomButton type='primary' htmlType='submit' form='edit-user-info-form' loading={isLoading}>
              Save changes
            </CustomButton>
          </div>
        }
        footerWidth={24}
      >
        <EditUserInformationForm form={form} data={additionalData} onFinish={onFinish} />
      </CustomModal>

      <div className='flex flex-col gap-4'>
        <FormSection title='Profile' description='Your account on CARBONOZ.'>
          <div className='flex flex-wrap items-center gap-4 rounded-lg border border-line bg-panel-2 p-3.5'>
            <Avatar first={additionalData?.firstName} last={additionalData?.lastName} email={email} size={52} />
            <div className='min-w-0 flex-1'>
              <p className='truncate text-[15px] font-semibold text-fg'>{[additionalData?.firstName, additionalData?.lastName].filter(Boolean).join(' ') || 'Your name'}</p>
              <p className='truncate text-[12.5px] text-muted'>{email ?? 'Customer'}</p>
            </div>
            <Button variant='outline' size='sm' onClick={() => setIsVisible(true)}>
              <Pencil size={13} /> Edit
            </Button>
          </div>
        </FormSection>

        <FormSection title='Personal information' description='Used for certificates, reports and support.'>
          <div className='grid gap-x-4 gap-y-3.5 rounded-lg border border-line bg-panel-2 p-4 sm:grid-cols-2 xl:grid-cols-3'>
            <Field label='First name'>{val(additionalData?.firstName)}</Field>
            <Field label='Last name'>{val(additionalData?.lastName)}</Field>
            <Field label='Telephone'>{val(additionalData?.telephone)}</Field>
            <Field label='Street'>{val(additionalData?.street)}</Field>
            <Field label='City'>{val(additionalData?.city)}</Field>
            <Field label='Language'>{val(additionalData?.customerLanguage)}</Field>
            <Field label='Timezone'>{val(additionalData?.customerTimezone)}</Field>
          </div>
        </FormSection>

        <FormSection title='Asset information' description='Details of your solar installation submitted during onboarding.'>
          {assetsLoading ? (
            <Skeleton className='h-40 rounded-lg' />
          ) : !asset ? (
            <EmptyState title='No asset information' description='Asset details are collected during onboarding.' />
          ) : (
            <>
              <div className='grid gap-x-4 gap-y-3.5 rounded-lg border border-line bg-panel-2 p-4 sm:grid-cols-2 xl:grid-cols-3'>
                <Field label='Asset name'>{val(asset.assetName)}</Field>
                <Field label='Asset owner'>{val(asset.assetOwner)}</Field>
                <Field label='Country'>{val(asset.country)}</Field>
                <Field label='Capacity (kWp)'>{val(asset.capacityKwp)}</Field>
                <Field label='Fuel type'>{val(asset.fuelType)}</Field>
                <Field label='Panel brand'>{val(asset.panelBrand)}</Field>
                <Field label='Inverter brand'>{val(asset.inverterBrand)}</Field>
                <Field label='Inverters'>{val(asset.amountOfInverters)}</Field>
                <Field label='Panels'>{val(asset.amountOfPanels)}</Field>
                <Field label='Monitoring system'>{val(asset.monitoringSystemName)}</Field>
              </div>
              <div className='grid gap-3 sm:grid-cols-3'>
                {[
                  { label: 'Building', src: asset.buildingPhotoUpload },
                  { label: 'Inverter setup', src: asset.inverterSetupPhotoUpload },
                  { label: 'Solar panels', src: asset.solarPanelsPhotoUpload },
                ].map((photo) => (
                  <Card key={photo.label} className='group overflow-hidden'>
                    {photo.src ? (
                      <img src={photo.src} alt={photo.label} className='h-44 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]' />
                    ) : (
                      <div className='grid h-44 place-items-center bg-panel-2 text-[12px] text-muted'>No photo</div>
                    )}
                    <p className='border-t border-line px-3 py-2 text-[12.5px] font-medium text-fg-2'>{photo.label}</p>
                  </Card>
                ))}
              </div>
            </>
          )}
        </FormSection>
      </div>
    </>
  )
}

export default Profile
