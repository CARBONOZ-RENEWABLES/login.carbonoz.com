import { FC, ReactElement, cloneElement } from 'react'
import { Users, FileText, Activity, DollarSign } from 'lucide-react'
import { useMatch, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Logo from '../../assets/1.jpg'
import { removeFromLocal } from '../../helpers/handleStorage'
import { useTheme } from '../../lib/hooks/useTheme'
import CustomImage from '../common/image/customImage'
import DarkModeToggle from '../common/darkModeToggle/darkModeToggle'

interface SidebarItemProps {
  icon: ReactElement
  text: string
  url: string
  isLogout?: boolean
  setDrawerVisible?: (value: boolean) => void
}

interface SideBarProps {
  isDrawer?: boolean
  setDrawerVisible?: (value: boolean) => void
}

const SidebarItem: FC<SidebarItemProps> = ({
  icon,
  text,
  url,
  isLogout,
  setDrawerVisible,
}): ReactElement => {
  const navigate = useNavigate()
  const isMatch = useMatch(url)

  const handleClick = (): void => {
    if (isLogout) {
      removeFromLocal('token')
    }
    setDrawerVisible && setDrawerVisible(false)
    navigate(url)
  }

  return (
    <motion.div
      whileHover={{ x: 4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className={`relative flex items-center gap-3 mb-1 cursor-pointer px-4 py-3 rounded-xl transition-all duration-200 ${
        isMatch
          ? 'bg-[#DEAF0B]/10 text-[#DEAF0B] border-l-2 border-[#DEAF0B]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]'
      }`}
      onClick={handleClick}
    >
      <div className="w-5 h-5 flex items-center justify-center">
        {cloneElement(icon, {
          size: 20,
          strokeWidth: isMatch ? 2.5 : 2,
        })}
      </div>
      <p className={`text-sm font-medium transition-colors duration-200 ${isMatch ? 'font-semibold' : ''}`}>
        {text}
      </p>
    </motion.div>
  )
}

const AdminSidebar: FC<SideBarProps> = ({
  isDrawer,
  setDrawerVisible,
}): ReactElement => {
  const navigate = useNavigate()
  const { isDark, toggle } = useTheme()

  function goToDashboard() {
    navigate('/admin/')
  }

  return (
    <motion.section
      initial={isDrawer ? { x: -300 } : false}
      animate={isDrawer ? { x: 0 } : false}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={`lg:w-[280px] 2xl:w-[280px] ${
        isDrawer ? 'flex w-[280px]' : 'hidden'
      } h-[100%] lg:flex flex-col py-6 px-4 bg-[var(--surface-base)] border-r border-[var(--border)] max-md:hidden`}
      style={{ background: 'var(--surface-base)', borderColor: 'var(--border)' }}
    >
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className='flex items-center gap-3 mb-8 cursor-pointer px-2'
        onClick={goToDashboard}
      >
        <div className="relative">
          <CustomImage src={Logo} width={40} className='rounded-xl' />
          <div className="absolute -inset-1 bg-[#DEAF0B]/20 rounded-xl blur-sm -z-10" />
        </div>
        <h1 className='text-xl font-bold tracking-tight' style={{ color: '#DEAF0B' }}>CARBONOZ</h1>
      </motion.div>

      <div className='flex-1 mt-4'>
        <div className="space-y-1">
          <div className="px-2 mb-4">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Admin Panel</p>
          </div>
          <SidebarItem
            icon={<FileText />}
            text='Redex'
            url='/admin/'
            setDrawerVisible={setDrawerVisible}
          />
          <SidebarItem
            icon={<Users />}
            text='Users'
            url='/admin/users'
            setDrawerVisible={setDrawerVisible}
          />
          <SidebarItem
            icon={<Activity />}
            text='Logs'
            url='/admin/logs'
            setDrawerVisible={setDrawerVisible}
          />
          <SidebarItem
            icon={<DollarSign />}
            text='Plans'
            url='/admin/plans'
            setDrawerVisible={setDrawerVisible}
          />
        </div>
      </div>

      <div className='mt-auto pt-6 border-t' style={{ borderColor: 'var(--border)' }}>
        <div className='flex items-center justify-between p-3'>
          <span className='text-sm font-semibold' style={{ color: 'var(--text-secondary)' }}>
            {isDark ? 'Dark Mode' : 'Light Mode'}
          </span>
          <DarkModeToggle />
        </div>
      </div>
    </motion.section>
  )
}

export default AdminSidebar
