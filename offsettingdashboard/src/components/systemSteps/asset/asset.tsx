/* eslint-disable @typescript-eslint/no-explicit-any */
import { Col, Form, Row } from 'antd'
import { FC, ReactElement, useEffect, useMemo, useState } from 'react'
import countryList from 'react-select-country-list'
import {
  ESystemSteps,
  fuelOptions,
  InverterBrand,
} from '../../../config/constant'
import handleAPIRequests from '../../../helpers/handleApiRequest'
import { useWindowSize } from '../../../helpers/interfaceSize'
import requiredField from '../../../helpers/requiredField'
import uploadFile from '../../../helpers/uplaodFile'
import {
  AssetDTO,
  useAddAssetMutation,
  useGetAssetsQuery,
} from '../../../lib/api/user/userEndPoints'
import CustomImage from '../../common/image/customImage'
import CustomInput from '../../common/input/customInput'

interface props {
  makeStep: () => unknown
  setLoadingAction: (state: boolean) => void
}

const Assets: FC<props> = ({ makeStep, setLoadingAction }): ReactElement => {
  const [form] = Form.useForm()

  const options = useMemo(() => countryList().getData(), [])

  const [addAsset] = useAddAssetMutation()
  const { data, refetch } = useGetAssetsQuery()

  const [solarPanelsPhotoUpload, setSolarPanelsPhotoUpload] = useState<File[]>(
    []
  )
  const [buildingPhotoUpload, setBuildingPhotoUpload] = useState<File[]>([])
  const [inverterSetupPhotoUpload, setInverterSetupPhotoUpload] = useState<
    File[]
  >([])
  const [, setUploadSuccess] = useState<boolean>(false)
  const [, setUploadFailure] = useState<boolean>(false)
  const [, setUploadedUrls] = useState<string[]>([])

  function onChangeSolarPanelsPhotoUpload(e: any) {
    setSolarPanelsPhotoUpload(e)
  }
  function onChangeBuildingPhotoUpload(e: any) {
    setBuildingPhotoUpload(e)
  }
  function onChangeInverterSetupPhotoUpload(e: any) {
    setInverterSetupPhotoUpload(e)
  }

  const onAddSucess = () => {}

  const onSuccess = () => {
    const data = {
      step: ESystemSteps.METERING_EVIDENCE,
    }
    setLoadingAction(false)
    handleAPIRequests({
      request: makeStep,
      ...data,
      onSuccess: onAddSucess,
      notify: true,
    })
  }

  const onFinish = async (values: AssetDTO) => {
    setLoadingAction(true)
    values.latitude = parseFloat(`${values.latitude}`)
    values.longitude = parseFloat(`${values.longitude}`)
    values.capacityKwp = parseFloat(`${values.capacityKwp}`)
    values.amountOfInverters = parseInt(`${values.amountOfInverters}`)
    values.amountOfPanels = parseInt(`${values.amountOfPanels}`)
    values.amountOfBatteries = parseInt(`${values.amountOfBatteries}`) || 0
    values.panelPower = parseInt(`${values.panelPower}`)
    
    values.solarPanelsPhotoUpload = data?.data?.solarPanelsPhotoUpload || 'placeholder'
    values.buildingPhotoUpload = data?.data?.buildingPhotoUpload || 'placeholder'
    values.inverterSetupPhotoUpload = data?.data?.inverterSetupPhotoUpload || 'placeholder'
    
    handleAPIRequests({
      request: addAsset,
      ...values,
      onSuccess,
      onError: () => setLoadingAction(false),
    })
  }

  useEffect(() => {
    refetch()
  }, [refetch])

  useEffect(() => {
    if (data?.data) {
      form.setFieldsValue(data.data)
    }
  }, [data, form])

  const { width } = useWindowSize()

  const latitudeRegex = /^-?([1-8]?[0-9](\.\d+)?|90(\.0+)?)$/
  const longitudeRegex =
    /^-?((1[0-7][0-9](\.\d+)?)|([1-9]?[0-9](\.\d+)?)|180(\.0+)?)$/

  return (
    <>
      <div className='mb-8 p-4 border border-gray-300 rounded mr-8'>
        <h2 className='text-lg font-bold mb-4'>Fields Explanations</h2>
        <ul className='list-disc ml-4 space-y-2'>
          <li>
            <strong>Asset Name:</strong> The unique name of the asset (e.g.,
            Solar Plant A).
          </li>
          <li>
            <strong>Asset Owner:</strong> Name of the individual or company that
            owns the asset.
          </li>
          <li>
            <strong>Fuel Type:</strong> The primary energy source of the asset
            (e.g., Solar, Wind).
          </li>
          <li>
            <strong>Country:</strong> The country where the asset is located.
          </li>
          <li>
            <strong>Latitude:</strong> Latitude coordinate for the asset's
            location (value must be between -90 and 90).
          </li>
          <li>
            <strong>Longitude:</strong> Longitude coordinate for the asset's
            location (value must be between -180 and 180).
          </li>
          <li>
            <strong>Capacity Kwp:</strong> The total power capacity of the asset
            in kilowatts peak (Kwp).
          </li>
          <li>
            <strong>Service:</strong> The type of service provided by the asset
            (e.g., Power Generation).
          </li>
          <li>
            <strong>COD Date:</strong> Commercial Operation Date (the date when
            the asset became operational).
          </li>
          <li>
            <strong>Amount of Inverters:</strong> Total number of inverters
            installed in the asset.
          </li>
          <li>
            <strong>Amount of Panels:</strong> Total number of solar panels in
            the asset (if applicable).
          </li>
          <li>
            <strong>Panel Brand:</strong> The brand of the solar panels used.
          </li>
          <li>
            <strong>Panel Power (W):</strong> The power rating of each solar
            panel in watts.
          </li>
          <li>
            <strong>Amount of Batteries:</strong> Total number of batteries in
            the system (optional).
          </li>
          <li>
            <strong>Battery Brand:</strong> The brand of the batteries used
            (optional).
          </li>
          <li>
            <strong>Battery Model:</strong> The model of the batteries used
            (optional).
          </li>
          <li>
            <strong>Inverter Brand:</strong> The brand of the inverters used.
          </li>
          <li>
            <strong>Inverter Model:</strong> The model of the inverters
            installed.
          </li>
          <li>
            <strong>Monitoring System Name:</strong> Name of the monitoring
            system used for the asset.
          </li>
          <li>
            <strong>Monitoring System URL:</strong> URL of the monitoring system
            interface.
          </li>
          <li>
            <strong>Building Photo Upload:</strong> Upload a photo of the
            building or site where the asset is installed.
          </li>
          <li>
            <strong>Inverter Setup Photo Upload:</strong> Upload a photo showing
            the inverter setup.
          </li>
          <li>
            <strong>Solar Panels Photo Upload:</strong> Upload a photo showing
            the solar panels installed.
          </li>
          <li>
            <strong>Battery Serial Number 1:</strong> Serial number of the first
            battery used in the system.
          </li>
          <li>
            <strong>Battery Serial Number 2:</strong> Serial number of the
            second battery used in the system (if applicable).
          </li>
          <li>
            <strong>Battery Serial Number 3:</strong> Serial number of the third
            battery used in the system (if applicable).
          </li>
          <li>
            <strong>Inverter Serial Number 1:</strong> Serial number of the
            first inverter used in the system.
          </li>
        </ul>
      </div>

      <Form
        className='space-y-12'
        name='asset-info-form'
        form={form}
        onFinish={onFinish}
        layout='vertical'
      >
        <Row className='w-[100%]' gutter={{ xs: 8, sm: 16, md: 24, lg: 32 }}>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Asset name'
              customlabel={
                <span className=' font-bold'>
                  Asset name<span className='text-red-500'>*</span>
                </span>
              }
              inputType='text'
              name='assetName'
              rules={requiredField('Asset name')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Asset Owner'
              customlabel={
                <span className=' font-bold'>
                  Asset Owner<span className='text-red-500'>*</span>
                </span>
              }
              inputType='text'
              name='assetOwner'
              rules={requiredField('Asset Owner')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Fuel type'
              customlabel={
                <span className=' font-bold'>
                  Fuel type<span className='text-red-500'>*</span>
                </span>
              }
              type='select'
              name='fuelType'
              options={fuelOptions.map((item) => ({
                key: item.id,
                value: item.fuelType,
                label: item.fuelType,
              }))}
              rules={requiredField('Fuel type')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Country'
              customlabel={
                <span className=' font-bold'>
                  Country<span className='text-red-500'>*</span>
                </span>
              }
              inputType='text'
              name='country'
              type='select'
              options={options.map((item) => ({
                key: item.value,
                value: item.label,
                label: item.label,
              }))}
              rules={requiredField('Country')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Latitude'
              customlabel={
                <span className=' font-bold'>
                  Latitude<span className='text-red-500'>*</span>
                </span>
              }
              inputType='number'
              name='latitude'
              rules={[
                {
                  pattern: latitudeRegex,
                  message:
                    'Latitude must be between -90 and 90 with up to 6 decimal places.',
                },
              ]}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Longitude'
              customlabel={
                <span className=' font-bold'>
                  Longitude<span className='text-red-500'>*</span>
                </span>
              }
              inputType='number'
              name='longitude'
              rules={[
                {
                  pattern: longitudeRegex,
                  message:
                    'Longitude must be between -180 and 180 with up to 6 decimal places.',
                },
              ]}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Capacity Kwp'
              customlabel={
                <span className=' font-bold'>
                  Capacity Kwp<span className='text-red-500'>*</span>
                </span>
              }
              inputType='number'
              name='capacityKwp'
              rules={requiredField('Capacity Kwp')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Service'
              customlabel={
                <span className=' font-bold'>
                  Service<span className='text-red-500'>*</span>
                </span>
              }
              inputType='text'
              name='service'
              rules={requiredField('Service')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='COD Date'
              customlabel={
                <span className=' font-bold'>
                  COD Date<span className='text-red-500'>*</span>
                </span>
              }
              inputType='date'
              name='codDate'
              rules={requiredField('COD Date')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Amount of Inverters'
              customlabel={
                <span className=' font-bold'>
                  Amount of Inverters<span className='text-red-500'>*</span>
                </span>
              }
              inputType='number'
              name='amountOfInverters'
              rules={requiredField('Amount of Inverters')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Amount of Panels'
              customlabel={
                <span className=' font-bold'>
                  Amount of Panels<span className='text-red-500'>*</span>
                </span>
              }
              inputType='number'
              name='amountOfPanels'
              rules={requiredField('Amount of Panels')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Panel Brand'
              customlabel={
                <span className=' font-bold'>
                  Panel Brand<span className='text-red-500'>*</span>
                </span>
              }
              inputType='text'
              name='panelBrand'
              rules={requiredField('Panel Brand')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Panel Power (W)'
              customlabel={
                <span className=' font-bold'>
                  Panel Power (W)<span className='text-red-500'>*</span>
                </span>
              }
              inputType='number'
              name='panelPower'
              rules={requiredField('Panel Power')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Amount of Batteries'
              label='Amount of Batteries'
              inputType='number'
              name='amountOfBatteries'
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Battery Brand'
              label='Battery Brand'
              inputType='text'
              name='batteryBrand'
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Battery Model'
              label='Battery Model'
              inputType='text'
              name='batteryModel'
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Inverter Model'
              customlabel={
                <span className=' font-bold'>
                  Inverter Model<span className='text-red-500'>*</span>
                </span>
              }
              inputType='text'
              name='inverterModel'
              rules={requiredField('Inverter Model')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Monitoring System Name'
              customlabel={
                <span className=' font-bold'>
                  Monitoring System Name<span className='text-red-500'>*</span>
                </span>
              }
              inputType='text'
              name='monitoringSystemName'
              rules={requiredField('Monitoring System Name')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Monitoring System URL'
              customlabel={
                <span className=' font-bold'>
                  Monitoring System URL<span className='text-red-500'>*</span>
                </span>
              }
              inputType='text'
              name='monitoringSystemURL'
              rules={requiredField('Monitoring System URL')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            {data?.data ? (
              <div>
                <p className=' font-bold mb-2'>Building Photo Upload</p>
                <CustomImage src={data.data.buildingPhotoUpload} width={120} />
              </div>
            ) : (
              <CustomInput
                placeholder='Building Photo Upload'
                inputType='file'
                name='buildingPhotoUpload'
                label='Building Photo Upload (Optional)'
                onChange={onChangeBuildingPhotoUpload}
              />
            )}
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            {data?.data ? (
              <div>
                <p className=' font-bold mb-2'>Inverter Setup Photo Upload</p>
                <CustomImage
                  src={data.data.inverterSetupPhotoUpload}
                  width={120}
                />
              </div>
            ) : (
              <CustomInput
                placeholder='Inverter Setup Photo Upload'
                label='Inverter Setup Photo Upload (Optional)'
                inputType='file'
                name='inverterSetupPhotoUpload'
                onChange={onChangeInverterSetupPhotoUpload}
              />
            )}
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            {data?.data ? (
              <div>
                <p className=' font-bold mb-2'> Solar Panels Photo Upload</p>
                <CustomImage
                  src={data.data.solarPanelsPhotoUpload}
                  width={120}
                />
              </div>
            ) : (
              <CustomInput
                placeholder='Solar Panels Photo Upload'
                label='Solar Panels Photo Upload (Optional)'
                inputType='file'
                name='solarPanelsPhotoUpload'
                onChange={onChangeSolarPanelsPhotoUpload}
              />
            )}
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Inverter brand'
              customlabel={
                <span className=' font-bold'>
                  Inverter brand<span className='text-red-500'>*</span>
                </span>
              }
              type='select'
              name='inverterBrand'
              options={InverterBrand.map((item, idx) => ({
                key: idx,
                value: item,
                label: item,
              }))}
              rules={requiredField('inverterBrand')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Battery Serial Number 1'
              customlabel={
                <span className='font-bold'>Battery Serial Number 1</span>
              }
              inputType='text'
              name='BatterySerialNumber1'
              rules={requiredField('Battery Serial Number 1')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Battery Serial Number 2'
              customlabel={
                <span className='font-bold'>Battery Serial Number 2</span>
              }
              inputType='text'
              name='BatterySerialNumber2'
              rules={requiredField('Battery Serial Number 2')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Battery Serial Number 3'
              customlabel={
                <span className='font-bold'>Battery Serial Number 3</span>
              }
              inputType='text'
              name='BatterySerialNumber3'
              rules={requiredField('Battery Serial Number 3')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Inverter Serial Number 1'
              customlabel={
                <span className='font-bold'>Inverter Serial Number 1</span>
              }
              inputType='text'
              name='InverterSerialnumber1'
              rules={requiredField('Inverter Serial Number 1')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Inverter Serial Number 2'
              customlabel={
                <span className='font-bold'>Inverter Serial Number 2</span>
              }
              inputType='text'
              name='InverterSerialnumber2'
              rules={requiredField('Inverter Serial Number 2')}
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={width <= 720 ? 24 : 12}>
            <CustomInput
              placeholder='Inverter Serial Number 3'
              customlabel={
                <span className='font-bold'>Inverter Serial Number 3</span>
              }
              inputType='text'
              name='InverterSerialnumber3'
              rules={requiredField('Inverter Serial Number 3')}
            />
          </Col>
        </Row>
      </Form>
    </>
  )
}

export default Assets
