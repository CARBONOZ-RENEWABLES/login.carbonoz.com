/* eslint-disable @typescript-eslint/no-explicit-any */
import { FC, ReactElement, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle, Clock, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'

interface SubscriptionStatusProps {
  userId?: string
}

interface TimeRemaining {
  days: number
  hours: number
  minutes: number
  seconds: number
  total: number
}

const SubscriptionStatus: FC<SubscriptionStatusProps> = (): ReactElement => {
  const [subscription, setSubscription] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining | null>(null)
  const navigate = useNavigate()

  const calculateTimeRemaining = (expiryDate: Date): TimeRemaining => {
    const now = new Date().getTime()
    const expiry = new Date(expiryDate).setHours(23, 59, 59, 999)
    const total = expiry - now

    if (total <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 }
    }

    const days = Math.floor(total / (1000 * 60 * 60 * 24))
    const hours = Math.floor((total % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((total % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((total % (1000 * 60)) / 1000)

    return { days, hours, minutes, seconds, total }
  }

  useEffect(() => {
    fetchSubscription()
  }, [])

  useEffect(() => {
    if (!subscription?.hasAccess) return

    const expiryDate = subscription?.manualAccessExpiry || subscription?.subscription?.endDate
    if (!expiryDate) return

    // Update countdown every second
    const interval = setInterval(() => {
      setTimeRemaining(calculateTimeRemaining(expiryDate))
    }, 1000)

    // Initial calculation
    setTimeRemaining(calculateTimeRemaining(expiryDate))

    return () => clearInterval(interval)
  }, [subscription])

  const fetchSubscription = async (manual = false) => {
    try {
      if (manual) setRefreshing(true)
      let token = localStorage.getItem('token')
      if (!token) {
        console.log('No token found')
        setLoading(false)
        return
      }
      
      // Handle JSON-stringified token
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
        console.log('Subscription data:', data)
        setSubscription(data)
      } else if (response.status === 401) {
        console.log('Token expired or invalid - please log in again')
      }
    } catch (error) {
      console.error('Error fetching subscription:', error)
    } finally {
      setLoading(false)
      if (manual) setRefreshing(false)
    }
  }

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchSubscription()
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className='flex items-center gap-2 p-3 rounded-lg' style={{ background: 'var(--surface-raised)' }}>
        <Clock size={16} style={{ color: 'var(--text-secondary)' }} />
        <span className='text-sm' style={{ color: 'var(--text-secondary)' }}>Loading subscription...</span>
      </div>
    )
  }

  const isActive = subscription?.hasAccess

  if (!isActive) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className='p-3 sm:p-4 rounded-lg border-l-4'
        style={{ 
          background: 'rgba(239, 68, 68, 0.1)', 
          borderColor: '#ef4444',
          borderLeftColor: '#ef4444'
        }}
      >
        <div className='flex items-start gap-2 sm:gap-3'>
          <AlertCircle size={18} className='flex-shrink-0 sm:w-5 sm:h-5' style={{ color: '#ef4444' }} />
          <div className='flex-1 min-w-0'>
            <h4 className='font-semibold text-xs sm:text-sm mb-1' style={{ color: '#ef4444' }}>
              Subscription Required
            </h4>
            <p className='text-xs' style={{ color: 'var(--text-secondary)' }}>
              {!localStorage.getItem('token') 
                ? 'Please log in to check your subscription status'
                : 'Subscribe now to access all platform features'}
            </p>
          </div>
          <button
            onClick={() => fetchSubscription(true)}
            disabled={refreshing}
            className='p-1 hover:bg-red-200 rounded flex-shrink-0'
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} style={{ color: '#ef4444' }} />
          </button>
        </div>
        {localStorage.getItem('token') ? (
          <button
            onClick={() => navigate('/ds/subscribe')}
            className='mt-2 text-xs sm:text-sm underline block w-full text-left'
            style={{ color: '#ef4444' }}
          >
            → Go to subscription page
          </button>
        ) : (
          <div className='flex flex-col sm:flex-row gap-2 mt-2'>
            <button
              onClick={() => navigate('/login')}
              className='text-xs underline'
              style={{ color: '#ef4444' }}
            >
              Log in to continue
            </button>
            <span className='hidden sm:inline text-xs' style={{ color: 'var(--text-secondary)' }}>•</span>
            <button
              onClick={() => {
                localStorage.clear()
                window.location.href = '/login'
              }}
              className='text-xs underline'
              style={{ color: '#ef4444' }}
            >
              Clear cache & login
            </button>
          </div>
        )}
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className='p-4 rounded-lg border-l-4'
      style={{ 
        background: 'rgba(34, 197, 94, 0.1)', 
        borderColor: '#22c55e',
        borderLeftColor: '#22c55e'
      }}
    >
      <div className='flex items-start gap-3'>
        <CheckCircle size={20} style={{ color: '#22c55e' }} />
        <div className='flex-1'>
          <h4 className='font-semibold text-sm mb-1' style={{ color: '#22c55e' }}>
            Active Subscription
          </h4>
          <p className='text-xs mb-2' style={{ color: 'var(--text-secondary)' }}>
            {subscription?.subscription?.plan?.name || 'Manual Access'}
          </p>
          {timeRemaining && timeRemaining.total > 0 && (
            <div className='flex items-center gap-2 flex-wrap'>
              <div className='flex items-center gap-1.5 px-2 py-1 rounded-md' style={{ background: 'rgba(34, 197, 94, 0.15)' }}>
                <span className='text-lg font-bold tabular-nums' style={{ color: '#22c55e' }}>{timeRemaining.days}</span>
                <span className='text-xs font-medium' style={{ color: 'var(--text-secondary)' }}>days</span>
              </div>
              <div className='flex items-center gap-1.5 px-2 py-1 rounded-md' style={{ background: 'rgba(34, 197, 94, 0.15)' }}>
                <span className='text-lg font-bold tabular-nums' style={{ color: '#22c55e' }}>{String(timeRemaining.hours).padStart(2, '0')}</span>
                <span className='text-xs font-medium' style={{ color: 'var(--text-secondary)' }}>hrs</span>
              </div>
              <div className='flex items-center gap-1.5 px-2 py-1 rounded-md' style={{ background: 'rgba(34, 197, 94, 0.15)' }}>
                <span className='text-lg font-bold tabular-nums' style={{ color: '#22c55e' }}>{String(timeRemaining.minutes).padStart(2, '0')}</span>
                <span className='text-xs font-medium' style={{ color: 'var(--text-secondary)' }}>min</span>
              </div>
              <div className='flex items-center gap-1.5 px-2 py-1 rounded-md' style={{ background: 'rgba(34, 197, 94, 0.15)' }}>
                <span className='text-lg font-bold tabular-nums' style={{ color: '#22c55e' }}>{String(timeRemaining.seconds).padStart(2, '0')}</span>
                <span className='text-xs font-medium' style={{ color: 'var(--text-secondary)' }}>sec</span>
              </div>
            </div>
          )}
        </div>
        <button
          onClick={() => fetchSubscription(true)}
          disabled={refreshing}
          className='p-1 hover:bg-green-200 rounded'
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} style={{ color: '#22c55e' }} />
        </button>
      </div>
    </motion.div>
  )
}

export default SubscriptionStatus
