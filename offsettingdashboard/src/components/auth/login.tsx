/* eslint-disable @typescript-eslint/no-explicit-any */
import { Form } from 'antd'
import { FC, ReactElement } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock } from 'lucide-react'
import logo from '../../assets/1.jpg'
import { ERoles } from '../../config/constant'
import handleAPIRequests from '../../helpers/handleApiRequest'
import { setToLocal } from '../../helpers/handleStorage'
import requiredField from '../../helpers/requiredField'
import {
  AuthResponse,
  LoginDTO,
  useLoginMutation,
} from '../../lib/api/Auth/authEndpoints'
import CustomButton from '../common/button/button'
import CustomImage from '../common/image/customImage'
import CustomInput from '../common/input/customInput'
import Notify from '../common/notification/notification'

const Login: FC = (): ReactElement => {
  const [form] = Form.useForm()
  const [login, { isLoading }] = useLoginMutation()
  const navigate = useNavigate()

  const onSuccess = (res: AuthResponse): void => {
    if (res.data) {
      if (res.data.token) {
        setToLocal('token', res.data.token)
        if (res.data.user.role === ERoles.ADMIN) {
          navigate('/admin')
        } else {
          navigate('/ds')
        }
      } else {
        Notify({
          message: 'Error',
          description:
            'Your Email is not verified , we sent you a verification link to your email Address',
          duration: 0,
          type: 'error',
        })
      }
    }
  }

  const onFinish = (values: LoginDTO) => {
    handleAPIRequests({
      request: login,
      ...values,
      onSuccess: onSuccess,
    })
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
            <h2 className='text-2xl font-bold text-gray-900 mb-1'>Welcome back ☀️</h2>
            <p className='text-sm text-gray-600'>Access your dashboard and <span className='font-semibold text-[#DEAF0B]'>real-time energy analytics</span></p>
          </div>

          <Form
            name='login-form'
            form={form}
            onFinish={onFinish}
            layout='vertical'
          >
            <div className='mb-4'>
              <label className='flex items-center gap-2 text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-2'>
                <Mail size={14} style={{ color: '#DEAF0B' }} />
                Email address
              </label>
              <CustomInput
                placeholder='you@carbonoz.com'
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
                placeholder='••••••••'
                inputType='password'
                name='password'
                rules={requiredField('Password')}
              />
            </div>

            <div className='flex justify-end mb-5'>
              <Link
                to='/forgot-password'
                className='text-xs text-blue-600 hover:opacity-70 font-medium transition-opacity'
              >
                Forgot password?
              </Link>
            </div>

            <CustomButton
              type='primary'
              className='w-full h-14 text-base font-bold relative overflow-hidden'
              form='login-form'
              htmlType='submit'
              disabled={isLoading}
              variant='primary'
              style={{
                background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 45%, #fbbf24 100%)',
                boxShadow: '0 4px 20px rgba(232,137,10,0.40)',
                borderRadius: '13px'
              }}
            >
              {isLoading ? 'Processing...' : 'Sign In to Dashboard'}
            </CustomButton>

            <div className='mt-6 text-center text-sm text-gray-600'>
              Don't have an account?{' '}
              <Link
                to='/signup'
                className='font-semibold text-[#DEAF0B] hover:underline'
              >
                Create account
              </Link>
            </div>
          </Form>
        </div>


      </div>
    </div>
  )
}

export default Login
