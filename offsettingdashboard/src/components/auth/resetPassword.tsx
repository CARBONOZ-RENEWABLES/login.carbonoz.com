import { Col, Form, Row } from 'antd'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import handleAPIRequests from '../../helpers/handleApiRequest'
import requiredField from '../../helpers/requiredField'
import {
  ResetPasswordDto,
  useResetPasswordMutation,
} from '../../lib/api/user/userEndPoints'
import CustomButton from '../common/button/button'
import CustomInput from '../common/input/customInput'
import Notify from '../common/notification/notification'
import CustomImage from '../common/image/customImage'
import logo from '../../assets/1.jpg'

interface resetDto {
  password: string
  confirmPassword: string
}

const ResetPassword = () => {
  const [form] = Form.useForm()

  const [reset, { isLoading }] = useResetPasswordMutation()

  const navigate = useNavigate()

  const onSuccess = () => {
    navigate('/ds')
  }

  const onFinish = (values: resetDto) => {
    if (values.confirmPassword !== values.password) {
      Notify({
        message: 'Error',
        description: 'Password do not match',
        type: 'error',
      })
    } else {
      const data: ResetPasswordDto = {
        password: values.password,
      }
      handleAPIRequests({
        request: reset,
        ...data,
        onSuccess: onSuccess,
        notify: true,
      })
    }
  }

  return (
    <div className='h-[100vh] w-[100%] items-center justify-center flex flex-row background'>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className='border rounded-xl p-8 xl:w-[40%] 2xl:w-[32%] md:w-[45%] w-[90%] lg:w-[45%] h-fit shadow-xl'
        style={{ 
          background: 'var(--surface-raised)', 
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-md)'
        }}
      >
        <section className='flex justify-center mb-6'>
          <motion.div
            whileHover={{ scale: 1.05 }}
            className='flex flex-col items-center gap-3'
          >
            <div className="relative">
              <CustomImage
                src={logo}
                alt='logo'
                className='rounded-xl'
                width={60}
                height={60}
                style={{ objectFit: 'cover' }}
              />
              <div className="absolute -inset-2 bg-[#DEAF0B]/20 rounded-xl blur-md -z-10" />
            </div>
            <h1 className='text-2xl font-bold tracking-tight' style={{ color: '#DEAF0B' }}>
              CARBONOZ
            </h1>
          </motion.div>
        </section>

        <h5 className='text-xl font-bold text-center mb-2' style={{ color: 'var(--text-primary)' }}>
          Update Password
        </h5>
        <p className='text-sm text-center mb-8' style={{ color: 'var(--text-secondary)' }}>
          Enter your new password
        </p>

        <Form
          className='space-y-6'
          name='sign-up-form'
          form={form}
          onFinish={onFinish}
        >
          <Row className='w-[100%]'>
            <Col className='gutter-row w-full'>
              <CustomInput
                placeholder='Enter new password'
                label='Password'
                inputType='password'
                name='password'
                rules={requiredField('Password')}
              />
            </Col>
            <Col className='gutter-row w-full'>
              <CustomInput
                placeholder='Confirm new password'
                label='Confirm password'
                inputType='password'
                name='confirmPassword'
                rules={requiredField('Confirm password')}
              />
            </Col>
          </Row>

          <div className='flex items-center justify-center pt-2'>
            <CustomButton
              type='primary'
              className='w-[100%] h-[52px] text-base'
              form='sign-up-form'
              htmlType='submit'
              loading={isLoading}
              disabled={isLoading}
              variant='primary'
            >
              UPDATE PASSWORD
            </CustomButton>
          </div>
        </Form>
      </motion.div>
    </div>
  )
}

export default ResetPassword
