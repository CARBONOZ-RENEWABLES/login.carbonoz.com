import { Form } from 'antd'
import { useNavigate } from 'react-router-dom'
import handleAPIRequests from '../../helpers/handleApiRequest'
import requiredField from '../../helpers/requiredField'
import {
  ResetPasswordDto,
  useResetPasswordMutation,
} from '../../lib/api/user/userEndPoints'
import { AuthLayout } from '../../layout/AuthLayout'
import CustomButton from '../common/button/button'
import CustomInput from '../common/input/customInput'
import Notify from '../common/notification/notification'

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
    <AuthLayout title='Set a new password' subtitle='Choose a password you have not used before.'>
      <Form name='sign-up-form' form={form} onFinish={onFinish} layout='vertical' requiredMark={false}>
        <CustomInput placeholder='Enter new password' label='Password' inputType='password' name='password' rules={requiredField('Password')} />
        <CustomInput placeholder='Confirm new password' label='Confirm password' inputType='password' name='confirmPassword' rules={requiredField('Confirm password')} />
        <CustomButton type='primary' className='h-11 w-full text-[14px]' form='sign-up-form' htmlType='submit' loading={isLoading} variant='primary'>
          {isLoading ? 'Saving…' : 'Save new password'}
        </CustomButton>
      </Form>
    </AuthLayout>
  )
}

export default ResetPassword
