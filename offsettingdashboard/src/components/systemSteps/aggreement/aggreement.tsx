/* eslint-disable @typescript-eslint/no-explicit-any */
import { Col, Form, Row } from 'antd'
import { FC, ReactElement, useState } from 'react'
import { ESystemSteps } from '../../../config/constant'
import handleAPIRequests from '../../../helpers/handleApiRequest'
import requiredField from '../../../helpers/requiredField'
import uploadFile from '../../../helpers/uplaodFile'
import {
  AgreementDTO,
  useAddCertificateMutation,
} from '../../../lib/api/user/userEndPoints'
import CustomInput from '../../common/input/customInput'

interface props {
  makeStep: () => unknown
  setLoadingAction: (state: boolean) => void
}

const AgreementInfo: FC<props> = ({
  makeStep,
  setLoadingAction,
}): ReactElement => {
  const [form] = Form.useForm()

  const [addCertificate] = useAddCertificateMutation()

  const [powerPurchaseAgreement, setPowerPurchaseAgreement] = useState<File[]>(
    []
  )
  const [interconnectionAgreement, setInterconnectionAgreement] = useState<
    File[]
  >([])
  const [
    commissioningCertificationToGrid,
    setCommissioningCertificationToGrid,
  ] = useState<File[]>([])
  const [
    commissioningCertificationOrInspection,
    setCommissioningCertificationOrInspection,
  ] = useState<File[]>([])
  const [powerQualityTest, setPowerQualityTest] = useState<File[]>([])
  const [
    IDPhotoUploadorCompanyCertificate,
    setIDPhotoUploadorCompanyCertificate,
  ] = useState<File[]>([])
  const [, setUploadSuccess] = useState<boolean>(false)
  const [, setUploadFailure] = useState<boolean>(false)
  const [, setUploadedUrls] = useState<string[]>([])

  function onChangePowerPurchaseAgreement(e: any) {
    setPowerPurchaseAgreement(e)
  }

  function onChangeInterconnectionAgreement(e: any) {
    setInterconnectionAgreement(e)
  }

  function onChangeCommissioningCertificationToGrid(e: any) {
    setCommissioningCertificationToGrid(e)
  }

  function onChangeCommissioningCertificationOrInspection(e: any) {
    setCommissioningCertificationOrInspection(e)
  }

  function onChangePowerQualityTest(e: any) {
    setPowerQualityTest(e)
  }

  function onChangeIDPhotoUploadorCompanyCertificate(e: any) {
    setIDPhotoUploadorCompanyCertificate(e)
  }

  const onAddSucess = () => {}

  const onSuccess = () => {
    setLoadingAction(false)
    const data = {
      step: ESystemSteps.LAST_STEP,
    }
    handleAPIRequests({
      request: makeStep,
      ...data,
      onSuccess: onAddSucess,
      notify: true,
    })
  }

  const onFinish = async (values: AgreementDTO) => {
    setLoadingAction(true)
    values.powerPurchaseAgreement = 'placeholder'
    values.interconnectionAgreement = 'placeholder'
    values.commissioningCertificationToGrid = 'placeholder'
    values.commissioningCertificationOrInspection = 'placeholder'
    values.powerQualityTest = 'placeholder'
    values.IDPhotoUploadorCompanyCertificate = 'placeholder'
    
    handleAPIRequests({
      request: addCertificate,
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
            <strong>Power Purchase Agreement:</strong> Upload a file containing
            the agreement between the power producer and the purchaser outlining
            the terms of the power purchase. (optional)
          </li>
          <li>
            <strong>Interconnection Agreement:</strong> Upload a file containing
            the agreement for connecting the power system to the grid, including
            technical and operational details.(optional)
          </li>
          <li>
            <strong>Commissioning Certification to Grid:</strong> Upload a file
            with the certification confirming that the power system has been
            commissioned and is ready to connect to the grid. (optional)
          </li>
          <li>
            <strong>Commissioning Certification or Inspection:</strong> Upload a
            file with the certification or inspection report that verifies the
            system's commissioning and compliance with standards. (optional)
          </li>
          <li>
            <strong>Power Quality Test:</strong> Provide details or upload a
            file containing the results of the power quality tests conducted on
            the system. (optional)
          </li>
          <li>
            <strong>ID Photo Upload or Company Certificate:</strong> Upload a
            valid ID photo or a company certificate to verify the identity of
            the owner or entity associated with the asset.
          </li>
        </ul>
      </div>

      <Form
        className='space-y-12'
        name='agreement-info-form'
        form={form}
        onFinish={onFinish}
        layout='vertical'
      >
        <Row className='w-[100%]' gutter={{ xs: 8, sm: 16, md: 24, lg: 32 }}>
          <Col className='gutter-row mt-2 ' span={12}>
            <CustomInput
              placeholder='Power Purchase Agreement'
              label='Power Purchase Agreement'
              inputType='file'
              name='powerPurchaseAgreement'
              onChange={onChangePowerPurchaseAgreement}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={12}>
            <CustomInput
              placeholder='Interconnection Agreement'
              label='Interconnection Agreement'
              inputType='file'
              name='interconnectionAgreement'
              onChange={onChangeInterconnectionAgreement}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={12}>
            <CustomInput
              placeholder='Commissioning Certification to Grid'
              label='Commissioning Certification to Grid'
              inputType='file'
              name='commissioningCertificationToGrid'
              onChange={onChangeCommissioningCertificationToGrid}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={12}>
            <CustomInput
              placeholder='Commissioning Certification or Inspection'
              label='Commissioning Certification or Inspection'
              inputType='file'
              name='commissioningCertificationOrInspection'
              onChange={onChangeCommissioningCertificationOrInspection}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={12}>
            <CustomInput
              placeholder='Power Quality Test'
              label='Power Quality Test'
              inputType='file'
              name='powerQualityTest'
              onChange={onChangePowerQualityTest}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={12}>
            <CustomInput
              placeholder='ID Photo Upload or Company Certificate'
              label='ID Photo Upload or Company Certificate (Optional)'
              inputType='file'
              name='IDPhotoUploadorCompanyCertificate'
              onChange={onChangeIDPhotoUploadorCompanyCertificate}
            />
          </Col>
        </Row>
      </Form>
    </>
  )
}

export default AgreementInfo
