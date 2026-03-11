import axios from 'axios'

const GRAFANA_API_URL = import.meta.env.VITE_GRAFANA_URL || 'http://localhost:3001'

export const getGrafanaDashboardUrl = (
  dashboardUid: string,
  userId: string,
  options: {
    theme?: 'light' | 'dark'
    refresh?: string
    kiosk?: boolean
    from?: string
    to?: string
  } = {}
): string => {
  const {
    theme = 'light',
    refresh = '10s',
    kiosk = true,
    from = 'now-24h',
    to = 'now'
  } = options

  const params = new URLSearchParams({
    orgId: '1',
    'var-userId': userId,
    theme,
    refresh,
    from,
    to
  })

  if (kiosk) params.append('kiosk', 'tv')

  return `${GRAFANA_API_URL}/d/${dashboardUid}?${params.toString()}`
}

export const checkGrafanaHealth = async (): Promise<boolean> => {
  try {
    const response = await axios.get(`${GRAFANA_API_URL}/api/health`)
    return response.data.database === 'ok'
  } catch (error) {
    return false
  }
}
