import { FC } from 'react'
import { Zap, TrendingUp } from 'lucide-react'
import { motion } from 'framer-motion'

interface AnalyticsCardProps {
  data: string | undefined
  title?: string
}

const AnalyticsCard: FC<AnalyticsCardProps> = ({ data, title }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      className='relative h-40 w-full rounded-xl p-6 border overflow-hidden group transition-all duration-200'
      style={{
        background: 'var(--surface-raised)',
        borderColor: 'var(--border)',
        boxShadow: 'var(--shadow-md)'
      }}
    >
      <div className='absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300' style={{ background: 'linear-gradient(135deg, rgba(222,175,11,0.05) 0%, transparent 100%)' }} />
      
      <div className='absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500' style={{ background: 'rgba(222,175,11,0.2)' }} />

      <div className='relative z-10 flex flex-col h-full justify-between'>
        <div className='flex items-start justify-between'>
          <motion.div
            whileHover={{ rotate: 360, scale: 1.1 }}
            transition={{ duration: 0.5 }}
            className='w-12 h-12 rounded-xl flex items-center justify-center border-2 transition-colors duration-200'
            style={{ 
              background: 'rgba(222,175,11,0.1)', 
              borderColor: 'rgba(222,175,11,0.2)' 
            }}
          >
            <Zap size={24} style={{ color: '#DEAF0B' }} strokeWidth={2.5} />
          </motion.div>
          <div className='w-8 h-8 rounded-lg flex items-center justify-center' style={{ background: 'rgba(34,197,94,0.1)' }}>
            <TrendingUp size={16} style={{ color: '#22c55e' }} />
          </div>
        </div>

        <div>
          <motion.p
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className='text-3xl font-bold mb-1 flex items-baseline gap-2'
            style={{ color: 'var(--text-primary)' }}
          >
            {data}
            <span className='text-lg font-semibold' style={{ color: 'var(--text-secondary)' }}>kWh</span>
          </motion.p>
          <p className='text-sm font-medium' style={{ color: 'var(--text-secondary)' }}>
            Load power {title}
          </p>
        </div>
      </div>
    </motion.div>
  )
}

export default AnalyticsCard
