import { Col, Form, Row } from 'antd'
import { FC, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import handleAPIRequests from '../../../helpers/handleApiRequest'
import { setToLocal } from '../../../helpers/handleStorage'
import requiredField from '../../../helpers/requiredField'
import { AuthResponse } from '../../../lib/api/Auth/authEndpoints'
import {
  boxInterface,
  useRegisterBoxesMutation,
} from '../../../lib/api/box/boxEndPoints'
import CustomButton from '../../common/button/button'
import CustomInput from '../../common/input/customInput'
import { GeneralContentLoader } from '../../common/loader/loader'
import Notify from '../../common/notification/notification'

interface onFinishProps {
  mqttIpAddress: string
  mqttUsername: string
  mqttPassword: string
  mqttPort: string
  confirmPassword: string
}

interface BoxInformationInterfaceProps {
  boxesData: Array<boxInterface> | undefined
  isFetching: boolean
}

const BoxInformation: FC<BoxInformationInterfaceProps> = ({
  boxesData,
  isFetching,
}) => {
  const navigate = useNavigate()
  const [form] = Form.useForm()

  const [registerBox, { isLoading }] = useRegisterBoxesMutation()

  const onSuccess = (res: AuthResponse) => {
    setToLocal('token', res.data.token)
    navigate('/ds')
  }

  useEffect(() => {
    if (boxesData) {
      if (boxesData.length) {
        navigate('/ds')
      }
    }
    //eslint-disable-next-line
  }, [boxesData])

  const onFinish = async (values: onFinishProps) => {
    if (values.confirmPassword !== values.mqttPassword) {
      Notify({
        message: 'Error',
        description: 'Password do not match',
        type: 'error',
      })
    }
    const obj = {
      mqttIpAddress: values.mqttIpAddress,
      mqttUsername: values.mqttUsername,
      mqttPassword: values.mqttPassword,
      mqttPort: parseInt(values.mqttPort),
    }
    handleAPIRequests({
      request: registerBox,
      ...obj,
      onSuccess,
    })
  }

  if (isFetching) {
    return <GeneralContentLoader />
  }

  return (
    <div className='p-6'>
      <h1 className=' text-xl  text-[#DEAF0B] font-bold mb-4 '>
        MQTT information
      </h1>
      <div className='mb-8 p-4 border border-gray-300 rounded mr-8'>
        <h2 className='text-lg font-bold mb-2'>Field Descriptions</h2>
        <ul className='list-disc ml-4'>
          <li>
            <strong>MQTT IP Address</strong>: The IP address of the MQTT
            broker. This field is mandatory as it identifies the broker to
            which the client will connect.
          </li>
          <li>
            <strong>MQTT Port</strong>: The port number of the MQTT broker.
            It's mandatory because it specifies the network port to connect to
            the broker.
          </li>
          <li>
            <strong>MQTT Username</strong>: The username to authenticate with
            the MQTT broker. This is mandatory for secure communication.
          </li>
          <li>
            <strong>MQTT Password</strong>: The password to authenticate with
            the MQTT broker. This field is mandatory and should match the
            provided username.
          </li>
          <li>
            <strong>Confirm Password</strong>: Confirmation of the MQTT
            password to ensure accuracy. This is mandatory and must match the
            MQTT password.
          </li>
        </ul>
      </div>
      <div className='mb-4'>
        <Form form={form} name='box-info' onFinish={onFinish}>
          <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 32 }}>
            <Col className='gutter-row mt-2 ' span={12}>
              <CustomInput
                name='mqttIpAddress'
                placeholder='Mqtt broker Ip address'
                label='Mqtt broker address'
                rules={requiredField('Mqtt broker address ')}
              />
            </Col>
            <Col className='gutter-row mt-2 ' span={12}>
              <CustomInput
                name='mqttPort'
                placeholder='Mqtt broker Ip port'
                label='Mqtt broker port'
                rules={requiredField('Mqtt broker Ip port ')}
              />
            </Col>
            <Col className='gutter-row mt-2 ' span={12}>
              <CustomInput
                name='mqttUsername'
                placeholder='Mqtt broker username'
                label='Mqtt broker username'
                rules={requiredField('Mqtt username ')}
              />
            </Col>
            <Col className='gutter-row mt-2 ' span={12}>
              <CustomInput
                name='mqttPassword'
                placeholder='Mqtt broker password'
                label='Mqtt broker password'
                inputType='password'
                rules={requiredField('Mqtt password ')}
              />
            </Col>
            <Col className='gutter-row mt-2 ' span={12}>
              <CustomInput
                placeholder='Confirm password'
                label='Confirm password'
                inputType='password'
                name='confirmPassword'
                rules={requiredField('Confirm password')}
              />
            </Col>
          </Row>
        </Form>
      </div>
      <CustomButton
        htmlType='submit'
        form='box-info'
        type='primary'
        loading={isLoading}
        className=' w-[150px] h-[60px]'
      >
        Submit
      </CustomButton>
    </div>
  )
}

export default BoxInformation
