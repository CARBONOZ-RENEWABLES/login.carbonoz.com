import { Col, Form, Row } from 'antd'
import { FC, ReactElement, useEffect } from 'react'
import CustomInput from '../../common/input/customInput'
import {
  ProjectDTO,
  useAddProjectMutation,
  useGetProjectQuery,
} from '../../../lib/api/user/userEndPoints'
import { ESystemSteps } from '../../../config/constant'
import handleAPIRequests from '../../../helpers/handleApiRequest'

interface props {
  makeStep: () => unknown
  setLoadingAction: (state: boolean) => void
}

const ProjectInfo: FC<props> = ({
  makeStep,
  setLoadingAction,
}): ReactElement => {
  const [form] = Form.useForm()

  const { data, refetch } = useGetProjectQuery()
  const [addProject] = useAddProjectMutation()

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
      step: ESystemSteps.CERTIFICATION,
    }
    handleAPIRequests({
      request: makeStep,
      ...data,
      onSuccess: onAddSucess,
      notify: true,
    })
  }

  const onFinish = (values: ProjectDTO) => {
    setLoadingAction(true)
    handleAPIRequests({
      request: addProject,
      ...values,
      onSuccess: onSuccess,
    })
  }

  return (
    <>
      <div className='mb-8 p-4 border border-gray-300 rounded  mr-8'>
        <h2 className='text-lg font-bold mb-4'>
          Field Explanations , you can click next they are not mandatory
        </h2>
        <ul className='list-disc ml-4 space-y-2'>
          <li>
            <strong>Project Background:</strong> Provide context or historical
            information about the project. This could include the motivation,
            initial goals, or problem the project aims to solve.
          </li>
          <li>
            <strong>Project Description:</strong> A detailed explanation of the
            project's scope, objectives, and key features. This should outline
            what the project does and how it operates.
          </li>
          <li>
            <strong>Project Impact:</strong> Describe the positive effects or
            changes the project aims to bring. This could include environmental,
            social, or economic impacts.
          </li>
        </ul>
      </div>
      <Form
        className='space-y-12'
        name='project-info-form'
        form={form}
        onFinish={onFinish}
      >
        <Row className='w-[100%]' gutter={{ xs: 8, sm: 16, md: 24, lg: 32 }}>
          <Col className='gutter-row mt-2 ' span={24}>
            <CustomInput
              placeholder='Project Background'
              label='Project Background'
              inputType='text'
              type='textarea'
              name='projectBackground'
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={24}>
            <CustomInput
              placeholder='Project Description'
              label='Project Description'
              inputType='text'
              type='textarea'
              name='projectDescription'
            />
          </Col>
          <Col className='gutter-row mt-2 ' span={24}>
            <CustomInput
              placeholder='Project Impact'
              label='Project Impact'
              inputType='text'
              name='projectImpact'
              type='textarea'
            />
          </Col>
        </Row>
      </Form>
    </>
  )
}

export default ProjectInfo
