import { Col, Form, Row } from 'antd'
import { FC, ReactElement, useEffect, useMemo } from 'react'
import countryList from 'react-select-country-list'
import {
  fuelOptions,
  InverterBrand,
} from '../../../config/constant'
import handleAPIRequests from '../../../helpers/handleApiRequest'
import {
  AssetDTO,
  useAddAssetMutation,
  useGetAssetsQuery,
} from '../../../lib/api/user/userEndPoints'
import { FieldGuide } from '../../../design'
import CustomInput from '../../common/input/customInput'

interface props {
  setLoadingAction: (state: boolean) => void
  /** Called after a successful save (the section stays open for more edits). */
  onSaved?: () => void
}

/** System details for carbon offsetting; every field is optional. */
const Assets: FC<props> = ({ setLoadingAction, onSaved }): ReactElement => {
  const [form] = Form.useForm()

  const options = useMemo(() => countryList().getData(), [])

  const [addAsset] = useAddAssetMutation()
  const { data, refetch } = useGetAssetsQuery()


  const onSuccess = () => {
    setLoadingAction(false)
    onSaved?.()
  }

  const onFinish = async (values: AssetDTO) => {
    setLoadingAction(true)
    // Empty fields are left out (all optional); numbers are sent as numbers.
    const num = (v: unknown, int = false) => {
      const n = int ? parseInt(`${v}`) : parseFloat(`${v}`)
      return Number.isFinite(n) ? n : undefined
    }
    values.latitude = num(values.latitude) as number
    values.longitude = num(values.longitude) as number
    values.capacityKwp = num(values.capacityKwp) as number
    values.amountOfInverters = num(values.amountOfInverters, true) as number
    values.amountOfPanels = num(values.amountOfPanels, true) as number
    values.amountOfBatteries = num(values.amountOfBatteries, true) as number
    values.panelPower = num(values.panelPower, true) as number
    for (const k of Object.keys(values) as (keyof AssetDTO)[]) if (values[k] === '' || values[k] === undefined) delete values[k]

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
      // A date input shows YYYY-MM-DD, the API stores a full timestamp.
      const codDate = data.data.codDate ? String(data.data.codDate).slice(0, 10) : undefined
      form.setFieldsValue({ ...data.data, codDate })
    }
  }, [data, form])

  const latitudeRegex = /^-?([1-8]?[0-9](\.\d+)?|90(\.0+)?)$/
  const longitudeRegex =
    /^-?((1[0-7][0-9](\.\d+)?)|([1-9]?[0-9](\.\d+)?)|180(\.0+)?)$/

  return (
    <>
      <FieldGuide title='Field guide'>
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
      </FieldGuide>

      <Form
        requiredMark={false}
        name='asset-info-form'
        form={form}
        onFinish={onFinish}
        layout='vertical'
      >
        <Row className='w-[100%]' gutter={16}>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Asset name'
              customlabel={
                <span className='text-[12px] font-medium text-muted'>
                  Asset name
                </span>
              }
              inputType='text'
              name='assetName'
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Asset Owner'
              customlabel={
                <span className='text-[12px] font-medium text-muted'>
                  Asset Owner
                </span>
              }
              inputType='text'
              name='assetOwner'
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Fuel type'
              customlabel={
                <span className='text-[12px] font-medium text-muted'>
                  Fuel type
                </span>
              }
              type='select'
              name='fuelType'
              options={fuelOptions.map((item) => ({
                key: item.id,
                value: item.fuelType,
                label: item.fuelType,
              }))}
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Country'
              customlabel={
                <span className='text-[12px] font-medium text-muted'>
                  Country
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
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Latitude'
              customlabel={
                <span className='text-[12px] font-medium text-muted'>
                  Latitude
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
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Longitude'
              customlabel={
                <span className='text-[12px] font-medium text-muted'>
                  Longitude
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
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Capacity Kwp'
              customlabel={
                <span className='text-[12px] font-medium text-muted'>
                  Capacity Kwp
                </span>
              }
              inputType='number'
              name='capacityKwp'
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Service'
              customlabel={
                <span className='text-[12px] font-medium text-muted'>
                  Service
                </span>
              }
              inputType='text'
              name='service'
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='COD Date'
              customlabel={
                <span className='text-[12px] font-medium text-muted'>
                  COD Date
                </span>
              }
              inputType='date'
              name='codDate'
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Amount of Inverters'
              customlabel={
                <span className='text-[12px] font-medium text-muted'>
                  Amount of Inverters
                </span>
              }
              inputType='number'
              name='amountOfInverters'
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Amount of Panels'
              customlabel={
                <span className='text-[12px] font-medium text-muted'>
                  Amount of Panels
                </span>
              }
              inputType='number'
              name='amountOfPanels'
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Panel Brand'
              customlabel={
                <span className='text-[12px] font-medium text-muted'>
                  Panel Brand
                </span>
              }
              inputType='text'
              name='panelBrand'
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Panel Power (W)'
              customlabel={
                <span className='text-[12px] font-medium text-muted'>
                  Panel Power (W)
                </span>
              }
              inputType='number'
              name='panelPower'
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Amount of Batteries'
              label='Amount of Batteries'
              inputType='number'
              name='amountOfBatteries'
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Battery Brand'
              label='Battery Brand'
              inputType='text'
              name='batteryBrand'
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Battery Model'
              label='Battery Model'
              inputType='text'
              name='batteryModel'
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Inverter Model'
              customlabel={
                <span className='text-[12px] font-medium text-muted'>
                  Inverter Model
                </span>
              }
              inputType='text'
              name='inverterModel'
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Monitoring System Name'
              customlabel={
                <span className='text-[12px] font-medium text-muted'>
                  Monitoring System Name
                </span>
              }
              inputType='text'
              name='monitoringSystemName'
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Monitoring System URL'
              customlabel={
                <span className='text-[12px] font-medium text-muted'>
                  Monitoring System URL
                </span>
              }
              inputType='text'
              name='monitoringSystemURL'
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Inverter brand'
              customlabel={
                <span className='text-[12px] font-medium text-muted'>
                  Inverter brand
                </span>
              }
              type='select'
              name='inverterBrand'
              options={InverterBrand.map((item, idx) => ({
                key: idx,
                value: item,
                label: item,
              }))}
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Battery Serial Number 1'
              customlabel={
                <span className='font-bold'>Battery Serial Number 1</span>
              }
              inputType='text'
              name='BatterySerialNumber1'
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Battery Serial Number 2'
              customlabel={
                <span className='font-bold'>Battery Serial Number 2</span>
              }
              inputType='text'
              name='BatterySerialNumber2'
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Battery Serial Number 3'
              customlabel={
                <span className='font-bold'>Battery Serial Number 3</span>
              }
              inputType='text'
              name='BatterySerialNumber3'
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Inverter Serial Number 1'
              customlabel={
                <span className='font-bold'>Inverter Serial Number 1</span>
              }
              inputType='text'
              name='InverterSerialnumber1'
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Inverter Serial Number 2'
              customlabel={
                <span className='font-bold'>Inverter Serial Number 2</span>
              }
              inputType='text'
              name='InverterSerialnumber2'
            />
          </Col>
          <Col className='gutter-row' xs={24} md={12}>
            <CustomInput
              placeholder='Inverter Serial Number 3'
              customlabel={
                <span className='font-bold'>Inverter Serial Number 3</span>
              }
              inputType='text'
              name='InverterSerialnumber3'
            />
          </Col>
        </Row>
      </Form>
    </>
  )
}

export default Assets
