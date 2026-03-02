import { useEffect, useState } from 'react'
import { getGrafanaDashboardUrl } from '../services/grafana.service'

interface GrafanaDashboardProps {
  userId: string
  dashboardUid: string
  theme?: 'light' | 'dark'
  height?: string
  refresh?: string
  timeRange?: { from: string; to: string }
}

export const GrafanaDashboard = ({
  userId,
  dashboardUid,
  theme = 'light',
  height = '800px',
  refresh = '10s',
  timeRange = { from: 'now-24h', to: 'now' }
}: GrafanaDashboardProps) => {
  const [dashboardUrl, setDashboardUrl] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (userId) {
      const url = getGrafanaDashboardUrl(dashboardUid, userId, {
        theme,
        refresh,
        kiosk: true,
        from: timeRange.from,
        to: timeRange.to
      })
      setDashboardUrl(url)
      setIsLoading(false)
    }
  }, [userId, dashboardUid, theme, refresh, timeRange])

  if (!userId) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-gray-500">Please log in to view dashboard</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="w-full" style={{ height }}>
      <iframe
        src={dashboardUrl}
        width="100%"
        height="100%"
        frameBorder="0"
        title={`Grafana Dashboard - ${dashboardUid}`}
        sandbox="allow-scripts allow-same-origin"
        className="rounded-lg shadow-lg"
      />
    </div>
  )
}

export default GrafanaDashboard
