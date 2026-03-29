/* eslint-disable react-hooks/exhaustive-deps */
import { FC, ReactElement, useEffect, useState } from 'react'
import { Route, Routes, useNavigate } from 'react-router-dom'
import ContentWrapper from '../components/common/contentwrapper/contentwrapper'
import NavBar from '../components/common/header/header'
import { GeneralContentLoader } from '../components/common/loader/loader'
import Sidebar from '../components/common/sidebar/sidebar'
import MobileBottomNav from '../components/common/mobileNav/MobileBottomNav'
import SubscriptionToast from '../components/common/toast/SubscriptionToast'
import Analytics from '../components/dashboard/analytics/analytics'
import BoxInformation from '../components/dashboard/boxes/boxesInformation'
import CarbonIntensity from '../components/dashboard/carbonIntensity/carbonIntensity'
import GrafanaCharts from '../components/dashboard/charts/grafanaCharts'
import GrafanaDashboard from '../components/dashboard/grafana/grafanaDashboard'
import Profile from '../components/dashboard/profile/profile'
import Settings from '../components/dashboard/settings/settings'
import SubscribePage from '../components/subscription/SubscribePage'
import AiChargingDashboard from '../components/AiChargingDashboard'
import DiagnosticsPage from '../pages/DiagnosticsPage'
import NotFound from '../components/notfound/notFound'
import { useGetBoxesQuery } from '../lib/api/box/boxEndPoints'
import { useGetPartnersQuery } from '../lib/api/partners/partnersEndPoints'
import { useGetStepsQuery } from '../lib/api/redexsteps/stepsEndpoints'
import { useGetSystemStepsQuery } from '../lib/api/systemSteps/systemSteps'
import { useGetAdditionalInfoQuery } from '../lib/api/user/userEndPoints'
import Private from './private'

export const DashboardRoutes: FC = (): ReactElement => {
  const navigate = useNavigate()
  const [subscription, setSubscription] = useState<any>(null)
  const [showToast, setShowToast] = useState(false)

  const {
    data: boxesData,
    isFetching: fetchingBoxes,
    refetch: refetchBoxes,
  } = useGetBoxesQuery()

  const {
    data: redexSteps,
    refetch,
    isFetching: isFetchingSteps,
  } = useGetStepsQuery()
  const [partner, setPartner] = useState<Array<string>>([])
  const { data, refetch: refetchData, isFetching } = useGetAdditionalInfoQuery()
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
    const fetchSubscription = async () => {
      try {
        let token = localStorage.getItem('token')
        if (!token) return
        
        try {
          token = JSON.parse(token)
        } catch {
          // Token is already a string
        }
        
        const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/billing/me/subscription`, {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
        
        if (response.ok) {
          const data = await response.json()
          setSubscription(data)
          setShowToast(true)
        }
      } catch (error) {
        console.error('Error fetching subscription:', error)
      }
    }

    fetchSubscription()
  }, [])

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
    if (
      ((redexSteps?.data &&
        redexSteps.data.length > 0 &&
        redexSteps.data[0].status === true) ||
        (stepsData?.data &&
          stepsData.data.length > 0 &&
          stepsData.data[0].status === true)) &&
      boxesData?.data &&
      boxesData.data.length === 0
    ) {
      navigate('/ds/devices')
    }
  }, [stepsData, boxesData])

  useEffect(() => {
    refetch()
    refetchData()
    refetchBoxes()
    refetchPartners()
    stepsRefetch()
  }, [refetch, refetchData, refetchBoxes, refetchPartners, stepsRefetch])

  if (isFetchingSteps || fetchingBoxes || isSystemFetching) {
    return <GeneralContentLoader />
  }

  return (
    <div className='h-[100vh] bg-white overflow-y-hidden w-[100%]'>
      <div className='flex h-[100%] w-[100%] '>
        <Sidebar boxesData={boxesData?.data} />
        <div className='flex-1 h-[100%] flex flex-col mb-16 w-[100%] md:mb-0'>
          <NavBar data={data?.data} boxesData={boxesData?.data} />
          <ContentWrapper>
            <Routes>
              <Route
                path='/'
                element={<GrafanaDashboard additionalData={data?.data} />}
              />
              <Route
                path='/analytics'
                element={<Analytics additionalData={data?.data} />}
              />
              <Route path='/settings' element={<Settings />} />
              <Route
                path='/profile'
                element={
                  <Profile
                    additionalData={data?.data}
                    loading={fetchingBoxes || isFetching}
                  />
                }
              />
              <Route
                path='/devices'
                element={
                  <BoxInformation
                    boxesData={boxesData?.data}
                    isFetching={fetchingBoxes}
                  />
                }
              />
              <Route path='/charts' element={<GrafanaCharts additionalData={data?.data} />} />
              <Route
                path='/carbon'
                element={<CarbonIntensity additionalData={data?.data} />}
              />
              <Route
                path='/grafana'
                element={<GrafanaDashboard additionalData={data?.data} />}
              />
              <Route path='/subscribe' element={<SubscribePage />} />
              <Route path='/ai-charging' element={<AiChargingDashboard userId={data?.data?.id} />} />
              <Route path='/diagnostics' element={<DiagnosticsPage />} />
              <Route path='*' element={<NotFound />} />
            </Routes>
          </ContentWrapper>
        </div>
        <MobileBottomNav />
        <SubscriptionToast subscription={subscription} show={showToast} />
      </div>
    </div>
  )
}

const PrivateDashboard = Private(DashboardRoutes)
export default PrivateDashboard
