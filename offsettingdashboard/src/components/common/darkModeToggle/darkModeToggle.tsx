import { FC } from 'react'
import { Sun, Moon } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTheme } from '../../../lib/hooks/useTheme'

const DarkModeToggle: FC = () => {
  const { isDark, toggle } = useTheme()

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={toggle}
      className='relative w-16 h-8 rounded-full p-1 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[#DEAF0B]/40'
      style={{
        background: isDark
          ? 'linear-gradient(135deg, #1e2430 0%, #0f1117 100%)'
          : 'linear-gradient(135deg, #DEAF0B 0%, #c49a0a 100%)',
      }}
    >
      <motion.div
        animate={{
          x: isDark ? 32 : 0,
        }}
        transition={{
          type: 'spring',
          stiffness: 500,
          damping: 30,
        }}
        className='w-6 h-6 rounded-full flex items-center justify-center shadow-lg'
        style={{
          background: isDark ? '#DEAF0B' : '#ffffff',
        }}
      >
        <motion.div
          initial={false}
          animate={{
            rotate: isDark ? 180 : 0,
            scale: isDark ? 1 : 1,
          }}
          transition={{ duration: 0.3 }}
        >
          {isDark ? (
            <Moon size={14} className='text-black' />
          ) : (
            <Sun size={14} className='text-[#DEAF0B]' />
          )}
        </motion.div>
      </motion.div>

      <div className='absolute inset-0 flex items-center justify-between px-2 pointer-events-none'>
        <motion.div
          animate={{ opacity: isDark ? 0 : 0.3 }}
          transition={{ duration: 0.2 }}
        >
          <Sun size={12} className='text-black' />
        </motion.div>
        <motion.div
          animate={{ opacity: isDark ? 0.3 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <Moon size={12} className='text-[#DEAF0B]' />
        </motion.div>
      </div>
    </motion.button>
  )
}

export default DarkModeToggle
