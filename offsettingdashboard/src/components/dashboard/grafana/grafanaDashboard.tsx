/* eslint-disable @typescript-eslint/no-explicit-any */
import { FC, ReactElement, useState, useEffect } from 'react'
import { BarChart3, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'
import CustomButton from '../../common/button/button'

interface GrafanaDashboardProps {
  additionalData: any
}

const GrafanaDashboard: FC<GrafanaDashboardProps> = ({ additionalData }): ReactElement => {
  const [refreshKey, setRefreshKey] = useState(0)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const userId = additionalData?.id

  const GRAFANA_BASE_URL = import.meta.env.VITE_GRAFANA_URL || 'http://localhost:3001'
  
  useEffect(() => {
    const updateTheme = () => {
      const isDark = document.documentElement.classList.contains('dark') || 
                     document.body.classList.contains('dark') ||
                     document.querySelector('[class*="dark"]') !== null
      setTheme(isDark ? 'dark' : 'light')
    }

    updateTheme()
    const interval = setInterval(updateTheme, 500)
    return () => clearInterval(interval)
  }, [])

  const dashboardUrl = `${GRAFANA_BASE_URL}/d/solar_power_dashboard/solar-power-dashboard?orgId=1&var-userId=${userId}&theme=${theme}&refresh=1s&kiosk`
  const powerOverviewUrl = `${GRAFANA_BASE_URL}/d-solo/solar_charts_dashboard/solar-charts-dashboard?orgId=1&var-userId=${userId}&theme=${theme}&refresh=10s&panelId=1`
  const batterySOCUrl = `${GRAFANA_BASE_URL}/d-solo/solar_charts_dashboard/solar-charts-dashboard?orgId=1&var-userId=${userId}&theme=${theme}&refresh=10s&panelId=3`

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1)
  }

  return (
    <section className='w-full h-full'>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className='mb-6'
      >
        <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4'>
          <div className='flex items-center gap-3'>
            <div className='w-10 h-10 rounded-xl flex items-center justify-center' style={{ background: 'rgba(222,175,11,0.1)' }}>
              <BarChart3 size={24} style={{ color: '#DEAF0B' }} />
            </div>
            <div>
              <h1 className='text-2xl sm:text-3xl font-bold tracking-tight' style={{ color: 'var(--text-primary)' }}>Dashboard</h1>
              <p className='text-xs sm:text-sm' style={{ color: 'var(--text-secondary)' }}>Real-time solar power monitoring</p>
            </div>
          </div>
          <CustomButton
            type='default'
            htmlType='button'
            onClick={handleRefresh}
            icon={<RefreshCw size={16} />}
            variant='secondary'
          />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className='w-full rounded-xl overflow-hidden shadow-lg mb-6'
        style={{ 
          background: 'var(--surface-raised)', 
          border: '1px solid var(--border)',
          height: '400px'
        }}
      >
        <iframe
          key={`${refreshKey}-${theme}`}
          src={dashboardUrl}
          width='100%'
          height='100%'
          frameBorder='0'
          style={{ border: 'none', display: 'block' }}
          title='Grafana Dashboard'
        />
      </motion.div>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6'>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className='w-full rounded-xl overflow-hidden shadow-lg'
          style={{ 
            background: 'var(--surface-raised)', 
            border: '1px solid var(--border)',
            height: '350px'
          }}
        >
          <iframe
            key={`power-${refreshKey}-${theme}`}
            src={powerOverviewUrl}
            width='100%'
            height='100%'
            frameBorder='0'
            style={{ border: 'none', display: 'block' }}
            title='Power Overview'
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className='w-full rounded-xl overflow-hidden shadow-lg'
          style={{ 
            background: 'var(--surface-raised)', 
            border: '1px solid var(--border)',
            height: '350px'
          }}
        >
          <iframe
            key={`battery-${refreshKey}-${theme}`}
            src={batterySOCUrl}
            width='100%'
            height='100%'
            frameBorder='0'
            style={{ border: 'none', display: 'block' }}
            title='Battery State of Charge'
          />
        </motion.div>
      </div>
    </section>
  )
}

export default GrafanaDashboard
