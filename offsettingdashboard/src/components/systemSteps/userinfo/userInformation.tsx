import { Col, Form, Row } from 'antd'
import { useForm } from 'antd/es/form/Form'
import { FC, ReactElement, useEffect } from 'react'
import { ESystemSteps, language, timezones } from '../../../config/constant'
import handleAPIRequests from '../../../helpers/handleApiRequest'
import { useWindowSize } from '../../../helpers/interfaceSize'
import requiredField from '../../../helpers/requiredField'
import {
  additionalInfoInt,
  useAddAdditionalInfoMutation,
  useGetAdditionalInfoQuery,
} from '../../../lib/api/user/userEndPoints'
import { FieldGuide } from '../../../design'
import CustomInput from '../../common/input/customInput'

interface Props {
  makeStep: () => unknown
  setLoadingAction: (state: boolean) => void
}

const UserInformation: FC<Props> = ({
  makeStep,
  setLoadingAction,
}): ReactElement => {
  const [form] = useForm()

  const { data, refetch } = useGetAdditionalInfoQuery()
  const [addAdditionalInfo] = useAddAdditionalInfoMutation()

  useEffect(() => {
    if (data?.data) {
      form.setFieldsValue(data.data)
    }
  }, [data, form])

  useEffect(() => {
    refetch()
  }, [refetch])

  const onAddSucess = () => {}

  const onSuccess = () => {
    setLoadingAction(false)
    const data = {
      step: ESystemSteps.ASSET,
    }
    handleAPIRequests({
      request: makeStep,
      ...data,
      onSuccess: onAddSucess,
      notify: true,
    })
  }

  const onFinish = (values: additionalInfoInt) => {
    setLoadingAction(true)
    handleAPIRequests({
      request: addAdditionalInfo,
      ...values,
      onSuccess: onSuccess,
    })
  }

  const { width } = useWindowSize()

  return (
    <>
      <FieldGuide title='Field guide'>
        <ul className='list-disc ml-4 space-y-2'>
          <li>
            <strong>First Name</strong>: The user's given name, e.g., John.
          </li>
          <li>
            <strong>Last Name</strong>: The user's family or surname, e.g., Doe.
          </li>
          <li>
            <strong>Street</strong>: The street address where the user resides.
          </li>
          <li>
            <strong>City</strong>: The city associated with the user's address.
          </li>
          <li>
            <strong>Telephone</strong>: The user's phone number, used for
            contact purposes.
          </li>
          <li>
            <strong>Customer Language</strong>: The preferred language of the
            user, chosen from a list of available languages.
          </li>
          <li>
            <strong>Customer Timezone</strong>: The timezone in which the user
            is located, used for scheduling and communication purposes.
          </li>
        </ul>
      </FieldGuide>

      <Form
        requiredMark={false}
        name='user-info-form'
        form={form}
        onFinish={onFinish}
        layout='vertical'
      >
        <Row className='w-[100%]' gutter={16}>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='First Name'
              customlabel={
                <span className='text-[12px] font-medium text-muted'>
                  First Name <span className='text-danger'>*</span>
                </span>
              }
              inputType='text'
              name='firstName'
              rules={requiredField('First Name')}
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Last Name'
              customlabel={
                <span className='text-[12px] font-medium text-muted'>
                  Last Name<span className='text-danger'>*</span>
                </span>
              }
              inputType='text'
              name='lastName'
              rules={requiredField('Last Name')}
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Street'
              customlabel={
                <span className='text-[12px] font-medium text-muted'>
                  Street<span className='text-danger'>*</span>
                </span>
              }
              inputType='text'
              name='street'
              rules={requiredField('Street')}
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='City'
              customlabel={
                <span className='text-[12px] font-medium text-muted'>
                  City<span className='text-danger'>*</span>
                </span>
              }
              inputType='text'
              name='city'
              rules={requiredField('City')}
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Telephone'
              customlabel={
                <span className='text-[12px] font-medium text-muted'>
                  Telephone<span className='text-danger'>*</span>
                </span>
              }
              inputType='number'
              name='telephone'
              rules={requiredField('Telephone')}
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Customer Language'
              customlabel={
                <span className='text-[12px] font-medium text-muted'>
                  Customer Language<span className='text-danger'>*</span>
                </span>
              }
              name='customerLanguage'
              type='select'
              options={language.map((item) => ({
                key: item.value,
                value: item.value,
                label: item.label,
              }))}
              rules={requiredField('Language')}
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Customer Timezone'
              customlabel={
                <span className='text-[12px] font-medium text-muted'>
                  Customer Timezone <span className='text-danger'>*</span>
                </span>
              }
              name='customerTimezone'
              type='select'
              options={timezones.map((timezone, index) => ({
                key: index,
                value: timezone,
                label: timezone,
              }))}
              rules={requiredField('Customer Timezone')}
            />
          </Col>
        </Row>
      </Form>
    </>
  )
}

export default UserInformation
