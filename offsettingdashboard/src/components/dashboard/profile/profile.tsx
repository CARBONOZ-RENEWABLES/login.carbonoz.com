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
import { adoptLanguage, languageInfo, normalizeLanguage, translate as t } from '../../../i18n'
import LanguageSection from './LanguageSection'

interface props {
  additionalData: AdditionalInfoInt | undefined
}

const val = (v: unknown) => (v === undefined || v === null || v === '' ? <span className='text-subtle'>{t('common.notProvided')}</span> : String(v))
const languageName = (v: unknown) => {
  const code = normalizeLanguage(v)
  return code ? `${languageInfo(code).flag} ${languageInfo(code).label}` : val(v)
}

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
      onSuccess: () => {
        handleCancel()
        // A language chosen in the form becomes the UI language too.
        adoptLanguage(values.customerLanguage)
      },
    })
  }

  const asset = assetsData?.data

  return (
    <>
      <CustomModal
        isVisible={isVisible}
        setIsVisible={setIsVisible}
        title={t('profile.editTitle')}
        subTitle={t('profile.editSubtitle')}
        width={760}
        handleCancel={handleCancel}
        footerContent={
          <div className='flex justify-end gap-2'>
            <CustomButton variant='ghost' onClick={handleCancel}>
              {t('common.cancel')}
            </CustomButton>
            <CustomButton type='primary' htmlType='submit' form='edit-user-info-form' loading={isLoading}>
              {t('profile.saveChanges')}
            </CustomButton>
          </div>
        }
        footerWidth={24}
      >
        <EditUserInformationForm form={form} data={additionalData} onFinish={onFinish} />
      </CustomModal>

      <div className='flex flex-col gap-4'>
        <FormSection title={t('profile.title')} description={t('profile.description')}>
          <div className='flex flex-wrap items-center gap-4 rounded-lg border border-line bg-panel-2 p-3.5'>
            <Avatar first={additionalData?.firstName} last={additionalData?.lastName} email={email} size={52} />
            <div className='min-w-0 flex-1'>
              <p className='truncate text-[15px] font-semibold text-fg'>{[additionalData?.firstName, additionalData?.lastName].filter(Boolean).join(' ') || t('profile.yourName')}</p>
              <p className='truncate text-[12.5px] text-muted'>{email ?? t('shell.customer')}</p>
            </div>
            <Button variant='outline' size='sm' onClick={() => setIsVisible(true)}>
              <Pencil size={13} /> {t('common.edit')}
            </Button>
          </div>
        </FormSection>

        <LanguageSection canSaveToProfile={!!additionalData} />

        <FormSection title={t('profile.personal')} description={t('profile.personalHint')}>
          <div className='grid gap-x-4 gap-y-3.5 rounded-lg border border-line bg-panel-2 p-4 sm:grid-cols-2 xl:grid-cols-3'>
            <Field label={t('profile.fields.firstName')}>{val(additionalData?.firstName)}</Field>
            <Field label={t('profile.fields.lastName')}>{val(additionalData?.lastName)}</Field>
            <Field label={t('profile.fields.telephone')}>{val(additionalData?.telephone)}</Field>
            <Field label={t('profile.fields.street')}>{val(additionalData?.street)}</Field>
            <Field label={t('profile.fields.city')}>{val(additionalData?.city)}</Field>
            <Field label={t('profile.fields.language')}>{languageName(additionalData?.customerLanguage)}</Field>
            <Field label={t('profile.fields.timezone')}>{val(additionalData?.customerTimezone)}</Field>
          </div>
        </FormSection>

        <FormSection title={t('profile.asset')} description={t('profile.assetHint')}>
          {assetsLoading ? (
            <Skeleton className='h-40 rounded-lg' />
          ) : !asset ? (
            <EmptyState title={t('profile.noAsset')} description={t('profile.noAssetHint')} />
          ) : (
            <>
              <div className='grid gap-x-4 gap-y-3.5 rounded-lg border border-line bg-panel-2 p-4 sm:grid-cols-2 xl:grid-cols-3'>
                <Field label={t('profile.fields.assetName')}>{val(asset.assetName)}</Field>
                <Field label={t('profile.fields.assetOwner')}>{val(asset.assetOwner)}</Field>
                <Field label={t('profile.fields.country')}>{val(asset.country)}</Field>
                <Field label={t('profile.fields.capacity')}>{val(asset.capacityKwp)}</Field>
                <Field label={t('profile.fields.fuelType')}>{val(asset.fuelType)}</Field>
                <Field label={t('profile.fields.panelBrand')}>{val(asset.panelBrand)}</Field>
                <Field label={t('profile.fields.inverterBrand')}>{val(asset.inverterBrand)}</Field>
                <Field label={t('profile.fields.inverters')}>{val(asset.amountOfInverters)}</Field>
                <Field label={t('profile.fields.panels')}>{val(asset.amountOfPanels)}</Field>
                <Field label={t('profile.fields.monitoring')}>{val(asset.monitoringSystemName)}</Field>
              </div>
              <div className='grid gap-3 sm:grid-cols-3'>
                {[
                  { label: t('profile.photos.building'), src: asset.buildingPhotoUpload },
                  { label: t('profile.photos.inverter'), src: asset.inverterSetupPhotoUpload },
                  { label: t('profile.photos.panels'), src: asset.solarPanelsPhotoUpload },
                ].map((photo) => (
                  <Card key={photo.label} className='group overflow-hidden'>
                    {photo.src ? (
                      <img src={photo.src} alt={photo.label} className='h-44 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]' />
                    ) : (
                      <div className='grid h-44 place-items-center bg-panel-2 text-[12px] text-muted'>{t('profile.noPhoto')}</div>
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
