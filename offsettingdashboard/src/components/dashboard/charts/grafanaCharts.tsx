/* eslint-disable @typescript-eslint/no-explicit-any */
import { FC, ReactElement, useState, useEffect } from 'react'
import { TrendingUp, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'
import CustomButton from '../../common/button/button'

interface GrafanaChartsProps {
  additionalData: any
}

const GrafanaCharts: FC<GrafanaChartsProps> = ({ additionalData }): ReactElement => {
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

  const chartsUrl = `${GRAFANA_BASE_URL}/d/solar_charts_dashboard/solar-charts-dashboard?orgId=1&var-userId=${userId}&theme=${theme}&refresh=10s&kiosk`

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
              <TrendingUp size={24} style={{ color: '#DEAF0B' }} />
            </div>
            <div>
              <h1 className='text-2xl sm:text-3xl font-bold tracking-tight' style={{ color: 'var(--text-primary)' }}>Charts</h1>
              <p className='text-xs sm:text-sm' style={{ color: 'var(--text-secondary)' }}>Time-series visualization and trends</p>
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
        className='w-full rounded-xl overflow-hidden shadow-lg'
        style={{ 
          background: 'var(--surface-raised)', 
          border: '1px solid var(--border)',
          height: 'calc(100vh - 200px)',
          minHeight: '1200px'
        }}
      >
        <iframe
          key={`${refreshKey}-${theme}`}
          src={chartsUrl}
          width='100%'
          height='100%'
          frameBorder='0'
          style={{ border: 'none', display: 'block' }}
          title='Grafana Charts'
        />
      </motion.div>
    </section>
  )
}

export default GrafanaCharts
