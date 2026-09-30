import { normalizeLanguage } from '../../i18n/languages'
import { Col, Form, FormInstance, Row } from 'antd'
import { FC, useEffect } from 'react'
import { UserCircle } from 'lucide-react'
import { language, timezones } from '../../config/constant'
import { useWindowSize } from '../../helpers/interfaceSize'
import {
  AdditionalInfoInt,
  additionalInfoInt,
} from '../../lib/api/user/userEndPoints'
import CustomInput from '../common/input/customInput'

interface EditUserInformationFormProps {
  form: FormInstance
  data: AdditionalInfoInt | undefined
  onFinish: (values: additionalInfoInt) => void
}

const EditUserInformationForm: FC<EditUserInformationFormProps> = ({
  form,
  data,
  onFinish,
}) => {
  const { width } = useWindowSize()

  useEffect(() => {
    if (data) {
      // Profiles saved before languages had codes hold e.g. "English" / "french".
      form.setFieldsValue({ ...data, customerLanguage: normalizeLanguage(data.customerLanguage) ?? data.customerLanguage })
    }
  }, [data, form])

  return (
    <>
      <div className='mb-4 rounded-lg border border-line bg-panel-2 px-3.5 py-3'>
        <div className='flex items-start gap-2.5'>
          <UserCircle size={16} className='mt-0.5 shrink-0 text-accent-ink' />
          <p className='text-[12.5px] text-muted'>
            Update your personal information. All fields are optional but recommended for a complete profile.
          </p>
        </div>
      </div>
      <Form
        className=''
        name='edit-user-info-form'
        form={form}
        onFinish={onFinish}
        layout='vertical'
      >
        <Row className='w-[100%]' gutter={{ xs: 8, sm: 16, md: 16, lg: 16 }}>
          <Col className='gutter-row' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='First Name'
              label='First Name'
              inputType='text'
              name='firstName'
            />
          </Col>
          <Col className='gutter-row' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Last Name'
              label='Last Name'
              inputType='text'
              name='lastName'
            />
          </Col>
          <Col className='gutter-row' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Street'
              label='Street'
              inputType='text'
              name='street'
            />
          </Col>
          <Col className='gutter-row' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='City'
              label='City'
              inputType='text'
              name='city'
            />
          </Col>
          <Col className='gutter-row' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Telephone'
              label='Telephone'
              inputType='number'
              name='telephone'
            />
          </Col>
          <Col className='gutter-row' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Customer Language'
              label='Customer Language'
              name='customerLanguage'
              type='select'
              options={language.map((item) => ({
                key: item.value,
                value: item.value,
                label: item.label,
              }))}
            />
          </Col>
          <Col className='gutter-row' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Customer Timezone'
              label='Customer Timezone'
              name='customerTimezone'
              type='select'
              options={timezones.map((timezone, index) => ({
                key: index,
                value: timezone,
                label: timezone,
              }))}
            />
          </Col>
        </Row>
      </Form>
    </>
  )
}

export default EditUserInformationForm
