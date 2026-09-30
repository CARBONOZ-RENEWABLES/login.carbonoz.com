/* eslint-disable react-hooks/exhaustive-deps */
import { FC, ReactElement, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { AppLoader } from '../components/common/loader/loader'
import { AppShell } from '../layout/AppShell'
import { USER_BOTTOM_NAV, USER_NAV } from '../layout/nav'
import { ShellProvider } from '../layout/ShellContext'
import Profile from '../components/dashboard/profile/profile'
import Settings from '../components/dashboard/settings/settings'
import SolarPage from '../features/solar/SolarPage'
import NotFound from '../components/notfound/notFound'
import { useGetPartnersQuery } from '../lib/api/partners/partnersEndPoints'
import { useGetStepsQuery } from '../lib/api/redexsteps/stepsEndpoints'
import { useGetSystemStepsQuery } from '../lib/api/systemSteps/systemSteps'
import { useGetAdditionalInfoQuery } from '../lib/api/user/userEndPoints'
import Private from './private'
import { adoptLanguage } from '../i18n'

export const DashboardRoutes: FC = (): ReactElement => {
  const navigate = useNavigate()

  const {
    data: redexSteps,
    refetch,
    isFetching: isFetchingSteps,
  } = useGetStepsQuery()
  const [partner, setPartner] = useState<Array<string>>([])
  const { data, refetch: refetchData } = useGetAdditionalInfoQuery()
  // The language saved in the profile follows the user to every device.
  useEffect(() => {
    adoptLanguage(data?.data?.customerLanguage)
  }, [data?.data?.customerLanguage])
  const {
    data: partners,
    refetch: refetchPartners,
    isFetching: partnerFetching,
  } = useGetPartnersQuery()

  const {
    data: stepsData,
    isFetching: isSystemFetching,
    refetch: stepsRefetch,
  } = useGetSystemStepsQuery()

  useEffect(() => {
    if (!partnerFetching) {
      if (partners && partners.data !== null) {
        if (!partners.data.partner || partners.data.partner.length === 0) {
          navigate('/onboarding')
        } else {
          setPartner(partners.data.partner)
        }
      } else {
        navigate('/onboarding')
      }
    }
  }, [partners, partnerFetching])

  useEffect(() => {
    if (partner.length > 0) {
      partner.forEach((part: string) => {
        if (part === 'REDEX') {
          if (
            (redexSteps?.data &&
              redexSteps.data.length > 0 &&
              redexSteps.data[0].status === false) ||
            redexSteps?.data?.length === 0
          ) {
            navigate('/redexsteps')
          }
        }
        if (part === 'No') {
          if (
            (stepsData?.data &&
              stepsData.data.length > 0 &&
              stepsData.data[0].status === false) ||
            stepsData?.data?.length === 0
          ) {
            navigate('/systemsteps')
          }
        }
      })
    }
  }, [redexSteps, partner])

  useEffect(() => {
    if (
      redexSteps?.data &&
      redexSteps.data.length > 0 &&
      redexSteps.data[0].status === true &&
      stepsData?.data &&
      stepsData.data.length > 0 &&
      stepsData.data[0].status === false
    ) {
      navigate('/systemsteps')
    }
  }, [redexSteps])

  useEffect(() => {
    refetch()
    refetchData()
    refetchPartners()
    stepsRefetch()
  }, [refetch, refetchData, refetchPartners, stepsRefetch])

  if ((isFetchingSteps && !redexSteps) || (isSystemFetching && !stepsData)) {
    return <AppLoader />
  }

  // SolarBMS is the only data source: the Solar dashboard is home.
  return (
    <AppShell nav={USER_NAV} bottomNav={USER_BOTTOM_NAV} firstName={data?.data?.firstName} lastName={data?.data?.lastName}>
      <Routes>
        <Route path='/' element={<Navigate to='/ds/solar' replace />} />
        <Route path='/solar/:siteId?/:tab?' element={<SolarPage />} />
        <Route path='/profile' element={<Profile additionalData={data?.data} />} />
        <Route path='/settings' element={<Settings />} />
        <Route path='*' element={<NotFound />} />
      </Routes>
    </AppShell>
  )
}

const DashboardWithShell: FC = () => (
  <ShellProvider>
    <DashboardRoutes />
  </ShellProvider>
)

const PrivateDashboard = Private(DashboardWithShell)
export default PrivateDashboard
