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

            <div className='flex items-center gap-3 my-5'>
              <div className='flex-1 h-[1px] bg-gray-200' />
              <span className='text-xs text-gray-400 font-medium'>or continue with</span>
              <div className='flex-1 h-[1px] bg-gray-200' />
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <button
                type='button'
                className='flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-200 bg-white/80 text-gray-600 text-sm font-medium hover:bg-white hover:border-[#DEAF0B]/30 transition-all'
              >
                <svg width="15" height="15" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Google
              </button>
              <button
                type='button'
                className='flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-200 bg-white/80 text-gray-600 text-sm font-medium hover:bg-white hover:border-[#DEAF0B]/30 transition-all'
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
                Apple
              </button>
            </div>

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

        <div className='flex items-center justify-center gap-5 mt-4 text-xs text-gray-300'>
          <div className='flex items-center gap-1'>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            256-bit SSL
          </div>
          <div className='flex items-center gap-1'>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            GDPR compliant
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
