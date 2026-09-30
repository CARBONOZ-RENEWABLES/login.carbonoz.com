import saveAs from 'file-saver'
import {
  FC,
  ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ClipboardList, Download, FileText, Upload } from 'lucide-react'
import pdf from '../../assets/redex-form/Template.pdf'
import { ESteps } from '../../config/constant'
import handleAPIRequests from '../../helpers/handleApiRequest'
import {
  useGetStepsQuery,
  useMakeStepMutation,
} from '../../lib/api/redexsteps/stepsEndpoints'
import { useGetAdditionalInfoQuery } from '../../lib/api/user/userEndPoints'
import Private from '../../routes/private'
import CustomButton from '../common/button/button'
import { StepWizard, WizardStep } from '../../layout/onboarding/StepWizard'
import RedexForm from './redexform/redexInfo'
import UploadForm from './uplaodform/uploadForm'
import RedexFields from './redexFields/redexFields'

const UserSteps: FC = (): ReactElement | boolean => {
  const { data: stepsData, isFetching, refetch } = useGetStepsQuery()
  const { data } = useGetAdditionalInfoQuery()

  const navigate = useNavigate()

  const [makeStep, { isLoading }] = useMakeStepMutation()
  const [isFile, setIsFile] = useState<boolean>(false)
  const [loadingAction, setLoadingAction] = useState<boolean>(false)

  const initialStepIndex = useMemo(() => {
    const stepMapping: { [key: string]: number } = {
      REDEX_FORM: 0,
      UPLOAD_FORM: 1,
      REDEX_FIELDS: 2,
    }
    if (stepsData?.data && stepsData.data.length > 0) {
      return stepMapping[stepsData.data[0].step] ?? 0
    }
    return 0
  }, [stepsData])

  const [current, setCurrent] = useState<number>(initialStepIndex)

  useEffect(() => {
    setCurrent(initialStepIndex)
  }, [initialStepIndex])

  useEffect(() => {
    refetch()
  }, [refetch])

  useEffect(() => {
    if (
      stepsData?.data &&
      stepsData.data.length > 0 &&
      stepsData.data[0].status === true
    ) {
      navigate('/systemsteps')
    }
  }, [stepsData, navigate])

  useEffect(() => {
    if (
      stepsData?.data &&
      stepsData.data.length > 0 &&
      typeof stepsData.data[0].isFile === 'boolean'
    ) {
      setIsFile(stepsData.data[0].isFile)
    }
  }, [stepsData])

  const steps = useMemo(
    () => [
      {
        title: 'Redex Information',
        content: <RedexForm />,
        formId: 'redex-info-form',
      },
      {
        title: 'Upload signed form',
        content: (
          <UploadForm
            makeStep={makeStep as () => unknown}
            setLoadingAction={setLoadingAction}
          />
        ),
        formId: 'upload-info-form',
      },
      {
        title: 'Redex Fields',
        content: (
          <RedexFields
            makeStep={makeStep as () => unknown}
            setLoadingAction={setLoadingAction}
          />
        ),
        formId: 'redex-fields-form',
      },
    ],
    [makeStep]
  )


  const next = useCallback(() => {
    setCurrent((prev) => prev + 1)
  }, [])

  const prev = useCallback(() => {
    setCurrent((prev) => prev - 1)
  }, [])

  const getCurrentFormId = useCallback(
    () => steps[current].formId,
    [current, steps]
  )

  const saveFile = useCallback(() => {
    const onSuccess = () => {
      saveAs(pdf, 'Form')
    }
    const data = {
      step: ESteps.UPLOAD_FORM,
    }
    handleAPIRequests({
      request: makeStep,
      ...data,
      onSuccess: onSuccess,
    })
  }, [makeStep])

  const checkFile = useCallback(() => {
    const onSuccess = () => {
      next()
    }
    if (!!isFile && current === 0) {
      const data = {
        step: ESteps.UPLOAD_FORM,
      }
      handleAPIRequests({
        request: makeStep,
        ...data,
        onSuccess,
      })
    } else {
      next()
    }
  }, [isFile, current, makeStep, next])

  const wizardSteps: WizardStep[] = [
    { title: 'Redex information', description: 'Download and sign the Redex participation form.', icon: FileText },
    { title: 'Upload signed form', description: 'Upload the signed form as a PDF.', icon: Upload },
    { title: 'Redex fields', description: 'Register your installation and inverters with Redex.', icon: ClipboardList },
  ]

  const showNext = !(current === 1 && stepsData?.data && stepsData.data.length > 0 && stepsData.data[0].step !== ESteps.REDEX_FIELDS) &&
    current < steps.length - 1 && stepsData?.data && stepsData.data.length > 0 && typeof stepsData.data[0].isFile === 'boolean'

  return (
    <StepWizard
      flowTitle='Redex registration'
      flowDescription='Share your production data with Redex to issue renewable energy certificates.'
      steps={wizardSteps}
      current={current}
      firstName={data?.data?.firstName}
      lastName={data?.data?.lastName}
      loading={isFetching}
      actions={
        <>
          {current > 0 && (
            <CustomButton onClick={prev} variant='secondary' className='lg:min-w-[120px]'>
              <ArrowLeft size={15} /> Previous
            </CustomButton>
          )}
          {current === 0 && (
            <CustomButton onClick={saveFile} variant='secondary' icon={<Download size={15} />} className='lg:min-w-[150px]'>
              Download form
            </CustomButton>
          )}
          {showNext && (
            <CustomButton onClick={checkFile} variant='secondary' className='lg:min-w-[120px]'>
              Next <ArrowRight size={15} />
            </CustomButton>
          )}
          <CustomButton type='primary' form={getCurrentFormId()} htmlType='submit' loading={loadingAction || isLoading} disabled={loadingAction || isLoading} variant='primary' className='lg:min-w-[160px]'>
            {current === steps.length - 1 ? 'Submit' : 'Save & continue'}
          </CustomButton>
        </>
      }
    >
      {steps[current].content}
    </StepWizard>
  )
}

const PrivateUserSteps = Private(UserSteps)

export default PrivateUserSteps
