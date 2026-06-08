import { FC, ReactElement, useState, useEffect } from 'react';
import { Battery, Zap, TrendingUp, Clock, DollarSign, Activity } from 'lucide-react';
import { motion } from 'framer-motion';

const API_URL = import.meta.env.VITE_API_URL;

interface AiChargingDashboardProps {
  userId: string;
}

const AiChargingDashboard: FC<AiChargingDashboardProps> = ({ userId }): ReactElement => {
  const [chargingData, setChargingData] = useState<any>(null);

  useEffect(() => {
    const fetchChargingStatus = async () => {
      try {
        const response = await fetch(`${API_URL}/v1/ai-charging/status/${userId}`);
        const data = await response.json();
        setChargingData(data);
      } catch (error) {
        console.error('Error fetching charging status:', error);
      }
    };

    fetchChargingStatus();
    const interval = setInterval(fetchChargingStatus, 5000);
    return () => clearInterval(interval);
  }, [userId]);

  if (!chargingData) {
    return (
      <section className='w-[100%]'>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className='w-[100%] mb-8'
        >
          <div className='flex items-center gap-3 mb-2'>
            <div className='w-10 h-10 rounded-xl flex items-center justify-center' style={{ background: 'rgba(222,175,11,0.1)' }}>
              <Zap size={24} style={{ color: '#DEAF0B' }} />
            </div>
            <div>
              <h1 className='text-3xl font-bold tracking-tight' style={{ color: 'var(--text-primary)' }}>AI Charging</h1>
              <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Intelligent battery optimization</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className='border rounded-xl p-12 text-center'
          style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
        >
          <div className='w-20 h-20 rounded-xl flex items-center justify-center mx-auto mb-4' style={{ background: 'rgba(222,175,11,0.1)' }}>
            <Battery size={40} style={{ color: '#DEAF0B' }} />
          </div>
          <h3 className='text-xl font-bold mb-2' style={{ color: 'var(--text-primary)' }}>No AI Charging Data</h3>
          <p style={{ color: 'var(--text-secondary)' }}>Enable AI charging in your Desktop, Docker, or Home Assistant app</p>
        </motion.div>
      </section>
    );
  }

  const { status, mode, batteryLevel, targetSOC, lastCommandTime, lastCommandReason } = chargingData || {};
  const isCharging = status === 'charging' || status === 'active';
  const batteryPercentage = Math.min((batteryLevel / targetSOC) * 100, 100) || 0;

  return (
    <section className='w-[100%]'>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className='w-[100%] mb-8'
      >
        <div className='flex items-center justify-between mb-2'>
          <div className='flex items-center gap-3'>
            <div className='w-10 h-10 rounded-xl flex items-center justify-center' style={{ background: 'rgba(222,175,11,0.1)' }}>
              <Zap size={24} style={{ color: '#DEAF0B' }} />
            </div>
            <div>
              <h1 className='text-3xl font-bold tracking-tight' style={{ color: 'var(--text-primary)' }}>AI Charging</h1>
              <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Intelligent battery optimization in action</p>
            </div>
          </div>
          <motion.div
            whileHover={{ scale: 1.05 }}
            className={`px-4 py-2 rounded-lg font-semibold text-sm ${isCharging ? 'animate-pulse' : ''}`}
            style={{
              background: isCharging ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' : 'linear-gradient(135deg, #DEAF0B 0%, #c99d0a 100%)',
              color: '#ffffff',
              boxShadow: isCharging ? '0 2px 8px rgba(34,197,94,0.3)' : '0 2px 8px rgba(222,175,11,0.3)'
            }}
          >
            <div className='flex items-center gap-2'>
              <Activity size={16} />
              {isCharging ? 'Charging Active' : 'Monitoring'}
            </div>
          </motion.div>
        </div>
      </motion.div>

      <section className='grid 2xl:grid-cols-4 xl:grid-cols-4 lg:grid-cols-2 md:grid-cols-2 sm:grid-cols-2 grid-cols-1 mb-10 w-[100%] gap-4'>
        <ChargingCard
          icon={<Battery size={24} />}
          data={`${batteryLevel || 0}%`}
          title='Battery Level'
          subtitle={`Target: ${targetSOC || 80}%`}
          color='#3b82f6'
          progress={batteryPercentage}
        />
        <ChargingCard
          icon={<TrendingUp size={24} />}
          data={mode || 'monitoring'}
          title='Charging Mode'
          subtitle='AI-optimized strategy'
          color='#22c55e'
          capitalize
        />
        <ChargingCard
          icon={<Clock size={24} />}
          data={lastCommandTime ? new Date(lastCommandTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
          title='Last Command'
          subtitle={lastCommandTime ? new Date(lastCommandTime).toLocaleDateString() : 'No recent commands'}
          color='#a855f7'
        />
        <ChargingCard
          icon={<Zap size={24} />}
          data={lastCommandReason ? lastCommandReason.split('-')[0].trim() : 'Monitoring'}
          title='AI Decision'
          subtitle='Current strategy'
          color='#DEAF0B'
          smallText
        />
      </section>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className='mt-8 border rounded-xl overflow-hidden shadow-md transition-all duration-200 hover:shadow-lg'
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <div className='p-6 border-b border-l-4' style={{ borderBottomColor: 'var(--border)', borderLeftColor: '#DEAF0B' }}>
          <h2 className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>Last AI Command Details</h2>
          <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Real-time intelligent charging decision</p>
        </div>
        <div className='p-6'>
          <div className='p-4 rounded-lg border' style={{ background: 'rgba(222,175,11,0.05)', borderColor: 'rgba(222,175,11,0.2)' }}>
            <p className='text-sm font-semibold mb-2' style={{ color: 'var(--text-secondary)' }}>Reason:</p>
            <p className='text-base' style={{ color: 'var(--text-primary)' }}>{lastCommandReason || 'No recent commands'}</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className='mt-8 border rounded-xl overflow-hidden shadow-md transition-all duration-200 hover:shadow-lg'
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <div className='p-6 border-b border-l-4' style={{ borderBottomColor: 'var(--border)', borderLeftColor: '#DEAF0B' }}>
          <h2 className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>AI Insights & Optimization</h2>
          <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Real-time intelligent charging decisions</p>
        </div>
        <div className='p-6 grid grid-cols-1 md:grid-cols-3 gap-4'>
          <InsightCard
            title='Off-Peak Charging'
            description='Charging during lowest electricity rates to maximize savings'
            color='#3b82f6'
          />
          <InsightCard
            title='Solar Integration'
            description='Solar forecast integrated for optimal timing and efficiency'
            color='#22c55e'
          />
          <InsightCard
            title='Battery Health'
            description='Optimization enabled to extend battery lifespan'
            color='#a855f7'
          />
        </div>
      </motion.div>
    </section>
  );
};

const ChargingCard: FC<{
  icon: ReactElement;
  data: string;
  title: string;
  subtitle: string;
  color: string;
  progress?: number;
  capitalize?: boolean;
  smallText?: boolean;
}> = ({ icon, data, title, subtitle, color, progress, capitalize, smallText }) => {
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
      <div className='absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300' style={{ background: `linear-gradient(135deg, ${color}10 0%, transparent 100%)` }} />
      
      <div className='relative z-10 flex flex-col h-full justify-between'>
        <div className='flex items-start justify-between'>
          <motion.div
            whileHover={{ rotate: 360, scale: 1.1 }}
            transition={{ duration: 0.5 }}
            className='w-12 h-12 rounded-xl flex items-center justify-center border-2 transition-colors duration-200'
            style={{ 
              background: `${color}10`, 
              borderColor: `${color}20`,
              color: color
            }}
          >
            {icon}
          </motion.div>
        </div>

        <div>
          <motion.p
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className={`${smallText ? 'text-xl' : 'text-3xl'} font-bold mb-1 ${capitalize ? 'capitalize' : ''}`}
            style={{ color: 'var(--text-primary)' }}
          >
            {data}
          </motion.p>
          <p className='text-sm font-medium mb-1' style={{ color: 'var(--text-secondary)' }}>
            {title}
          </p>
          {progress !== undefined && (
            <div className='relative bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden mt-2'>
              <div 
                className='absolute top-0 left-0 h-full rounded-full transition-all duration-500'
                style={{ width: `${progress}%`, background: color }}
              />
            </div>
          )}
          <p className='text-xs mt-1' style={{ color: 'var(--text-muted)' }}>
            {subtitle}
          </p>
        </div>
      </div>
    </motion.div>
  );
};

const InsightCard: FC<{ title: string; description: string; color: string }> = ({ title, description, color }) => {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className='p-4 rounded-lg border transition-all duration-200'
      style={{ background: `${color}05`, borderColor: `${color}20` }}
    >
      <div className='flex items-start gap-3'>
        <div className='w-2 h-2 rounded-full mt-1.5 flex-shrink-0' style={{ background: color }} />
        <div>
          <p className='font-semibold mb-1' style={{ color: 'var(--text-primary)' }}>{title}</p>
          <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>{description}</p>
        </div>
      </div>
    </motion.div>
  );
};

export default AiChargingDashboard;
