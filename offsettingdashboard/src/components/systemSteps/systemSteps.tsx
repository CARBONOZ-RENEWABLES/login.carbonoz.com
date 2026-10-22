import { FC, ReactElement, ReactNode, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, FileText, Gauge, Leaf, SolarPanel, User } from 'lucide-react'
import { ESystemSteps } from '../../config/constant'
import { useGetSystemStepsQuery, useMakeSystemStepMutation } from '../../lib/api/systemSteps/systemSteps'
import { useGetAdditionalInfoQuery, useGetAssetsQuery, useGetMeterQuery, useGetProjectQuery } from '../../lib/api/user/userEndPoints'
import CustomButton from '../common/button/button'
import Notify from '../common/notification/notification'
import { StepWizard, WizardStep } from '../../layout/onboarding/StepWizard'
import Assets from './asset/asset'
import MeterInfo from './meter/meterEvidence'
import ProjectInfo from './project/projectInfo'
import UserInformation from './userinfo/userInformation'

/**
 * One optional section: closed until the customer opens it, saved on its own,
 * never blocking the way to the dashboard.
 */
function OptionalSection({ icon, title, hint, done, formId, children }: { icon: ReactNode; title: string; hint: string; done: boolean; formId: string; children: (saving: (s: boolean) => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  return (
    <section className='rounded-xl border border-line bg-panel'>
      <button type='button' className='flex w-full items-center gap-3 px-4 py-3 text-left' aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className='grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-panel-3 text-fg-2'>{icon}</span>
        <span className='min-w-0 flex-1'>
          <span className='flex items-center gap-2 text-[14px] font-semibold text-fg'>
            {title}
            {done && <CheckCircle2 size={15} className='text-batt' aria-label='Saved' />}
          </span>
          <span className='block text-[12.5px] text-muted'>{hint}</span>
        </span>
        <ChevronDown size={18} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className='border-t border-line px-4 pb-4 pt-3'>
          {children(setSaving)}
          <div className='mt-2 flex justify-end'>
            <CustomButton type='primary' form={formId} htmlType='submit' loading={saving} variant='secondary'>
              Save {title.toLowerCase()}
            </CustomButton>
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * Onboarding after sign-up: the essentials (name, language, time zone), then
 * the details a carbon-offsetting partner needs (system, meter, project) as
 * optional sections that stay closed unless the customer opens them.
 */
const SystemUserSteps: FC = (): ReactElement => {
  const navigate = useNavigate()
  const { data, refetch: refetchUserInfo } = useGetAdditionalInfoQuery()
  const { data: stepsData, isFetching, refetch } = useGetSystemStepsQuery()
  const [makeStep, { isLoading }] = useMakeSystemStepMutation()
  const asset = useGetAssetsQuery()
  const meter = useGetMeterQuery()
  const project = useGetProjectQuery()
  const [loadingAction, setLoadingAction] = useState(false)

  // Anything after the user information (including old step names) is step 2.
  const initialStep = useMemo(() => {
    const s = stepsData?.data?.[0]?.step
    return !s || s === ESystemSteps.USER_INFORMATION ? 0 : 1
  }, [stepsData])
  const [current, setCurrent] = useState(initialStep)
  useEffect(() => setCurrent(initialStep), [initialStep])

  useEffect(() => {
    refetch()
    refetchUserInfo()
  }, [refetch, refetchUserInfo])

  useEffect(() => {
    if (stepsData?.data?.[0]?.status === true) navigate('/ds')
  }, [stepsData, navigate])

  const finish = async () => {
    try {
      await makeStep({ step: ESystemSteps.LAST_STEP } as never).unwrap()
      navigate('/ds')
    } catch {
      Notify({ type: 'error', message: 'Could not finish the setup', description: 'Please try again.' })
    }
  }

  const saved = (what: string, refresh: () => unknown) => () => {
    refresh()
    Notify({ message: `${what} saved`, description: 'You can add more later from your profile, or continue to your dashboard.' })
  }

  const wizardSteps: WizardStep[] = [
    { title: 'About you', description: 'Your name, language and time zone.', icon: User },
    { title: 'Carbon offsetting (optional)', description: 'Details for certificates. Skip if you only want monitoring.', icon: Leaf },
  ]

  return (
    <StepWizard
      flowTitle='Set up your account'
      flowDescription='Two quick steps. Only your name, language and time zone are required.'
      steps={wizardSteps}
      current={current}
      firstName={data?.data?.firstName}
      lastName={data?.data?.lastName}
      loading={isFetching}
      actions={
        current === 0 ? (
          <>
            {data?.data?.firstName && (
              <CustomButton onClick={() => setCurrent(1)} variant='secondary' className='lg:min-w-[120px]'>
                Next <ArrowRight size={15} />
              </CustomButton>
            )}
            <CustomButton type='primary' form='user-info-form' htmlType='submit' loading={loadingAction} variant='primary' className='lg:min-w-[160px]'>
              Save & continue
            </CustomButton>
          </>
        ) : (
          <>
            <CustomButton onClick={() => setCurrent(0)} variant='secondary' className='lg:min-w-[120px]'>
              <ArrowLeft size={15} /> Previous
            </CustomButton>
            <CustomButton type='primary' onClick={finish} loading={isLoading} variant='primary' className='lg:min-w-[180px]'>
              Finish and open my dashboard
            </CustomButton>
          </>
        )
      }
    >
      {current === 0 ? (
        <UserInformation makeStep={makeStep as () => unknown} setLoadingAction={setLoadingAction} onSaved={() => setCurrent(1)} />
      ) : (
        <div className='flex flex-col gap-3'>
          <p className='rounded-xl border border-line bg-panel-2 px-4 py-3 text-[13px] leading-relaxed text-fg-2'>
            If you want CARBONOZ to issue carbon certificates for your solar production, our offsetting partner needs a few details about your system. <strong className='text-fg'>All of them are optional</strong> — open a section to fill it in now, or finish and add them later.
          </p>
          <OptionalSection icon={<SolarPanel size={17} />} title='Solar system' hint='Capacity, commissioning date, panels, inverters, batteries, serial numbers.' done={!!asset.data?.data} formId='asset-info-form'>
            {(saving) => <Assets setLoadingAction={saving} onSaved={saved('Solar system', asset.refetch)} />}
          </OptionalSection>
          <OptionalSection icon={<Gauge size={17} />} title='Meter' hint='The meter that measures your production.' done={!!meter.data?.data} formId='meter-info-form'>
            {(saving) => <MeterInfo setLoadingAction={saving} onSaved={saved('Meter', meter.refetch)} />}
          </OptionalSection>
          <OptionalSection icon={<FileText size={17} />} title='Project' hint='Background, description and impact of your project.' done={!!project.data?.data} formId='project-info-form'>
            {(saving) => <ProjectInfo setLoadingAction={saving} onSaved={saved('Project', project.refetch)} />}
          </OptionalSection>
        </div>
      )}
    </StepWizard>
  )
}

export default SystemUserSteps
