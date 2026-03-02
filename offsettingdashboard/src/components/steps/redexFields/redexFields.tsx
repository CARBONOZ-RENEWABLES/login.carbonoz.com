import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'
import {
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Switch,
} from 'antd'
import dayjs from 'dayjs'
import { FC, useEffect } from 'react'
import {
  countryOptions,
  ESteps,
  frequencyData,
  ProvincesArray,
} from '../../../config/constant'
import handleAPIRequests from '../../../helpers/handleApiRequest'
import {
  RegisterDeviceDTO,
  useRegisterDeviceMutation,
} from '../../../lib/api/redex/redexEndPoints'
import { useGetRedexFileIdQuery } from '../../../lib/api/user/userEndPoints'
import CustomButton from '../../common/button/button'
import { GeneralContentLoader } from '../../common/loader/loader'

interface Props {
  makeStep: () => void
  setLoadingAction: (state: boolean) => void
}

const RedexFields: FC<Props> = ({ makeStep, setLoadingAction }) => {
  const { data, isFetching, refetch } = useGetRedexFileIdQuery()

  const [form] = Form.useForm()

  const [addDevice] = useRegisterDeviceMutation()

  useEffect(() => {
    refetch()
  }, [refetch])

  const latitudeRegex = /^-?([1-8]?[0-9](\.\d+)?|90(\.0+)?)$/
  const longitudeRegex =
    /^-?((1[0-7][0-9](\.\d+)?)|([1-9]?[0-9](\.\d+)?)|180(\.0+)?)$/

  if (isFetching) {
    return <GeneralContentLoader />
  }

  const onAddSucess = () => {}

  const onSuccess = () => {
    setLoadingAction(false)
    const data = {
      step: ESteps.LAST_STEP,
    }
    handleAPIRequests({
      request: makeStep,
      ...data,
      onSuccess: onAddSucess,
      notify: true,
    })
  }

  const onFinish = (values: RegisterDeviceDTO) => {
    setLoadingAction(true)
    values.Devices.forEach((device) => {
      device.DeclarationFormFileId = data?.data
      device.GridConnectionDate = dayjs(device.GridConnectionDate).format(
        'YYYY-MM-DD'
      )
      device.OwnersDeclarationEndDate = dayjs(
        device.OwnersDeclarationEndDate
      ).format('YYYY-MM-DD')
      device.OwnersDeclarationStartDate = dayjs(
        device.OwnersDeclarationStartDate
      ).format('YYYY-MM-DD')
      device.Inverters = device.Inverters.flatMap((item) => item || [])
    })
    handleAPIRequests({
      request: addDevice,
      ...values,
      onSuccess: onSuccess,
      onError: () => {
        setLoadingAction(false)
      },
    })
  }

  return (
    <>
      <div className='mb-8 p-4 border border-gray-300 rounded mr-8'>
        <h2 className='text-lg font-bold mb-4'>Important Information</h2>
        <p className='mb-2'>
          Please fill out all mandatory fields marked with a{' '}
          <span className='text-red-500'>*</span>. Each field is crucial for
          proper registration of the device and related details.
        </p>
        <ul className='list-disc list-inside'>
          <li>
            <strong>Country Code</strong>{' '}
            <span className='text-red-500'>*</span>: The code representing the
            country. This is required and should follow ISO 3166 standards
            (e.g., "CN" for China).
          </li>
          <li>
            <strong>Grouped English Name</strong>{' '}
            <span className='text-red-500'>*</span>: The English name for the
            grouped entity (e.g., project or organization). Mandatory.
          </li>
          <li>
            <strong>Grouped Local Name</strong>{' '}
            <span className='text-red-500'>*</span>: The local name of the
            grouped entity. This is required for proper localization.
          </li>
          <li>
            <strong>Province</strong> <span className='text-red-500'>*</span>:
            The province code (e.g., "CN-AH" for Anhui Province in China). This
            field is required.
          </li>
          <li>
            <strong>Timezone</strong>: The timezone in which the device
            operates, using the UTC offset format (e.g., "UTC+08:00").
            (optional)
          </li>
          <li>
            <strong>Generation Data Frequency</strong> Specifies how often
            generation data will be reported (e.g., "Daily"). (optional)
          </li>

          {/* Devices Field */}
          <li>
            <strong>Devices</strong>: A list of devices included in the
            registration. The following fields are for each device:
            <ul className='list-disc list-inside ml-4'>
              <li>
                <strong>Installation Name</strong>{' '}
                <span className='text-red-500'>*</span>: The name of the
                installation (e.g., "ChinaSolarDeveloper-AnhuiSheng-000001").
                This is mandatory.
              </li>
              <li>
                <strong>Address</strong> <span className='text-red-500'>*</span>
                : The full address of the installation site. This is required.
              </li>
              <li>
                <strong>Postal Code</strong>{' '}
                <span className='text-red-500'>*</span>: The postal code of the
                installation site. Required.
              </li>
              <li>
                <strong>Longitude</strong>{' '}
                <span className='text-red-500'>*</span>: The geographical
                longitude of the installation site. This is a required field.
              </li>
              <li>
                <strong>Latitude</strong>{' '}
                <span className='text-red-500'>*</span>: The geographical
                latitude of the installation site. This is required and must
                follow a valid decimal format.
              </li>
              <li>
                <strong>Grid Connection Date</strong>{' '}
                <span className='text-red-500'>*</span>: The date when the
                device was connected to the grid. Mandatory, formatted as
                "YYYY-MM-DD".
              </li>
              <li>
                <strong>Owner's Declaration Start Date</strong>{' '}
                <span className='text-red-500'>*</span>: The start date of the
                owner’s declaration. This is a required field.
              </li>
              <li>
                <strong>Owner's Declaration End Date</strong>{' '}
                <span className='text-red-500'>*</span>: The end date of the
                owner’s declaration. Required.
              </li>
              <li>
                <strong>Domestic</strong>{' '}
                <span className='text-red-500'>*</span>: Specifies if the
                installation is domestic (true or false). This is a required
                field.
              </li>
              <li>
                <strong>Feed-In Tariff</strong>: Indicates if the installation
                uses a feed-in tariff (true or false). Optional.
              </li>
              <li>
                <strong>Percentage Renewable</strong>: The percentage of energy
                produced that is renewable. Optional.
              </li>

              {/* Inverters Field */}
              <li>
                <strong>Inverters</strong>: A list of inverters installed at the
                site. For each inverter, the following fields apply:
                <ul className='list-disc list-inside ml-4'>
                  <li>
                    <strong>Remote Inv ID</strong>{' '}
                    <span className='text-red-500'>*</span>: The remote inverter
                    ID (e.g., "RM1000020003386274014"). This is required.
                  </li>
                  <li>
                    <strong>Electronic Serial Number</strong>{' '}
                    <span className='text-red-500'>*</span>: The electronic
                    serial number of the inverter. Required.
                  </li>
                  <li>
                    <strong>Brand Code</strong>{' '}
                    <span className='text-red-500'>*</span>: The code
                    representing the brand of the inverter (e.g., "HW21"). This
                    is required.
                  </li>
                  <li>
                    <strong>Other Brand Name</strong>: If the brand code is not
                    available, provide the name of the brand. This is optional.
                  </li>
                  <li>
                    <strong>Installed Capacity</strong>{' '}
                    <span className='text-red-500'>*</span>: The installed
                    capacity of the inverter in kilowatts (e.g., 10.9 kW). This
                    is a required field.
                  </li>
                </ul>
              </li>
            </ul>
          </li>
        </ul>
      </div>

      <Form
        layout='vertical'
        className='p-5'
        form={form}
        name='redex-fields-form'
        onFinish={onFinish}
      >
        <Row gutter={[16, 16]}>
          <Col span={12}>
            <Form.Item
              label={
                <span>
                  Country Code <span className='text-red-500'>*</span>
                </span>
              }
              name='CountryCode'
              rules={[
                { required: true, message: 'Please select a country code!' },
              ]}
            >
              <Select
                className='rounded h-[60px] text-black flex items-center hover:border-[#DEAF0B]'
                options={countryOptions.map((option) => ({
                  value: option.code,
                  label: option.name,
                }))}
              />
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item
              label={
                <span>
                  Grouped English Name <span className='text-red-500'>*</span>
                </span>
              }
              name='GroupedEnglishName'
              rules={[
                {
                  required: true,
                  message: 'Please enter a grouped English name!',
                },
              ]}
            >
              <Input className='h-[60px] ' placeholder='Grouped English Name' />
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item
              label={
                <span>
                  Grouped Local Name <span className='text-red-500'>*</span>
                </span>
              }
              name='GroupedLocalName'
              rules={[
                {
                  required: true,
                  message: 'Please enter a grouped local name!',
                },
              ]}
            >
              <Input className='h-[60px] ' placeholder='Grouped Local Name' />
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item
              label={
                <span>
                  Province <span className='text-red-500'>*</span>
                </span>
              }
              name='Province'
              rules={[{ required: true, message: 'Please select a province!' }]}
            >
              <Select
                className='rounded h-[60px] text-black flex items-center hover:border-[#DEAF0B]'
                options={ProvincesArray.map((option) => ({
                  value: option,
                  label: option,
                }))}
              />
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item label='Timezone' name='Timezone'>
              <Input className='h-[60px] ' placeholder='UTC+08:00' />
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item
              label='Generation Data Frequency'
              name='GenerationDataFrequency'
            >
              <Select
                className='rounded h-[60px] text-black flex items-center hover:border-[#DEAF0B]'
                options={frequencyData.map((option) => ({
                  value: option,
                  label: option,
                }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.List name='Devices'>
          {(fields, { add, remove }) => {
            return (
              <>
                {fields.map(({ key, name, ...restField }, index: number) => (
                  <div
                    key={key}
                    style={{ marginBottom: 20 }}
                    className=' border border-[#DEAF0B] p-4  rounded-xl'
                  >
                    <p className='mb-5 font-bold text-lg'>Device {index + 1}</p>
                    <Row gutter={[16, 16]}>
                      <Col span={12}>
                        <Form.Item
                          label={
                            <span>
                              Installation Name{' '}
                              <span className='text-red-500'>*</span>
                            </span>
                          }
                          name={[name, 'InstallationName']}
                          {...restField}
                          rules={[
                            {
                              required: true,
                              message: 'Please enter the installation name!',
                            },
                          ]}
                        >
                          <Input
                            className='h-[60px] '
                            placeholder='Installation Name'
                          />
                        </Form.Item>
                      </Col>

                      <Col span={12}>
                        <Form.Item
                          label={
                            <span>
                              Address <span className='text-red-500'>*</span>
                            </span>
                          }
                          name={[name, 'Address']}
                          {...restField}
                          rules={[
                            {
                              required: true,
                              message: 'Please enter the address!',
                            },
                          ]}
                        >
                          <Input className='h-[60px] ' placeholder='Address' />
                        </Form.Item>
                      </Col>

                      <Col span={12}>
                        <Form.Item
                          label={
                            <span>
                              Postal Code{' '}
                              <span className='text-red-500'>*</span>
                            </span>
                          }
                          name={[name, 'PostalCode']}
                          {...restField}
                          rules={[
                            {
                              required: true,
                              message: 'Please enter the postal code!',
                            },
                          ]}
                        >
                          <Input
                            className='h-[60px] '
                            placeholder='Postal Code'
                          />
                        </Form.Item>
                      </Col>

                      <Col span={12}>
                        <Form.Item
                          label={
                            <span>
                              Grid Connection Date{' '}
                              <span className='text-red-500'>*</span>
                            </span>
                          }
                          name={[name, 'GridConnectionDate']}
                          {...restField}
                          rules={[
                            {
                              required: true,
                              message: 'Please select grid connection date!',
                            },
                          ]}
                        >
                          <DatePicker
                            type={'date'}
                            className='h-[60px] w-full'
                          />
                        </Form.Item>
                      </Col>

                      <Col span={12}>
                        <Form.Item
                          label={
                            <span>
                              Owner Declaration Start Date{' '}
                              <span className='text-red-500'>*</span>
                            </span>
                          }
                          name={[name, 'OwnersDeclarationStartDate']}
                          {...restField}
                          rules={[
                            {
                              required: true,
                              message:
                                'Please select owner declaration start date!',
                            },
                          ]}
                        >
                          <DatePicker
                            type={'date'}
                            className='h-[60px] w-full '
                          />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item
                          label={
                            <span>
                              Owner Declaration End Date{' '}
                              <span className='text-red-500'>*</span>
                            </span>
                          }
                          name={[name, 'OwnersDeclarationEndDate']}
                          {...restField}
                          rules={[
                            {
                              required: true,
                              message:
                                'Please select owner declaration end date!',
                            },
                          ]}
                        >
                          <DatePicker
                            type={'date'}
                            className='h-[60px] w-full'
                          />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item
                          label={
                            <span>
                              Longitude <span className='text-red-500'>*</span>
                            </span>
                          }
                          name={[name, 'Longitude']}
                          {...restField}
                          rules={[
                            {
                              required: true,
                              message: 'Please enter the longitude!',
                              pattern: longitudeRegex,
                            },
                          ]}
                        >
                          <InputNumber
                            className='h-[60px] w-full'
                            placeholder='139.7500'
                            type='number'
                          />
                        </Form.Item>
                      </Col>

                      <Col span={12}>
                        <Form.Item
                          label={
                            <span>
                              Latitude <span className='text-red-500'>*</span>
                            </span>
                          }
                          name={[name, 'Latitude']}
                          {...restField}
                          rules={[
                            {
                              required: true,
                              message: 'Please enter the latitude!',
                              pattern: latitudeRegex,
                            },
                          ]}
                        >
                          <InputNumber
                            className='h-[60px] w-full '
                            placeholder='-74.0058'
                            type='number'
                          />
                        </Form.Item>
                      </Col>

                      <Col span={12}>
                        <Form.Item
                          label={
                            <span>
                              Domestic <span className='text-red-500'>*</span>
                            </span>
                          }
                          name={[name, 'Domestic']}
                          valuePropName='checked'
                          {...restField}
                          rules={[
                            {
                              required: true,
                              message: 'Please select if domestic!',
                            },
                          ]}
                        >
                          <Switch />
                        </Form.Item>
                      </Col>

                      <Col span={12}>
                        <Form.Item
                          label='Feed In Tariff'
                          name={[name, 'FeedInTariff']}
                          valuePropName='checked'
                          {...restField}
                        >
                          <Switch />
                        </Form.Item>
                      </Col>

                      <Col span={12}>
                        <Form.Item
                          label='Percentage Renewable'
                          name={[name, 'PercentageRenewable']}
                          {...restField}
                        >
                          <InputNumber
                            className='h-[60px] w-full '
                            placeholder='Percentage Renewable'
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                    <div className='flex  justify-end w-[100%] mb-10 p-5'>
                      <CustomButton
                        onClick={() => remove(name)}
                        className='w-[30%] h-[60px] remove_button '
                        type='primary'
                        icon={<MinusCircleOutlined />}
                      >
                        Remove Device
                      </CustomButton>
                    </div>
                    <Form.List name={[name, 'Inverters']}>
                      {(
                        inverterFields,
                        { add: addInverter, remove: removeInverter }
                      ) => (
                        <div className='border border-black p-5 rounded-xl'>
                          {inverterFields.map((inverter, indexTwo) => {
                            return (
                              <div key={inverter.key}>
                                <p className='mb-5 font-bold text-lg'>
                                  Inverter {indexTwo + 1}
                                </p>
                                <Row
                                  gutter={[16, 16]}
                                  style={{ marginBottom: 8 }}
                                  className='mt-[60px]'
                                >
                                  <Col span={8}>
                                    <Form.Item
                                      label={
                                        <span>
                                          Remote Inv ID{' '}
                                          <span className='text-red-500'>
                                            *
                                          </span>
                                        </span>
                                      }
                                      name={[name, indexTwo, 'RemoteInvId']}
                                      {...restField}
                                      rules={[
                                        {
                                          required: true,
                                          message:
                                            'Please enter the remote inv ID!',
                                        },
                                      ]}
                                    >
                                      <Input
                                        className='h-[60px]'
                                        placeholder='Remote Inv ID'
                                      />
                                    </Form.Item>
                                  </Col>
                                  <Col span={8}>
                                    <Form.Item
                                      label={
                                        <span>
                                          Electronic Serial Number{' '}
                                          <span className='text-red-500'>
                                            *
                                          </span>
                                        </span>
                                      }
                                      name={[
                                        name,
                                        indexTwo,
                                        'ElectronicSerialNumber',
                                      ]}
                                      {...restField}
                                      rules={[
                                        {
                                          required: true,
                                          message:
                                            'Please enter the electronic serial number!',
                                        },
                                      ]}
                                    >
                                      <Input
                                        className='h-[60px] '
                                        placeholder='Electronic Serial Number'
                                      />
                                    </Form.Item>
                                  </Col>
                                  <Col span={8}>
                                    <Form.Item
                                      label={
                                        <span>
                                          Brand Code{' '}
                                          <span className='text-red-500'>
                                            *
                                          </span>
                                        </span>
                                      }
                                      name={[name, indexTwo, 'BrandCode']}
                                      {...restField}
                                      rules={[
                                        {
                                          required: true,
                                          message:
                                            'Please enter the brand code!',
                                        },
                                      ]}
                                    >
                                      <Input
                                        className='h-[60px] '
                                        placeholder='Brand Code'
                                      />
                                    </Form.Item>
                                  </Col>
                                  <Col span={8}>
                                    <Form.Item
                                      label={
                                        <span>
                                          Installed Capacity in Kw{' '}
                                          <span className='text-red-500'>
                                            *
                                          </span>
                                        </span>
                                      }
                                      name={[
                                        name,
                                        indexTwo,
                                        'InstalledCapacity',
                                      ]}
                                      {...restField}
                                      rules={[
                                        {
                                          required: true,
                                          message:
                                            'Please enter the installed capacity!',
                                        },
                                      ]}
                                    >
                                      <InputNumber
                                        className='h-[60px] w-full '
                                        placeholder='Installed Capacity'
                                      />
                                    </Form.Item>
                                  </Col>
                                  <div className='flex justify-end w-[100%] -mb-[85px] p-5'>
                                    <CustomButton
                                      onClick={() =>
                                        removeInverter(inverter.name)
                                      }
                                      className='w-[30%] h-[60px] remove_button '
                                      type='primary'
                                      icon={<MinusCircleOutlined />}
                                    >
                                      Remove Inverter
                                    </CustomButton>
                                  </div>
                                </Row>
                              </div>
                            )
                          })}
                          <CustomButton
                            onClick={() => addInverter()}
                            className='lg:w-[30%] w-[100%] h-[60px]  add_button'
                            type='primary'
                            icon={<PlusOutlined />}
                          >
                            Add Inverter
                          </CustomButton>
                        </div>
                      )}
                    </Form.List>
                  </div>
                ))}
                <div className='w-[100%] mb-10 '>
                  <CustomButton
                    onClick={() => add()}
                    className='w-[30%] h-[60px] add_button'
                    type='primary'
                    icon={<PlusOutlined />}
                  >
                    Add Device
                  </CustomButton>
                </div>
              </>
            )
          }}
        </Form.List>
      </Form>
    </>
  )
}

export default RedexFields
