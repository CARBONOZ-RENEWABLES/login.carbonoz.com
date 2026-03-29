import { FC, ReactElement, useEffect, useState } from 'react'
import { CheckCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface SubscriptionToastProps {
  subscription: any
  show: boolean
}

const SubscriptionToast: FC<SubscriptionToastProps> = ({ subscription, show }): ReactElement => {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (show && subscription?.hasAccess) {
      setVisible(true)
      const timer = setTimeout(() => {
        setVisible(false)
      }, 4500)
      return () => clearTimeout(timer)
    }
  }, [show, subscription])

  if (!subscription?.hasAccess) return <></>

  const daysLeft = subscription?.manualAccessExpiry
    ? Math.max(0, Math.floor((new Date(subscription.manualAccessExpiry).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
    : subscription?.subscription?.endDate 
    ? Math.max(0, Math.floor((new Date(subscription.subscription.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
    : null

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className='fixed left-1/2 -translate-x-1/2 z-40 lg:hidden'
          style={{ bottom: '80px' }}
        >
          <div
            className='flex items-center gap-3 px-5 py-3 rounded-full shadow-2xl'
            style={{
              backgroundColor: 'rgba(30, 30, 30, 0.95)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <CheckCircle size={20} style={{ color: '#22c55e' }} />
            <span className='text-white text-sm font-medium whitespace-nowrap'>
              {subscription?.subscription?.plan?.name || 'Manual Access'} • {daysLeft} days left
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default SubscriptionToast
