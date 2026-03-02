import { Form, FormInstance } from 'antd'
import { FC } from 'react'
import { EUserStatus } from '../../config/constant'
import CustomInput from '../common/input/customInput'

interface CustomInputProps {
  status: string
}

interface ToogleActivationFormProps {
  form: FormInstance
  onFinish: (values: CustomInputProps) => void
}

const ToogleActivationForm: FC<ToogleActivationFormProps> = ({
  form,
  onFinish,
}) => {
  const options = [
    { value: EUserStatus.ENABLED, label: 'Enabled' },
    { value: EUserStatus.DISABLED, label: 'Disabled' },
  ]

  return (
    <div className='w-[100%]'>
      <Form
        className=' w-[100%]'
        name='toogle-status'
        form={form}
        onFinish={onFinish}
        layout='vertical'
      >
        <CustomInput
          placeholder='Status'
          label='Filter status'
          name='status'
          type='select'
          options={options}
        />
      </Form>
    </div>
  )
}

export default ToogleActivationForm
