import { FC, ReactElement } from 'react'
import { Home, BarChart3, PieChart, Leaf, Zap } from 'lucide-react'
import { useMatch, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

interface NavItemProps {
  icon: React.ElementType
  label: string
  url: string
}

const NavItem: FC<NavItemProps> = ({ icon: Icon, label, url }): ReactElement => {
  const navigate = useNavigate()
  const isMatch = useMatch(url)

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={() => navigate(url)}
      className='flex flex-col items-center justify-center flex-1 py-2 gap-1'
    >
      <Icon
        size={22}
        strokeWidth={isMatch ? 2.5 : 2}
        style={{ color: isMatch ? '#DEAF0B' : 'var(--text-secondary)' }}
      />
      <span 
        className='text-xs font-medium'
        style={{ color: isMatch ? '#DEAF0B' : 'var(--text-secondary)' }}
      >
        {label}
      </span>
    </motion.button>
  )
}

const MobileBottomNav: FC = (): ReactElement => {
  return (
    <nav
      className='fixed bottom-0 left-0 right-0 lg:hidden z-50 border-t'
      style={{
        backgroundColor: 'var(--surface-base)',
        borderTopColor: 'var(--border)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className='flex items-center justify-around h-16'>
        <NavItem icon={Home} label='Home' url='/ds/' />
        <NavItem icon={BarChart3} label='Analytics' url='/ds/analytics' />
        <NavItem icon={PieChart} label='Charts' url='/ds/charts' />
        <NavItem icon={Leaf} label='Carbon' url='/ds/carbon' />
        <NavItem icon={Zap} label='AI' url='/ds/ai-charging' />
      </div>
    </nav>
  )
}

export default MobileBottomNav
