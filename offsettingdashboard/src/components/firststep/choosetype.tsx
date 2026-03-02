import { Form } from 'antd'
import { useForm } from 'antd/es/form/Form'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Shield, CheckCircle } from 'lucide-react'
import handleAPIRequests from '../../helpers/handleApiRequest'
import {
  partnerResponse,
  useRegisterPartnersMutation,
} from '../../lib/api/partners/partnersEndPoints'
import { useGetAdditionalInfoQuery } from '../../lib/api/user/userEndPoints'
import CustomButton from '../common/button/button'
import NavBar from '../common/header/header'
import CustomInput from '../common/input/customInput'
import { GeneralContentLoader } from '../common/loader/loader'
import Notify from '../common/notification/notification'
import requiredField from '../../helpers/requiredField'

interface submitOptions {
  partner: string
}

const ChoosePartnersTypeForm = () => {
  const { data, isFetching } = useGetAdditionalInfoQuery()
  const [form] = useForm()

  const [registerpartner, { isLoading }] = useRegisterPartnersMutation()

  const navigate = useNavigate()

  const onSuccess = (res: partnerResponse): void => {
    if (res.data) {
      res.data.partner.forEach((partner: string) => {
        if (partner === 'REDEX') {
          navigate('/redexsteps')
        }
        if (partner === 'No') {
          navigate('/systemsteps')
        }
      })
    }
  }

  const onFinish = (values: submitOptions) => {
    if (!values.partner) {
      Notify({
        message: 'Error',
        description: 'Please choose an option',
        type: 'error',
      })
      return
    } else {
      const obj = {
        partner: [values.partner],
      }
      handleAPIRequests({
        request: registerpartner,
        ...obj,
        onSuccess: onSuccess,
      })
    }
  }

  if (isFetching) {
    return <GeneralContentLoader />
  }
  return (
    <div className='flex flex-col overflow-y-hidden 2xl:h-[100vh] xl:h-[100%] lg:h-[100%] h-[100%]' style={{ background: 'var(--surface-base)' }}>
      <NavBar data={data?.data} additional={true} />
      <div className='p-10 flex justify-center overflow-y-auto'>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className='max-w-3xl w-full'
        >
          <div className='flex items-center gap-4 mb-8'>
            <div className='w-12 h-12 rounded-xl flex items-center justify-center' style={{ background: 'rgba(222,175,11,0.1)' }}>
              <Shield size={24} style={{ color: '#DEAF0B' }} />
            </div>
            <div>
              <h1 className='text-2xl font-bold tracking-tight' style={{ color: 'var(--text-primary)' }}>
                Data Sharing with Third Parties
              </h1>
              <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
                Choose your data sharing preferences
              </p>
            </div>
          </div>

          <div className='p-6 rounded-xl border mb-6' style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}>
            <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
              As part of our services, we may need to share your data with the following third parties. Please select your preference below.
            </p>
          </div>

          <Form form={form} onFinish={onFinish} name='patners-form'>
            <CustomInput
              label='Choose an option'
              type='radio'
              name='partner'
              options={[
                { label: 'Redex', value: 'REDEX' },
                { label: 'No', value: 'No' },
              ]}
              rules={requiredField('Option')}
            />
          </Form>

          <div className='p-6 rounded-xl border mb-8' style={{ background: 'var(--surface-overlay)', borderColor: 'var(--border)' }}>
            <div className='flex items-start gap-3'>
              <CheckCircle size={20} style={{ color: '#DEAF0B', marginTop: '2px' }} />
              <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
                Please note that if you opt out of sharing your data with these third parties, you may still proceed with our onboarding process without any disruption to your experience. By continuing, you acknowledge that you have reviewed this information and understand your options.
              </p>
            </div>
          </div>

          <div className='flex items-center justify-start'>
            <CustomButton
              type='primary'
              className='w-full lg:w-[50%] h-[52px]'
              form='patners-form'
              htmlType='submit'
              disabled={isLoading}
              variant='primary'
            >
              {isLoading ? 'SUBMITTING...' : 'CONTINUE'}
            </CustomButton>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default ChoosePartnersTypeForm
