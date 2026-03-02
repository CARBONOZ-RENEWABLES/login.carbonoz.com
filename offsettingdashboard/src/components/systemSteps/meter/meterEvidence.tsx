/* eslint-disable @typescript-eslint/no-explicit-any */
import { Col, Form, Row } from 'antd'
import { FC, ReactElement, useEffect, useState } from 'react'
import requiredField from '../../../helpers/requiredField'

import CustomInput from '../../common/input/customInput'
import {
  MeterDTO,
  useAddMeterMutation,
  useGetMeterQuery,
} from '../../../lib/api/user/userEndPoints'
import { ESystemSteps } from '../../../config/constant'
import handleAPIRequests from '../../../helpers/handleApiRequest'
import uploadFile from '../../../helpers/uplaodFile'
import CustomImage from '../../common/image/customImage'

interface props {
  makeStep: () => unknown
  setLoadingAction: (state: boolean) => void
}

const MeterInfo: FC<props> = ({ setLoadingAction, makeStep }): ReactElement => {
  const [form] = Form.useForm()

  const [addMeter] = useAddMeterMutation()

  const { data, refetch } = useGetMeterQuery()

  useEffect(() => {
    if (data?.data) {
      form.setFieldsValue(data.data)
    }
  }, [data, form])

  const onAddSucess = () => {}

  const [meteringEvidencePhotoUpload, setMeteringEvidencePhotoUpload] =
    useState<File[]>([])
  const [, setUploadSuccess] = useState<boolean>(false)
  const [, setUploadFailure] = useState<boolean>(false)
  const [, setUploadedUrls] = useState<string[]>([])

  function onChangeMeteringEvidencePhotoUpload(e: any) {
    setMeteringEvidencePhotoUpload(e)
  }

  const onSuccess = () => {
    setLoadingAction(false)
    const data = {
      step: ESystemSteps.PROJECT,
    }
    handleAPIRequests({
      request: makeStep,
      ...data,
      onSuccess: onAddSucess,
      notify: true,
    })
  }

  useEffect(() => {
    refetch()
  }, [refetch])

  const onFinish = async (values: MeterDTO) => {
    setLoadingAction(true)
    values.meteringEvidencePhotoUpload = data?.data?.meteringEvidencePhotoUpload || 'placeholder'
    
    handleAPIRequests({
      request: addMeter,
      ...values,
      onSuccess: onSuccess,
      onError: () => setLoadingAction(false),
    })
  }

  return (
    <>
      <div className='mb-8 p-4 border border-gray-300 rounded  mr-8'>
        <h2 className='text-lg font-bold mb-4'>Field Explanations</h2>
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
          <li>
            <strong>Metering Evidence Photo Upload:</strong> Upload a photo
            showing evidence of the meter installation or reading. This field is
            required.
          </li>
        </ul>
      </div>
      <Form
        className='space-y-12'
        name='meter-info-form'
        form={form}
        onFinish={onFinish}
        layout='vertical'
      >
        <Row className='w-[100%]' gutter={{ xs: 8, sm: 16, md: 24, lg: 32 }}>
          <Col className='gutter-row mt-2 ' span={12}>
            <CustomInput
              placeholder='Meter ID'
              label='Meter ID'
              inputType='text'
              name='meterId'
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={12}>
            <CustomInput
              placeholder='Meter Brand'
              label='Meter Brand'
              inputType='text'
              name='meterBrand'
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={12}>
            <CustomInput
              placeholder='Meter Type'
              label='Meter Type'
              inputType='text'
              name='meterType'
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={12}>
            {data?.data ? (
              <div>
                <p className=' font-bold mb-2'>
                  Metering Evidence Photo Upload
                </p>
                <CustomImage
                  src={data.data.meteringEvidencePhotoUpload}
                  width={120}
                />
              </div>
            ) : (
              <CustomInput
                placeholder='Metering Evidence Photo Upload'
                label='Metering Evidence Photo Upload (Optional)'
                inputType='file'
                onChange={onChangeMeteringEvidencePhotoUpload}
                name='meteringEvidencePhotoUpload'
              />
            )}
          </Col>
        </Row>
      </Form>
    </>
  )
}

export default MeterInfo
