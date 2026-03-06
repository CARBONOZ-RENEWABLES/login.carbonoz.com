import { Form } from 'antd'
import { FC, ReactElement } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, User } from 'lucide-react'
import { ERoles } from '../../config/constant'
import handleAPIRequests from '../../helpers/handleApiRequest'
import { setToLocal } from '../../helpers/handleStorage'
import requiredField from '../../helpers/requiredField'
import {
  AuthResponse,
  SignupDTO,
  useSignupMutation,
} from '../../lib/api/Auth/authEndpoints'
import CustomButton from '../common/button/button'
import CustomInput from '../common/input/customInput'
import Notify from '../common/notification/notification'
import CustomImage from '../common/image/customImage'
import logo from '../../assets/1.jpg'

interface signupDto {
  email: string
  password: string
  confirmPassword: string
}

const Signup: FC = (): ReactElement => {
  const [form] = Form.useForm()

  const [signup, { isLoading }] = useSignupMutation()

  const navigate = useNavigate()

  const onSuccess = (res: AuthResponse): void => {
    form.resetFields()
    if (res.data) {
      if (res.data.token) {
        setToLocal('token', res.data.token)
        navigate('/onboarding')
      } else {
        Notify({
          message: 'Success',
          description: 'we sent you a verification link to your email Address',
          duration: 0,
        })
      }
    }
  }

  const onFinish = (values: signupDto) => {
    if (values.confirmPassword !== values.password) {
      Notify({
        message: 'Error',
        description: 'Password do not match',
        type: 'error',
      })
    } else {
      const data: SignupDTO = {
        ...values,
        role: ERoles.USER,
      }
      handleAPIRequests({
        request: signup,
        ...data,
        onSuccess: onSuccess,
      })
    }
  }

  return (
    <div className='min-h-screen w-full flex items-center justify-center background relative'>
      <div className='absolute inset-0 bg-black/40 backdrop-blur-[2px]' style={{ zIndex: 1 }} />
      
      <div className='relative z-10 w-[90%] max-w-xl'>
        <div
          className='backdrop-blur-xl rounded-3xl p-6 shadow-2xl border relative overflow-hidden'
          style={{
            background: 'rgba(255,255,255,0.92)',
            borderColor: 'rgba(222,175,11,0.25)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.95) inset'
          }}
        >
          <div className='absolute top-0 left-[8%] right-[8%] h-[2px] bg-gradient-to-r from-transparent via-[#DEAF0B] to-transparent' />
          <div className='absolute top-[-80px] right-[-80px] w-[220px] h-[220px] rounded-full' style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.12) 0%, transparent 70%)' }} />

          <div className='flex flex-col items-center mb-8'>
            <div className='relative mb-4'>
              <div className='absolute inset-0 rounded-2xl animate-pulse' style={{ background: 'conic-gradient(from 0deg, #DEAF0B, transparent, #DEAF0B)', filter: 'blur(20px)', opacity: 0.5 }} />
              <div className='relative bg-gradient-to-br from-[#DEAF0B] to-[#c49a0a] p-1 rounded-2xl shadow-lg'>
                <div className='bg-black/20 backdrop-blur-sm rounded-xl p-3'>
                  <CustomImage
                    src={logo}
                    alt='logo'
                    className='rounded-lg'
                    width={52}
                    height={52}
                    style={{ objectFit: 'cover' }}
                  />
                </div>
              </div>
            </div>
            <h1 className='text-3xl font-extrabold tracking-tight bg-gradient-to-r from-[#1a1a2e] to-[#DEAF0B] bg-clip-text text-transparent'>
              carbonoz
            </h1>
            <p className='text-[10px] text-gray-500 font-semibold uppercase tracking-widest mt-1'>
              Intelligent Solar Energy Management
            </p>
          </div>

          <div className='mb-6'>
            <h2 className='text-2xl font-bold text-gray-900 mb-1'>Start your solar journey</h2>
            <p className='text-sm text-gray-600'>Join <span className='font-semibold text-[#DEAF0B]'>12,400+ energy operators</span> managing smarter, cleaner grids</p>
          </div>

          <Form
            name='sign-up-form'
            form={form}
            onFinish={onFinish}
            layout='vertical'
          >
            <div className='mb-4'>
              <label className='flex items-center gap-2 text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-2'>
                <Mail size={14} style={{ color: '#DEAF0B' }} />
                Work email
              </label>
              <CustomInput
                placeholder='you@company.com'
                inputType='email'
                name='email'
                rules={requiredField('Email')}
              />
            </div>

            <div className='mb-4'>
              <label className='flex items-center gap-2 text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-2'>
                <Lock size={14} style={{ color: '#DEAF0B' }} />
                Password
              </label>
              <CustomInput
                placeholder='Create a strong password'
                inputType='password'
                name='password'
                rules={requiredField('Password')}
              />
            </div>

            <div className='mb-5'>
              <label className='flex items-center gap-2 text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-2'>
                <Lock size={14} style={{ color: '#DEAF0B' }} />
                Confirm password
              </label>
              <CustomInput
                placeholder='Re-enter your password'
                inputType='password'
                name='confirmPassword'
                rules={requiredField('Confirm password')}
              />
            </div>

            <div className='flex items-start gap-2 mb-5'>
              <input type='checkbox' id='terms' className='w-4 h-4 mt-0.5 accent-[#DEAF0B]' />
              <label htmlFor='terms' className='text-xs text-gray-600 leading-relaxed'>
                I agree to the <a href='#' className='text-[#DEAF0B] font-medium hover:underline'>Terms of Service</a> and <a href='#' className='text-[#DEAF0B] font-medium hover:underline'>Privacy Policy</a>.
                Carbonoz may send me product and energy insights.
              </label>
            </div>

            <CustomButton
              type='primary'
              className='w-full h-14 text-base font-bold relative overflow-hidden'
              form='sign-up-form'
              htmlType='submit'
              disabled={isLoading}
              variant='primary'
              style={{
                background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 45%, #fbbf24 100%)',
                boxShadow: '0 4px 20px rgba(232,137,10,0.40)',
                borderRadius: '13px'
              }}
            >
              {isLoading ? 'Processing...' : 'Create Free Account →'}
            </CustomButton>

            <div className='flex items-center gap-3 my-5'>
              <div className='flex-1 h-[1px] bg-gray-200' />
              <span className='text-xs text-gray-400 font-medium'>already have an account?</span>
              <div className='flex-1 h-[1px] bg-gray-200' />
            </div>

            <div className='text-center'>
              <Link
                to='/'
                className='text-sm font-semibold text-[#DEAF0B] hover:underline'
              >
                Sign in instead
              </Link>
            </div>
          </Form>
        </div>


      </div>
    </div>
  )
}

export default Signup
