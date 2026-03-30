import { FC, ReactElement, useState, useEffect } from 'react'
import { ShieldCheck, Sun, Moon, AlertCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '../../../lib/hooks/useTheme'

interface MobileHeaderIconsProps {
  subscription?: any
}

interface TimeRemaining {
  days: number
  hours: number
  minutes: number
  seconds: number
  total: number
}

const MobileHeaderIcons: FC<MobileHeaderIconsProps> = ({ subscription }): ReactElement => {
  const { isDark, toggle } = useTheme()
  const [showSubscriptionPopup, setShowSubscriptionPopup] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining | null>(null)

  const isActive = subscription?.hasAccess

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

  useEffect(() => {
    const handleClickOutside = () => {
      if (showSubscriptionPopup) {
        setShowSubscriptionPopup(false)
      }
    }

    if (showSubscriptionPopup) {
      document.addEventListener('click', handleClickOutside)
    }

    return () => {
      document.removeEventListener('click', handleClickOutside)
    }
  }, [showSubscriptionPopup])

  return (
    <div className='flex items-center gap-2 md:hidden'>
      {/* Subscription Status Icon */}
      <div className='relative'>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={(e) => {
            e.stopPropagation()
            setShowSubscriptionPopup(!showSubscriptionPopup)
          }}
          className='p-2 rounded-lg hover:bg-[var(--surface-overlay)] transition-colors duration-200'
        >
          {isActive ? (
            <ShieldCheck size={20} style={{ color: '#22c55e' }} />
          ) : (
            <AlertCircle size={20} style={{ color: '#ef4444' }} />
          )}
        </motion.button>

        <AnimatePresence>
          {showSubscriptionPopup && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className='absolute right-0 top-12 w-72 rounded-xl shadow-xl border p-4 z-50'
              style={{ 
                background: 'var(--surface-raised)', 
                borderColor: 'var(--border)',
                boxShadow: 'var(--shadow-lg)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {isActive ? (
                <>
                  <div className='flex items-center gap-2 mb-2'>
                    <ShieldCheck size={18} style={{ color: '#22c55e' }} />
                    <p className='font-semibold text-sm' style={{ color: '#22c55e' }}>
                      Active Subscription
                    </p>
                  </div>
                  <p className='text-sm mb-3' style={{ color: 'var(--text-primary)' }}>
                    {subscription?.subscription?.plan?.name || 'Manual Access'}
                  </p>
                  {timeRemaining && timeRemaining.total > 0 && (
                    <div className='grid grid-cols-2 gap-2'>
                      <div className='flex flex-col items-center px-2 py-2 rounded-md' style={{ background: 'rgba(34, 197, 94, 0.15)' }}>
                        <span className='text-xl font-bold tabular-nums' style={{ color: '#22c55e' }}>{timeRemaining.days}</span>
                        <span className='text-xs font-medium' style={{ color: 'var(--text-secondary)' }}>days</span>
                      </div>
                      <div className='flex flex-col items-center px-2 py-2 rounded-md' style={{ background: 'rgba(34, 197, 94, 0.15)' }}>
                        <span className='text-xl font-bold tabular-nums' style={{ color: '#22c55e' }}>{String(timeRemaining.hours).padStart(2, '0')}</span>
                        <span className='text-xs font-medium' style={{ color: 'var(--text-secondary)' }}>hours</span>
                      </div>
                      <div className='flex flex-col items-center px-2 py-2 rounded-md' style={{ background: 'rgba(34, 197, 94, 0.15)' }}>
                        <span className='text-xl font-bold tabular-nums' style={{ color: '#22c55e' }}>{String(timeRemaining.minutes).padStart(2, '0')}</span>
                        <span className='text-xs font-medium' style={{ color: 'var(--text-secondary)' }}>minutes</span>
                      </div>
                      <div className='flex flex-col items-center px-2 py-2 rounded-md' style={{ background: 'rgba(34, 197, 94, 0.15)' }}>
                        <span className='text-xl font-bold tabular-nums' style={{ color: '#22c55e' }}>{String(timeRemaining.seconds).padStart(2, '0')}</span>
                        <span className='text-xs font-medium' style={{ color: 'var(--text-secondary)' }}>seconds</span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className='flex items-center gap-2 mb-2'>
                    <AlertCircle size={18} style={{ color: '#ef4444' }} />
                    <p className='font-semibold text-sm' style={{ color: '#ef4444' }}>
                      Subscription Required
                    </p>
                  </div>
                  <p className='text-xs' style={{ color: 'var(--text-secondary)' }}>
                    Subscribe to access all features
                  </p>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Theme Toggle Icon */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={toggle}
        className='p-2 rounded-lg hover:bg-[var(--surface-overlay)] transition-colors duration-200'
      >
        {isDark ? (
          <Sun size={20} style={{ color: '#DEAF0B' }} />
        ) : (
          <Moon size={20} style={{ color: '#DEAF0B' }} />
        )}
      </motion.button>
    </div>
  )
}

export default MobileHeaderIcons
