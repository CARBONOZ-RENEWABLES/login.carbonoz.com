import { FC, ReactElement, useState } from 'react'
import { Copy, Eye, EyeOff, Key, Settings as SettingsIcon, CheckCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import { useGetTopicsQuery } from '../../../lib/api/topic/topicEndpints'
import { useGetCredentialsQuery } from '../../../lib/api/user/userEndPoints'
import { GeneralContentLoader } from '../../common/loader/loader'
import Notify from '../../common/notification/notification'

const Settings: FC = (): ReactElement => {
  const { data, isFetching } = useGetTopicsQuery()
  const { data: credentials, isFetching: fetching } = useGetCredentialsQuery()
  const [showClientSecret, setShowClientSecret] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const handleCopy = (text: string, type: string) => {
    navigator?.clipboard?.writeText(text)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
    Notify({
      message: 'Success',
      description: 'Copied to clipboard',
      type: 'success',
    })
  }

  if (isFetching || fetching) return <GeneralContentLoader />

  return (
    <div className='space-y-6'>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className='flex items-center gap-4'>
        <div className='w-12 h-12 rounded-xl flex items-center justify-center' style={{ background: 'rgba(222,175,11,0.1)' }}>
          <SettingsIcon size={24} style={{ color: '#DEAF0B' }} />
        </div>
        <div>
          <h1 className='text-3xl font-bold tracking-tight' style={{ color: 'var(--text-primary)' }}>Settings</h1>
          <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Manage your application configuration</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className='rounded-xl border overflow-hidden shadow-md transition-all duration-200'
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <div className='p-6 border-b border-l-4' style={{ borderBottomColor: 'var(--border)', borderLeftColor: '#DEAF0B' }}>
          <h2 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>Topic Configuration</h2>
          <p className='text-sm mt-1' style={{ color: 'var(--text-secondary)' }}>MQTT topic settings</p>
        </div>
        <div className='p-6'>
          <div className='flex items-center justify-between p-4 rounded-xl' style={{ background: 'var(--surface-overlay)' }}>
            <div>
              <p className='text-xs font-semibold uppercase tracking-wider mb-1' style={{ color: 'var(--text-muted)' }}>Topic Name</p>
              <p className='text-sm font-semibold font-mono' style={{ color: 'var(--text-primary)' }}>{data?.data?.topicName}</p>
            </div>
            <div className='w-10 h-10 rounded-xl flex items-center justify-center' style={{ background: 'rgba(222,175,11,0.1)' }}>
              <CheckCircle size={20} style={{ color: '#DEAF0B' }} />
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className='rounded-xl border overflow-hidden shadow-md'
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <div className='p-6 border-b border-l-4' style={{ borderBottomColor: 'var(--border)', borderLeftColor: '#DEAF0B' }}>
          <div className='flex items-center gap-3'>
            <div className='w-10 h-10 rounded-xl flex items-center justify-center' style={{ background: 'rgba(222,175,11,0.2)' }}>
              <Key size={20} style={{ color: '#DEAF0B' }} />
            </div>
            <div>
              <h2 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>API Credentials</h2>
              <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Secure access keys for API integration</p>
            </div>
          </div>
        </div>
        <div className='p-6 space-y-4'>
          <div className='p-5 rounded-xl border' style={{ background: 'var(--surface-overlay)', borderColor: 'var(--border)' }}>
            <div className='flex items-center justify-between mb-3'>
              <div className='flex items-center gap-2'>
                <div className='w-2 h-2 rounded-full animate-pulse' style={{ background: '#DEAF0B' }} />
                <p className='text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>Client ID</p>
              </div>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => handleCopy(credentials?.data?.clientId || '', 'clientId')}
                className='p-2 rounded-lg transition-colors duration-200'
                style={{ background: copied === 'clientId' ? 'rgba(222,175,11,0.1)' : 'transparent' }}
              >
                {copied === 'clientId' ? (
                  <CheckCircle size={18} style={{ color: '#DEAF0B' }} />
                ) : (
                  <Copy size={18} style={{ color: '#DEAF0B' }} />
                )}
              </motion.button>
            </div>
            <p className='text-sm font-mono break-all p-3 rounded-lg' style={{ color: 'var(--text-primary)', background: 'var(--surface-base)' }}>
              {credentials?.data?.clientId}
            </p>
          </div>

          <div className='p-5 rounded-xl border' style={{ background: 'var(--surface-overlay)', borderColor: 'var(--border)' }}>
            <div className='flex items-center justify-between mb-3'>
              <div className='flex items-center gap-2'>
                <div className='w-2 h-2 rounded-full animate-pulse' style={{ background: '#DEAF0B' }} />
                <p className='text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>Client Secret</p>
              </div>
              <div className='flex items-center gap-2'>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowClientSecret(!showClientSecret)}
                  className='p-2 rounded-lg transition-colors duration-200'
                >
                  {showClientSecret ? (
                    <EyeOff size={18} style={{ color: '#DEAF0B' }} />
                  ) : (
                    <Eye size={18} style={{ color: '#DEAF0B' }} />
                  )}
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => handleCopy(credentials?.data?.clientSecret || '', 'clientSecret')}
                  className='p-2 rounded-lg transition-colors duration-200'
                  style={{ background: copied === 'clientSecret' ? 'rgba(222,175,11,0.1)' : 'transparent' }}
                >
                  {copied === 'clientSecret' ? (
                    <CheckCircle size={18} style={{ color: '#DEAF0B' }} />
                  ) : (
                    <Copy size={18} style={{ color: '#DEAF0B' }} />
                  )}
                </motion.button>
              </div>
            </div>
            <p className='text-sm font-mono break-all p-3 rounded-lg' style={{ color: 'var(--text-primary)', background: 'var(--surface-base)' }}>
              {showClientSecret
                ? credentials?.data?.clientSecret
                : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default Settings
