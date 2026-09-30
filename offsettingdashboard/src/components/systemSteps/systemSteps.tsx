import {
  FC,
  ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Award, FileText, Gauge, SolarPanel, User } from 'lucide-react'
import {
  useGetSystemStepsQuery,
  useMakeSystemStepMutation,
} from '../../lib/api/systemSteps/systemSteps'
import {
  useGetAdditionalInfoQuery,
  useGetAssetsQuery,
  useGetMeterQuery,
} from '../../lib/api/user/userEndPoints'
import CustomButton from '../common/button/button'
import { StepWizard, WizardStep } from '../../layout/onboarding/StepWizard'
import AgreementInfo from './aggreement/aggreement'
import Assets from './asset/asset'
import MeterInfo from './meter/meterEvidence'
import ProjectInfo from './project/projectInfo'
import UserInformation from './userinfo/userInformation'

const SystemUserSteps: FC = (): ReactElement | boolean => {
  const { data, refetch: refetchUserInfo } = useGetAdditionalInfoQuery()
  const navigate = useNavigate()
  const { data: stepsData, isFetching, refetch } = useGetSystemStepsQuery()
  const [makeStep, { isLoading }] = useMakeSystemStepMutation()
  const { data: assetData, refetch: refetchAsset } = useGetAssetsQuery()
  const { data: MeterData, refetch: refetchMeter } = useGetMeterQuery()

  const initialStepIndex = useMemo(() => {
    const stepMapping: { [key: string]: number } = {
      USER_INFORMATION: 0,
      ASSET: 1,
      METERING_EVIDENCE: 2,
      PROJECT: 3,
      CERTIFICATION: 4,
    }
    return stepsData?.data && stepsData.data.length > 0
      ? stepMapping[stepsData.data[0].step] ?? 0
      : 0
  }, [stepsData])

  const [current, setCurrent] = useState<number>(initialStepIndex)
  const [loadingAction, setLoadingAction] = useState<boolean>(false)

  useEffect(() => {
    refetch()
    refetchUserInfo()
    refetchAsset()
    refetchMeter()
  }, [refetch, refetchUserInfo, refetchAsset, refetchMeter])

  useEffect(() => {
    setCurrent(initialStepIndex)
  }, [initialStepIndex])

  useEffect(() => {
    if (
      stepsData?.data &&
      stepsData.data.length > 0 &&
      stepsData.data[0].status === true
    ) {
      navigate('/ds')
    }
  }, [stepsData])

  const steps = useMemo(
    () => [
      {
        title: 'User Information',
        content: (
          <UserInformation
            makeStep={makeStep as () => unknown}
            setLoadingAction={setLoadingAction}
          />
        ),
        formId: 'user-info-form',
      },
      {
        title: 'Asset Information',
        content: (
          <Assets
            makeStep={makeStep as () => unknown}
            setLoadingAction={setLoadingAction}
          />
        ),
        formId: 'asset-info-form',
      },
      {
        title: 'Meter Information',
        content: (
          <MeterInfo
            makeStep={makeStep as () => unknown}
            setLoadingAction={setLoadingAction}
          />
        ),
        formId: 'meter-info-form',
      },
      {
        title: 'Project Information',
        content: (
          <ProjectInfo
            makeStep={makeStep as () => unknown}
            setLoadingAction={setLoadingAction}
          />
        ),
        formId: 'project-info-form',
      },
      {
        title: 'Certificate Information',
        content: (
          <AgreementInfo
            makeStep={makeStep as () => unknown}
            setLoadingAction={setLoadingAction}
          />
        ),
        formId: 'agreement-info-form',
      },
    ],
    [makeStep]
  )

  const next = useCallback(() => setCurrent((prev) => prev + 1), [])
  const prev = useCallback(() => setCurrent((prev) => prev - 1), [])
  const getCurrentFormId = useCallback(
    () => steps[current].formId,
    [current, steps]
  )

  const wizardSteps: WizardStep[] = [
    { title: 'User information', description: 'Your name, address and contact details.', icon: User },
    { title: 'Asset information', description: 'Your solar installation, inverters and batteries.', icon: SolarPanel },
    { title: 'Meter information', description: 'The meter that measures your production.', icon: Gauge },
    { title: 'Project information', description: 'Background and impact of your project (optional).', icon: FileText },
    { title: 'Certificates', description: 'Agreements and certificates for your system.', icon: Award },
  ]

  const canSkip = !((current === 0 && !data?.data) || (current === 1 && !assetData?.data) || (current === 2 && !MeterData?.data))

  return (
    <StepWizard
      flowTitle='Set up your system'
      flowDescription='Tell us about you and your solar installation so CARBONOZ can monitor it and issue certificates.'
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
          {canSkip && current < steps.length - 1 && (
            <CustomButton onClick={next} variant='secondary' className='lg:min-w-[120px]'>
              Next <ArrowRight size={15} />
            </CustomButton>
          )}
          <CustomButton type='primary' form={getCurrentFormId()} htmlType='submit' loading={loadingAction || isLoading} variant='primary' className='lg:min-w-[160px]'>
            {current === steps.length - 1 ? 'Submit' : 'Save & continue'}
          </CustomButton>
        </>
      }
    >
      {steps[current].content}
    </StepWizard>
  )
}

export default SystemUserSteps
