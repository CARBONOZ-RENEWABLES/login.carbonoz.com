import { Form } from 'antd'
import { FC, ReactElement, useEffect, useState } from 'react'
import { Edit2, User, MapPin, Phone, Globe, Clock } from 'lucide-react'
import { motion } from 'framer-motion'
import handleAPIRequests from '../../../helpers/handleApiRequest'
import {
  AdditionalInfoInt,
  additionalInfoInt,
  useEditAdditionalInfoMutation,
  useGetAssetsQuery,
  useGetUserPortsQuery,
} from '../../../lib/api/user/userEndPoints'
import CustomButton from '../../common/button/button'
import CustomImage from '../../common/image/customImage'
import CustomModal from '../../common/modal/customModal'
import EditUserInformationForm from '../../forms/edituserInfo'

interface props {
  additionalData: AdditionalInfoInt | undefined
}

const InfoRow: FC<{ icon: ReactElement; label: string; value: string | undefined }> = ({ icon, label, value }) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    className='flex items-center gap-4 p-4 rounded-xl transition-all duration-200'
    style={{ background: 'var(--surface-overlay)' }}
  >
    <div className='w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0' style={{ background: 'rgba(222,175,11,0.1)' }}>
      {icon}
    </div>
    <div className='flex-1 min-w-0'>
      <p className='text-xs font-semibold uppercase tracking-wider mb-1' style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className='text-sm font-semibold truncate' style={{ color: 'var(--text-primary)' }}>{value || 'N/A'}</p>
    </div>
  </motion.div>
)

const Profile: FC<props> = ({ additionalData }): ReactElement => {
  const { data, refetch: refetchPort } = useGetUserPortsQuery()
  const [isVisible, setIsVisible] = useState<boolean>(false)
  const { data: assetsData, refetch } = useGetAssetsQuery()

  useEffect(() => {
    refetchPort()
    refetch()
  }, [refetchPort, refetch])

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

  return (
    <>
      <CustomModal
        isVisible={isVisible}
        setIsVisible={setIsVisible}
        title='Edit User Information'
        width={1000}
        handleCancel={handleCancel}
        footerContent={
          <CustomButton type='primary' htmlType='submit' form='edit-user-info-form' loading={isLoading} className='h-[52px] px-6'>
            Save Changes
          </CustomButton>
        }
      >
        <EditUserInformationForm form={form} data={additionalData} onFinish={onFinish} />
      </CustomModal>

      <div className='space-y-6'>
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className='flex items-center gap-4'>
          <div className='w-12 h-12 rounded-xl flex items-center justify-center' style={{ background: 'rgba(222,175,11,0.1)' }}>
            <User size={24} style={{ color: '#DEAF0B' }} />
          </div>
          <div>
            <h1 className='text-3xl font-bold tracking-tight' style={{ color: 'var(--text-primary)' }}>Profile</h1>
            <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Manage your account information</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className='rounded-xl border overflow-hidden shadow-md transition-all duration-200'
          style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
        >
          <div className='flex justify-between items-center p-6 border-b border-l-4' style={{ borderBottomColor: 'var(--border)', borderLeftColor: '#DEAF0B' }}>
            <div className='flex items-center gap-4'>
              <div className='w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-bold text-black' style={{ background: '#DEAF0B' }}>
                {additionalData?.firstName?.[0]}{additionalData?.lastName?.[0]}
              </div>
              <div>
                <h2 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>
                  {additionalData?.firstName} {additionalData?.lastName}
                </h2>
                <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>User Profile</p>
              </div>
            </div>
            <CustomButton onClick={() => setIsVisible(true)} icon={<Edit2 size={18} />} variant='primary' className='h-[52px] px-6'>
              Edit
            </CustomButton>
          </div>
          <div className='p-6 grid md:grid-cols-2 gap-4'>
            <InfoRow icon={<User size={20} style={{ color: '#DEAF0B' }} />} label='First Name' value={additionalData?.firstName} />
            <InfoRow icon={<User size={20} style={{ color: '#DEAF0B' }} />} label='Last Name' value={additionalData?.lastName} />
            <InfoRow icon={<MapPin size={20} style={{ color: '#DEAF0B' }} />} label='Street' value={additionalData?.street} />
            <InfoRow icon={<MapPin size={20} style={{ color: '#DEAF0B' }} />} label='City' value={additionalData?.city} />
            <InfoRow icon={<Phone size={20} style={{ color: '#DEAF0B' }} />} label='Telephone' value={additionalData?.telephone} />
            <InfoRow icon={<Globe size={20} style={{ color: '#DEAF0B' }} />} label='Language' value={additionalData?.customerLanguage} />
            <InfoRow icon={<Clock size={20} style={{ color: '#DEAF0B' }} />} label='Timezone' value={additionalData?.customerTimezone} />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className='rounded-xl border overflow-hidden shadow-md'
          style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
        >
          <div className='p-6 border-b border-l-4' style={{ borderBottomColor: 'var(--border)', borderLeftColor: '#DEAF0B' }}>
            <h2 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>Device Configuration</h2>
          </div>
          <div className='p-6 grid md:grid-cols-3 gap-4'>
            <div className='p-4 rounded-xl' style={{ background: 'var(--surface-overlay)' }}>
              <p className='text-xs font-semibold uppercase tracking-wider mb-2' style={{ color: 'var(--text-muted)' }}>MQTT Host</p>
              <p className='text-sm font-semibold font-mono' style={{ color: 'var(--text-primary)' }}>{data?.data[0]?.port}</p>
            </div>
            <div className='p-4 rounded-xl' style={{ background: 'var(--surface-overlay)' }}>
              <p className='text-xs font-semibold uppercase tracking-wider mb-2' style={{ color: 'var(--text-muted)' }}>MQTT Port</p>
              <p className='text-sm font-semibold font-mono' style={{ color: 'var(--text-primary)' }}>{data?.data[0]?.mqttPort}</p>
            </div>
            <div className='p-4 rounded-xl' style={{ background: 'var(--surface-overlay)' }}>
              <p className='text-xs font-semibold uppercase tracking-wider mb-2' style={{ color: 'var(--text-muted)' }}>MQTT Username</p>
              <p className='text-sm font-semibold font-mono' style={{ color: 'var(--text-primary)' }}>{data?.data[0]?.mqttUsername}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className='rounded-xl border overflow-hidden shadow-md'
          style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
        >
          <div className='p-6 border-b border-l-4' style={{ borderBottomColor: 'var(--border)', borderLeftColor: '#DEAF0B' }}>
            <h2 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>Asset Information</h2>
          </div>
          <div className='p-6 space-y-6'>
            <div className='grid md:grid-cols-2 lg:grid-cols-3 gap-4'>
              {[
                { label: 'Asset Name', value: assetsData?.data?.assetName },
                { label: 'Asset Owner', value: assetsData?.data?.assetOwner },
                { label: 'Country', value: assetsData?.data?.country },
                { label: 'Capacity (kWp)', value: assetsData?.data?.capacityKwp },
                { label: 'Fuel Type', value: assetsData?.data?.fuelType },
                { label: 'Panel Brand', value: assetsData?.data?.panelBrand },
                { label: 'Inverter Brand', value: assetsData?.data?.inverterBrand },
                { label: 'Amount of Inverters', value: assetsData?.data?.amountOfInverters },
                { label: 'Amount of Panels', value: assetsData?.data?.amountOfPanels },
                { label: 'Monitoring System', value: assetsData?.data?.monitoringSystemName },
              ].map((item, idx) => (
                <div key={idx} className='p-4 rounded-xl' style={{ background: 'var(--surface-overlay)' }}>
                  <p className='text-xs font-semibold uppercase tracking-wider mb-2' style={{ color: 'var(--text-muted)' }}>{item.label}</p>
                  <p className='text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>{item.value || 'N/A'}</p>
                </div>
              ))}
            </div>

            <div>
              <h3 className='text-lg font-bold mb-4' style={{ color: 'var(--text-primary)' }}>Asset Photos</h3>
              <div className='grid md:grid-cols-3 gap-6'>
                {[
                  { label: 'Building Photo', src: assetsData?.data?.buildingPhotoUpload },
                  { label: 'Inverter Setup', src: assetsData?.data?.inverterSetupPhotoUpload },
                  { label: 'Solar Panels', src: assetsData?.data?.solarPanelsPhotoUpload },
                ].map((photo, idx) => (
                  <motion.div
                    key={idx}
                    whileHover={{ scale: 1.02 }}
                    className='group relative overflow-hidden rounded-xl border-2 transition-all duration-200'
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <CustomImage
                      src={photo.src}
                      className='w-full h-48 object-cover'
                      width={300}
                      height={200}
                      style={{ objectFit: 'cover' }}
                    />
                    <div className='absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end'>
                      <p className='text-white font-semibold p-4'>{photo.label}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  )
}

export default Profile
