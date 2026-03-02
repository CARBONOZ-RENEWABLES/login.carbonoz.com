import { Form, FormInstance } from 'antd'
import { FC } from 'react'
import { FaFilter } from 'react-icons/fa'
import { timezones } from '../../config/constant'
import CustomButton from '../common/button/button'
import CustomInput from '../common/input/customInput'

interface CustomInputProps {
  Timezone: string
}

interface FilterTimeZonesFormProps {
  form: FormInstance
  onFinish: (values: CustomInputProps) => void
  defaultTimeZone?: string
}

const FilterTimeZones: FC<FilterTimeZonesFormProps> = ({
  form,
  onFinish,
  defaultTimeZone,
}) => {
  return (
    <div className='w-[100%]'>
      <div className='flex sm:flex-row flex-col sm:items-center sm:gap-4'>
        <Form
          className='sm:w-[35%] w-[100%]'
          name='filter-time'
          form={form}
          onFinish={onFinish}
          layout='vertical'
        >
          <CustomInput
            placeholder='Customer Timezone'
            label='Filter Timezone'
            name='Timezone'
            type='select'
            selectDefaultValue={defaultTimeZone}
            options={timezones.map((timezone, index) => ({
              key: index,
              value: timezone,
              label: timezone,
            }))}
          />
        </Form>
        <CustomButton
          type='primary'
          form='filter-time'
          htmlType='submit'
          className='h-[58px] sm:w-[58px] w-[100%] sm:mt-4 flex justify-center items-center'
          size='large'
        >
          <FaFilter />
        </CustomButton>
      </div>
    </div>
  )
}

export default FilterTimeZones
