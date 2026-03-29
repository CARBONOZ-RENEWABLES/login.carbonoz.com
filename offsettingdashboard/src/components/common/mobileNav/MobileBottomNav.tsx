import { FC, ReactElement } from 'react'
import { Home, BarChart3, PieChart, Leaf, Zap } from 'lucide-react'
import { useMatch, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

interface NavItemProps {
  icon: React.ElementType
  url: string
}

const NavItem: FC<NavItemProps> = ({ icon: Icon, url }): ReactElement => {
  const navigate = useNavigate()
  const isMatch = useMatch(url)

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={() => navigate(url)}
      className='flex flex-col items-center justify-center flex-1 py-2'
    >
      <Icon
        size={24}
        strokeWidth={isMatch ? 2.5 : 2}
        style={{ color: isMatch ? '#DEAF0B' : '#6b7280' }}
      />
    </motion.button>
  )
}

const MobileBottomNav: FC = (): ReactElement => {
  return (
    <nav
      className='fixed bottom-0 left-0 right-0 lg:hidden z-50 border-t'
      style={{
        backgroundColor: '#1a1a1a',
        borderTopColor: '#2a2a2a',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className='flex items-center justify-around h-16'>
        <NavItem icon={Home} url='/ds/' />
        <NavItem icon={BarChart3} url='/ds/analytics' />
        <NavItem icon={PieChart} url='/ds/charts' />
        <NavItem icon={Leaf} url='/ds/carbon' />
        <NavItem icon={Zap} url='/ds/ai-charging' />
      </div>
    </nav>
  )
}

export default MobileBottomNav
