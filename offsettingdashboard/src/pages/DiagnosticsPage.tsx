import { useState, useEffect } from 'react'
import { getFromLocal } from '../helpers/handleStorage'

export const DiagnosticsPage = () => {
  const [userId, setUserId] = useState<string>('')
  const [user, setUser] = useState<any>(null)
  const [grafanaHealth, setGrafanaHealth] = useState<string>('Checking...')
  const [influxData, setInfluxData] = useState<string>('Checking...')

  useEffect(() => {
    const userData = getFromLocal<any>('user')
    setUser(userData)
    if (userData) {
      setUserId(userData._id || userData.id || 'NOT FOUND')
    } else {
      setUserId('NO USER IN LOCALSTORAGE')
    }

    // Check Grafana health
    const grafanaUrl = import.meta.env.VITE_GRAFANA_URL || 'http://localhost:3001'
    fetch(`${grafanaUrl}/api/health`)
      .then(res => res.json())
      .then(data => setGrafanaHealth(JSON.stringify(data, null, 2)))
      .catch(err => setGrafanaHealth(`Error: ${err.message}`))

    // Check InfluxDB data
    const testUserId = userData?._id || userData?.id || '69aacf12fe464cb9d11fa083'
    fetch(`${grafanaUrl}/api/datasources/proxy/1/query?db=home_assistant&q=SELECT * FROM "battery_voltage" WHERE "userId" = '${testUserId}' AND time > now() - 1h LIMIT 5`)
      .then(res => res.json())
      .then(data => setInfluxData(JSON.stringify(data, null, 2)))
      .catch(err => setInfluxData(`Error: ${err.message}`))
  }, [])

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-6">🔍 Dashboard Diagnostics</h1>
      
      <div className="space-y-6">
        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-3">👤 User Information</h2>
          <p className="mb-2"><strong>UserId:</strong> <span className="text-green-400">{userId}</span></p>
          <pre className="bg-gray-900 p-4 rounded overflow-auto text-sm">
            {JSON.stringify(user, null, 2)}
          </pre>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-3">🏥 Grafana Health</h2>
          <pre className="bg-gray-900 p-4 rounded overflow-auto text-sm">
            {grafanaHealth}
          </pre>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-3">📊 InfluxDB Data Sample</h2>
          <pre className="bg-gray-900 p-4 rounded overflow-auto text-sm">
            {influxData}
          </pre>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-3">🔗 Dashboard URLs</h2>
          <div className="space-y-2 text-sm">
            <p><strong>Gauges:</strong></p>
            <a 
              href={`${import.meta.env.VITE_GRAFANA_URL || 'http://localhost:3001'}/d-solo/solar_power_dashboard?orgId=1&var-userId=${userId}&theme=dark&refresh=10s&from=now-24h&to=now&kiosk=tv`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline block break-all"
            >
              {`${import.meta.env.VITE_GRAFANA_URL || 'http://localhost:3001'}/d-solo/solar_power_dashboard?orgId=1&var-userId=${userId}&theme=dark&refresh=10s&from=now-24h&to=now&kiosk=tv`}
            </a>
            
            <p className="mt-4"><strong>Charts:</strong></p>
            <a 
              href={`${import.meta.env.VITE_GRAFANA_URL || 'http://localhost:3001'}/d-solo/solar_charts_dashboard?orgId=1&var-userId=${userId}&theme=dark&refresh=10s&from=now-24h&to=now&kiosk=tv`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline block break-all"
            >
              {`${import.meta.env.VITE_GRAFANA_URL || 'http://localhost:3001'}/d-solo/solar_charts_dashboard?orgId=1&var-userId=${userId}&theme=dark&refresh=10s&from=now-24h&to=now&kiosk=tv`}
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DiagnosticsPage
