import { Form } from 'antd'
import { useForm } from 'antd/es/form/Form'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Award, Check, CheckCircle, Lock, Shield } from 'lucide-react'
import handleAPIRequests from '../../helpers/handleApiRequest'
import {
  partnerResponse,
  useRegisterPartnersMutation,
} from '../../lib/api/partners/partnersEndPoints'
import { useGetAdditionalInfoQuery } from '../../lib/api/user/userEndPoints'
import CustomButton from '../common/button/button'
import { OnboardingTopBar } from '../../layout/OnboardingTopBar'
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
    <div className='flex h-dvh flex-col overflow-hidden'>
      <OnboardingTopBar firstName={data?.data?.firstName} lastName={data?.data?.lastName} />
      <div className='min-h-0 flex-1 overflow-y-auto'>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className='mx-auto w-full max-w-3xl px-4 pb-32 pt-8 sm:px-6 sm:pb-12 sm:pt-12'>
          <div className='text-center'>
            <span className='mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent/15 text-accent-ink'>
              <Shield size={22} />
            </span>
            <h1 className='mt-4 text-[24px] font-semibold tracking-[-0.02em] text-fg sm:text-[28px]'>Data sharing with third parties</h1>
            <p className='mx-auto mt-2 max-w-xl text-[14px] leading-relaxed text-fg-2'>
              As part of our services, we may need to share your data with the following third parties. Please select your preference below.
            </p>
          </div>

          <Form form={form} onFinish={onFinish} name='patners-form' className='mt-8' requiredMark={false}>
            <Form.Item name='partner' rules={requiredField('Option')} className='mb-0'>
              <PartnerCards />
            </Form.Item>
          </Form>

          <div className='mt-5 flex items-start gap-3 rounded-xl border border-line bg-panel-2 px-4 py-3.5'>
            <CheckCircle size={16} className='mt-0.5 shrink-0 text-batt' />
            <p className='text-[12.5px] leading-relaxed text-muted'>
              Please note that if you opt out of sharing your data with these third parties, you may still proceed with our onboarding process without any disruption to your experience. By continuing, you acknowledge that you have reviewed this information and understand your options.
            </p>
          </div>

          <div className='fixed inset-x-0 bottom-0 z-40 border-t border-line bg-panel/95 px-4 pt-3 backdrop-blur-lg sm:static sm:mt-7 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none' style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
            <CustomButton type='primary' className='h-11 w-full text-[14px] sm:ml-auto sm:flex sm:w-[220px]' form='patners-form' htmlType='submit' disabled={isLoading} loading={isLoading} variant='primary'>
              {isLoading ? 'Submitting…' : 'Continue'} {!isLoading && <ArrowRight size={16} />}
            </CustomButton>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

const OPTIONS = [
  { value: 'REDEX', title: 'Share with Redex', description: 'Register your installation with Redex to receive renewable energy certificates for the solar power you produce.', icon: Award, badge: 'Certificates' },
  { value: 'No', title: 'Don\'t share for now', description: 'Keep your data with CARBONOZ only. You can still monitor your system and complete onboarding.', icon: Lock },
]

/** Selectable option cards bound to the antd Form.Item value. */
function PartnerCards({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  return (
    <div role='radiogroup' aria-label='Data sharing preference' className='grid gap-3 sm:grid-cols-2'>
      {OPTIONS.map((o) => {
        const selected = value === o.value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            type='button'
            role='radio'
            aria-checked={selected}
            onClick={() => onChange?.(o.value)}
            className={`relative flex h-full flex-col rounded-2xl border bg-panel p-5 text-left shadow-card transition-all duration-150 ${selected ? 'border-accent ring-4 ring-accent/15' : 'border-line hover:-translate-y-px hover:border-line-strong'}`}
          >
            <span className='flex items-start justify-between gap-3'>
              <span className={`grid h-11 w-11 place-items-center rounded-xl ${selected ? 'bg-accent text-on-accent' : 'bg-panel-3 text-fg-2'}`}>
                <Icon size={20} />
              </span>
              <span className={`grid h-5 w-5 place-items-center rounded-full border-2 ${selected ? 'border-accent bg-accent' : 'border-line-strong'}`}>
                {selected && <Check size={12} strokeWidth={3.5} className='text-on-accent' />}
              </span>
            </span>
            <span className='mt-4 flex items-center gap-2 text-[15px] font-semibold text-fg'>
              {o.title}
              {o.badge && <span className='rounded-full bg-batt/10 px-2 py-0.5 text-[10.5px] font-medium text-batt'>{o.badge}</span>}
            </span>
            <span className='mt-1.5 text-[12.5px] leading-relaxed text-muted'>{o.description}</span>
          </button>
        )
      })}
    </div>
  )
}

export default ChoosePartnersTypeForm
