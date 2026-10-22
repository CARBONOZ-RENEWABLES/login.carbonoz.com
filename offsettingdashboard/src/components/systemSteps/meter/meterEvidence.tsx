import { Col, Form, Row } from 'antd'
import { FC, ReactElement, useEffect } from 'react'

import { FieldGuide } from '../../../design'
import CustomInput from '../../common/input/customInput'
import {
  MeterDTO,
  useAddMeterMutation,
  useGetMeterQuery,
} from '../../../lib/api/user/userEndPoints'
import handleAPIRequests from '../../../helpers/handleApiRequest'

interface props {
  setLoadingAction: (state: boolean) => void
  onSaved?: () => void
}

/** Production meter for carbon offsetting; every field is optional. */
const MeterInfo: FC<props> = ({ setLoadingAction, onSaved }): ReactElement => {
  const [form] = Form.useForm()

  const [addMeter] = useAddMeterMutation()

  const { data, refetch } = useGetMeterQuery()

  useEffect(() => {
    if (data?.data) {
      form.setFieldsValue(data.data)
    }
  }, [data, form])

  const onSuccess = () => {
    setLoadingAction(false)
    onSaved?.()
  }

  useEffect(() => {
    refetch()
  }, [refetch])

  const onFinish = async (values: MeterDTO) => {
    setLoadingAction(true)
    handleAPIRequests({
      request: addMeter,
      ...values,
      onSuccess: onSuccess,
      onError: () => setLoadingAction(false),
    })
  }

  return (
    <>
      <FieldGuide title='Field guide'>
        <ul className='list-disc ml-4 space-y-2'>
          <li>
            <strong>Meter ID:</strong> The unique identifier for the meter
            (e.g., Serial number or asset ID) (optional).
          </li>
          <li>
            <strong>Meter Brand:</strong> The brand or manufacturer of the meter
            (e.g., Siemens, Schneider) (optional).
          </li>
          <li>
            <strong>Meter Type:</strong> The type or model of the meter (e.g.,
            Smart meter, Analog meter) (optional).
          </li>
        </ul>
      </FieldGuide>
      <Form
        requiredMark={false}
        name='meter-info-form'
        form={form}
        onFinish={onFinish}
        layout='vertical'
      >
        <Row className='w-[100%]' gutter={16}>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Meter ID'
              label='Meter ID'
              inputType='text'
              name='meterId'
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Meter Brand'
              label='Meter Brand'
              inputType='text'
              name='meterBrand'
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Meter Type'
              label='Meter Type'
              inputType='text'
              name='meterType'
            />
          </Col>
        </Row>
      </Form>
    </>
  )
}

export default MeterInfo
