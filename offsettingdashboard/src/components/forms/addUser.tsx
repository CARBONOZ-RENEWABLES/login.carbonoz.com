import { Form, FormInstance } from 'antd'
import { FC } from 'react'
import { Mail } from 'lucide-react'
import CustomInput from '../common/input/customInput'

interface CustomInputProps {
  email: string
}

interface AddNewUserFormProps {
  form: FormInstance
  onFinish: (values: CustomInputProps) => void
}

const AddNewUserForm: FC<AddNewUserFormProps> = ({ form, onFinish }) => {
  return (
    <div className='w-[100%]'>
      <div className='mb-4 p-4 rounded-xl border' style={{ background: 'var(--surface-overlay)', borderColor: 'var(--border)' }}>
        <div className='flex items-start gap-3'>
          <Mail size={20} style={{ color: '#DEAF0B', marginTop: '2px' }} />
          <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
            Enter the email address for the new user. They will receive an invitation to set up their account.
          </p>
        </div>
      </div>
      <Form
        className='w-[100%]'
        name='add-user-form'
        form={form}
        onFinish={onFinish}
        layout='vertical'
      >
        <CustomInput
          placeholder='Enter email address'
          label='User email'
          name='email'
          type='normal'
          inputType='email'
        />
      </Form>
    </div>
  )
}

export default AddNewUserForm
