import { Drawer, Dropdown } from 'antd'
import { FC, ReactElement, useState } from 'react'
import { User, LogOut, Menu, ChevronDown } from 'lucide-react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import Logo from '../../../assets/1.jpg'
import { removeFromLocal } from '../../../helpers/handleStorage'
import { boxInterface } from '../../../lib/api/box/boxEndPoints'
import { AdditionalInfoInt } from '../../../lib/api/user/userEndPoints'
import AdminSidebar from '../../admin/sidebar'
import CustomImage from '../image/customImage'
import Sidebar from '../sidebar/sidebar'
import SubscriptionStatus from '../../subscription/SubscriptionStatus'

interface props {
  data?: AdditionalInfoInt | undefined
  additional?: boolean
  boxesData?: Array<boxInterface> | undefined
  isAdmin?: boolean
}

const NavBar: FC<props> = ({
  data,
  additional,
  boxesData,
  isAdmin,
}): ReactElement => {
  const navigate = useNavigate()

  const [drawerVisible, setDrawerVisible] = useState<boolean>(false)
  const toggleDrawer = () => {
    setDrawerVisible((prev) => !prev)
  }

  const handleLogout = (): void => {
    removeFromLocal('token')
    navigate('/')
  }

  const ProfileDropdown = (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className='w-[220px] rounded-xl shadow-xl border p-2 mt-2'
      style={{ 
        background: 'var(--surface-raised)', 
        borderColor: 'var(--border)',
        boxShadow: 'var(--shadow-md)'
      }}
    >
      <div className='px-3 py-2 border-b' style={{ borderColor: 'var(--border)' }}>
        <p className='text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>
          {isAdmin ? 'Admin' : data?.firstName}
        </p>
        <p className='text-xs mt-0.5' style={{ color: 'var(--text-secondary)' }}>
          {isAdmin ? 'Administrator' : data?.lastName}
        </p>
      </div>

      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className='flex items-center gap-3 w-full rounded-xl p-3 mt-2 font-semibold cursor-pointer transition-all duration-200'
        style={{ background: '#DEAF0B' }}
        onClick={handleLogout}
      >
        <LogOut size={18} className='text-black' />
        <p className='flex-1 text-black text-sm'>Logout</p>
      </motion.div>
    </motion.div>
  )

  return (
    <>
      <Drawer
        placement='left'
        onClose={toggleDrawer}
        closeIcon={false}
        open={drawerVisible}
        zIndex={900}
        width={'fit-content'}
        height={'100%'}
        styles={{ body: { padding: 0, background: 'transparent' } }}
      >
        <section className='h-[100%] w-[100%] overflow-y-auto'>
          {isAdmin ? (
            <AdminSidebar isDrawer={true} setDrawerVisible={setDrawerVisible} />
          ) : (
            <Sidebar
              isDrawer={true}
              boxesData={boxesData}
              setDrawerVisible={setDrawerVisible}
            />
          )}
        </section>
      </Drawer>
      <nav
        className='px-6 py-4 flex justify-between items-center border-b transition-all duration-200'
        style={{ 
          background: 'var(--surface-base)', 
          borderColor: 'var(--border)',
          color: 'var(--text-primary)'
        }}
      >
        {additional ? (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className='flex items-center gap-4'
          >
            <div className="relative">
              <CustomImage src={Logo} width={32} className='rounded-lg' />
              <div className="absolute -inset-1 bg-[#DEAF0B]/20 rounded-lg blur-sm -z-10" />
            </div>
            <p className='text-base font-semibold' style={{ color: 'var(--text-primary)' }}>Welcome</p>
          </motion.div>
        ) : (
          <div className='flex items-center gap-4 flex-1'>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleDrawer}
              className='p-2 rounded-lg hover:bg-[var(--surface-overlay)] transition-colors duration-200 lg:hidden'
            >
              <Menu size={24} style={{ color: '#DEAF0B' }} />
            </motion.button>
            {!isAdmin && (
              <div className='flex-1 max-w-md hidden md:block'>
                <SubscriptionStatus />
              </div>
            )}
          </div>
        )}

        <Dropdown overlay={ProfileDropdown} trigger={['click']} placement='bottomRight'>
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className='flex items-center gap-3 cursor-pointer px-4 py-2 rounded-xl hover:bg-[var(--surface-overlay)] transition-all duration-200 ml-auto'
          >
            <div className='w-10 h-10 rounded-xl flex items-center justify-center border-2 transition-colors duration-200' style={{ background: 'rgba(222,175,11,0.1)', borderColor: 'rgba(222,175,11,0.2)' }}>
              <User size={20} style={{ color: '#DEAF0B' }} />
            </div>
            <div className='hidden lg:flex items-center gap-2'>
              <p className='text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>
                {isAdmin ? 'Admin' : data?.lastName}
              </p>
              <ChevronDown size={16} style={{ color: 'var(--text-secondary)' }} />
            </div>
          </motion.div>
        </Dropdown>
      </nav>
    </>
  )
}

export default NavBar
