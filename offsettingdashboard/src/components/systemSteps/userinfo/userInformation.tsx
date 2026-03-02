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
      <div className='mb-8 p-4 border border-gray-300 rounded  mr-8'>
        <h2 className='text-lg font-bold mb-4'>Fields Explanations</h2>
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
      </div>

      <Form
        className='space-y-12'
        name='user-info-form'
        form={form}
        onFinish={onFinish}
        layout='vertical'
      >
        <Row className='w-[100%]' gutter={{ xs: 8, sm: 16, md: 24, lg: 32 }}>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='First Name'
              customlabel={
                <span className=' font-bold'>
                  First Name <span className='text-red-500'>*</span>
                </span>
              }
              inputType='text'
              name='firstName'
              rules={requiredField('First Name')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Last Name'
              customlabel={
                <span className=' font-bold'>
                  Last Name<span className='text-red-500'>*</span>
                </span>
              }
              inputType='text'
              name='lastName'
              rules={requiredField('Last Name')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Street'
              customlabel={
                <span className=' font-bold'>
                  Street<span className='text-red-500'>*</span>
                </span>
              }
              inputType='text'
              name='street'
              rules={requiredField('Street')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='City'
              customlabel={
                <span className=' font-bold'>
                  City<span className='text-red-500'>*</span>
                </span>
              }
              inputType='text'
              name='city'
              rules={requiredField('City')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Telephone'
              customlabel={
                <span className=' font-bold'>
                  Telephone<span className='text-red-500'>*</span>
                </span>
              }
              inputType='number'
              name='telephone'
              rules={requiredField('Telephone')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Customer Language'
              customlabel={
                <span className=' font-bold'>
                  Customer Language<span className='text-red-500'>*</span>
                </span>
              }
              name='customerLanguage'
              type='select'
              options={language.map((item, index) => ({
                key: index,
                value: item,
                label: item,
              }))}
              rules={requiredField('Language')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Customer Timezone'
              customlabel={
                <span className=' font-bold'>
                  Customer Timezone <span className='text-red-500'>*</span>
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
