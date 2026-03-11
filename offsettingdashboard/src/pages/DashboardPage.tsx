import { useState, useEffect } from 'react'
import GrafanaDashboard from '../components/GrafanaDashboard'
import { getFromLocal } from '../helpers/handleStorage'

export const DashboardPage = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [activeTab, setActiveTab] = useState<'gauges' | 'charts'>('gauges')
  const [userId, setUserId] = useState<string>('')
  
  useEffect(() => {
    // Get userId from localStorage (set during login)
    const user = getFromLocal<{ _id?: string; id?: string }>('user')
    if (user) {
      setUserId(user._id || user.id || '')
    }
  }, [])

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="container mx-auto px-4 py-6">
        {/* Header with Theme Toggle */}
        <div className="flex justify-between items-center mb-6">
          <h1 className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            Solar Monitoring
          </h1>
          
          {/* Theme Toggle */}
          <button
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className={`px-4 py-2 rounded-lg ${
              theme === 'dark'
                ? 'bg-gray-700 text-white hover:bg-gray-600'
                : 'bg-white text-gray-900 hover:bg-gray-100'
            } transition-colors`}
          >
            {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-4 mb-6">
          <button
            onClick={() => setActiveTab('gauges')}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              activeTab === 'gauges'
                ? theme === 'dark'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-500 text-white'
                : theme === 'dark'
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            📊 Power Gauges
          </button>
          <button
            onClick={() => setActiveTab('charts')}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              activeTab === 'charts'
                ? theme === 'dark'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-500 text-white'
                : theme === 'dark'
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            📈 Historical Charts
          </button>
        </div>

        {/* Dashboard Content */}
        <div className="rounded-lg overflow-hidden">
          {activeTab === 'gauges' && (
            <GrafanaDashboard
              userId={userId}
              dashboardUid="solar_power_dashboard"
              theme={theme}
              height="600px"
              refresh="10s"
            />
          )}
          
          {activeTab === 'charts' && (
            <GrafanaDashboard
              userId={userId}
              dashboardUid="solar_charts_dashboard"
              theme={theme}
              height="1200px"
              refresh="10s"
              timeRange={{ from: 'now-24h', to: 'now' }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
