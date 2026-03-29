import { FC, ReactElement, useState, useEffect } from 'react'
import { ShieldCheck, Sun, Moon, AlertCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '../../../lib/hooks/useTheme'

interface MobileHeaderIconsProps {
  subscription?: any
}

const MobileHeaderIcons: FC<MobileHeaderIconsProps> = ({ subscription }): ReactElement => {
  const { isDark, toggle } = useTheme()
  const [showSubscriptionPopup, setShowSubscriptionPopup] = useState(false)

  const isActive = subscription?.hasAccess
  const daysLeft = subscription?.manualAccessExpiry
    ? Math.max(0, Math.floor((new Date(subscription.manualAccessExpiry).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
    : subscription?.subscription?.endDate 
    ? Math.max(0, Math.floor((new Date(subscription.subscription.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
    : null

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
              className='absolute right-0 top-12 w-64 rounded-xl shadow-xl border p-4 z-50'
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
                  <p className='text-sm' style={{ color: 'var(--text-primary)' }}>
                    {subscription?.subscription?.plan?.name || 'Manual Access'}
                  </p>
                  {daysLeft !== null && (
                    <p className='text-xs mt-1' style={{ color: 'var(--text-secondary)' }}>
                      {daysLeft} days remaining
                    </p>
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
