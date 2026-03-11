/* eslint-disable @typescript-eslint/no-explicit-any */
import { Form, Select } from 'antd'
import { FC, ReactElement, useState } from 'react'
import { Download, Leaf } from 'lucide-react'
import { motion } from 'framer-motion'
import { GeneralContentLoader } from '../../common/loader/loader'
import CustomButton from '../../common/button/button'
import {
  useGetCarbonIntensityFor7DaysQuery,
  useGetCarbonIntensityFor30DaysQuery,
  useGetCarbonIntensityFor12MonthsQuery,
} from '../../../lib/api/carbonIntensity/carbonIntensityEndpoints'
import CarbonIntensityChart from '../charts/CarbonIntensityChart'

const { Option } = Select

interface CarbonIntensityProps {
  additionalData: any
}

const ZONES = [
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'ES', label: 'Spain' },
  { value: 'IT', label: 'Italy' },
  { value: 'NL', label: 'Netherlands' },
  { value: 'BE', label: 'Belgium' },
  { value: 'AT', label: 'Austria' },
  { value: 'CH', label: 'Switzerland' },
  { value: 'PL', label: 'Poland' },
]

const CarbonIntensity: FC<CarbonIntensityProps> = ({ additionalData }): ReactElement => {
  const [form] = Form.useForm()
  const [selectedZone, setSelectedZone] = useState<string>('DE')
  const timeZone = additionalData?.customerTimezone

  const { data: data7Days, isFetching: fetching7Days } = useGetCarbonIntensityFor7DaysQuery(
    { zone: selectedZone, timeZone }
  )
  const { data: data30Days, isFetching: fetching30Days } = useGetCarbonIntensityFor30DaysQuery(
    { zone: selectedZone, timeZone }
  )
  const { data: data12Months, isFetching: fetching12Months } = useGetCarbonIntensityFor12MonthsQuery(
    { zone: selectedZone, timeZone }
  )

  const loading = fetching7Days || fetching30Days || fetching12Months

  const onZoneChange = (value: string) => {
    setSelectedZone(value)
  }

  return (
    <section className='w-[100%]'>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className='w-[100%] mb-8'
      >
        <div className='flex items-center gap-3 mb-2'>
          <div className='w-10 h-10 rounded-xl flex items-center justify-center' style={{ background: 'rgba(34,197,94,0.1)' }}>
            <Leaf size={24} style={{ color: '#22c55e' }} />
          </div>
          <div>
            <h1 className='text-3xl font-bold tracking-tight' style={{ color: 'var(--text-primary)' }}>Carbon Intensity</h1>
            <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Monitor your carbon emissions and environmental impact</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className='mb-6 p-6 border rounded-xl'
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <Form form={form} layout='vertical'>
          <Form.Item label={<span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Select Zone</span>} name='zone'>
            <Select
              defaultValue={selectedZone}
              onChange={onZoneChange}
              size='large'
              style={{ width: '100%', maxWidth: '300px' }}
            >
              {ZONES.map(zone => (
                <Option key={zone.value} value={zone.value}>{zone.label}</Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </motion.div>

      <section className='grid 2xl:grid-cols-4 xl:grid-cols-4 lg:grid-cols-2 md:grid-cols-2 sm:grid-cols-2 grid-cols-1 mb-10 w-[100%] gap-4'>
        <CarbonCard
          data={data7Days?.data?.totalUnavoidableEmissions?.toFixed(2)}
          title='Unavoidable Emissions'
          unit='kg CO₂'
          loading={loading}
          color='#ef4444'
        />
        <CarbonCard
          data={data7Days?.data?.totalAvoidedEmissions?.toFixed(2)}
          title='Avoided Emissions'
          unit='kg CO₂'
          loading={loading}
          color='#22c55e'
        />
        <CarbonCard
          data={data7Days?.data?.avgCarbonIntensity?.toFixed(1)}
          title='Avg Carbon Intensity'
          unit='gCO₂/kWh'
          loading={loading}
          color='#DEAF0B'
        />
        <CarbonCard
          data={data7Days?.data?.selfSufficiencyScore?.toFixed(1)}
          title='Self-Sufficiency'
          unit='%'
          loading={loading}
          color='#3b82f6'
        />
      </section>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className='mt-8 border rounded-xl overflow-hidden shadow-md transition-all duration-200 hover:shadow-lg'
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <div className='p-6 border-b border-l-4' style={{ borderBottomColor: 'var(--border)', borderLeftColor: '#22c55e' }}>
          <h2 className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>Carbon Emissions Chart</h2>
          <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Last 7 days</p>
        </div>
        <div className='p-6'>
          {fetching7Days ? (
            <GeneralContentLoader />
          ) : (
            <CarbonIntensityChart data={data7Days?.data?.last7Days || []} dateFormat='DD/MM' />
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className='mt-8 border rounded-xl overflow-hidden shadow-md transition-all duration-200 hover:shadow-lg'
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <div className='flex justify-between items-center p-6 border-b border-l-4' style={{ borderBottomColor: 'var(--border)', borderLeftColor: '#22c55e' }}>
          <div>
            <h2 className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>Carbon Emissions Data</h2>
            <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Last 7 days</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {}}
            className='flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200'
            style={{
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              color: '#ffffff',
              boxShadow: '0 2px 8px rgba(34,197,94,0.3)'
            }}
          >
            <Download size={16} />
            <span>Download CSV</span>
          </motion.button>
        </div>
        <div className='p-6'>
          {fetching7Days ? (
            <GeneralContentLoader />
          ) : (
            <CarbonTable data={data7Days?.data?.last7Days || []} />
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className='mt-8 border rounded-xl overflow-hidden shadow-md transition-all duration-200 hover:shadow-lg'
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <div className='p-6 border-b border-l-4' style={{ borderBottomColor: 'var(--border)', borderLeftColor: '#22c55e' }}>
          <h2 className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>Carbon Emissions Chart</h2>
          <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Last 30 days</p>
        </div>
        <div className='p-6'>
          {fetching30Days ? (
            <GeneralContentLoader />
          ) : (
            <CarbonIntensityChart data={data30Days?.data?.last30Days || []} dateFormat='DD/MM' />
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className='mt-8 border rounded-xl overflow-hidden shadow-md transition-all duration-200 hover:shadow-lg'
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <div className='flex justify-between items-center p-6 border-b border-l-4' style={{ borderBottomColor: 'var(--border)', borderLeftColor: '#22c55e' }}>
          <div>
            <h2 className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>Carbon Emissions Data</h2>
            <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Last 30 days</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {}}
            className='flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200'
            style={{
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              color: '#ffffff',
              boxShadow: '0 2px 8px rgba(34,197,94,0.3)'
            }}
          >
            <Download size={16} />
            <span>Download CSV</span>
          </motion.button>
        </div>
        <div className='p-6'>
          {fetching30Days ? (
            <GeneralContentLoader />
          ) : (
            <CarbonTable data={data30Days?.data?.last30Days || []} />
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className='mt-8 border rounded-xl overflow-hidden shadow-md transition-all duration-200 hover:shadow-lg'
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <div className='p-6 border-b border-l-4' style={{ borderBottomColor: 'var(--border)', borderLeftColor: '#22c55e' }}>
          <h2 className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>Carbon Emissions Chart</h2>
          <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Last 12 months</p>
        </div>
        <div className='p-6'>
          {fetching12Months ? (
            <GeneralContentLoader />
          ) : (
            <CarbonIntensityChart data={data12Months?.data?.last12Months || []} dateFormat='MMM YY' />
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className='mt-8 border rounded-xl overflow-hidden shadow-md transition-all duration-200 hover:shadow-lg'
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <div className='flex justify-between items-center p-6 border-b border-l-4' style={{ borderBottomColor: 'var(--border)', borderLeftColor: '#22c55e' }}>
          <div>
            <h2 className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>Carbon Emissions Data</h2>
            <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Last 12 months</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {}}
            className='flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200'
            style={{
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              color: '#ffffff',
              boxShadow: '0 2px 8px rgba(34,197,94,0.3)'
            }}
          >
            <Download size={16} />
            <span>Download CSV</span>
          </motion.button>
        </div>
        <div className='p-6'>
          {fetching12Months ? (
            <GeneralContentLoader />
          ) : (
            <CarbonTable data={data12Months?.data?.last12Months || []} />
          )}
        </div>
      </motion.div>
    </section>
  )
}

const CarbonCard: FC<{ data: string | undefined, title: string, unit: string, loading: boolean, color: string }> = ({ data, title, unit, loading, color }) => {
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
      
      {loading ? (
        <GeneralContentLoader height='10px' />
      ) : (
        <div className='relative z-10 flex flex-col h-full justify-between'>
          <div className='flex items-start justify-between'>
            <motion.div
              whileHover={{ rotate: 360, scale: 1.1 }}
              transition={{ duration: 0.5 }}
              className='w-12 h-12 rounded-xl flex items-center justify-center border-2 transition-colors duration-200'
              style={{ 
                background: `${color}10`, 
                borderColor: `${color}20` 
              }}
            >
              <Leaf size={24} style={{ color }} strokeWidth={2.5} />
            </motion.div>
          </div>

          <div>
            <motion.p
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className='text-3xl font-bold mb-1 flex items-baseline gap-2'
              style={{ color: 'var(--text-primary)' }}
            >
              {data || '0'}
              <span className='text-lg font-semibold' style={{ color: 'var(--text-secondary)' }}>{unit}</span>
            </motion.p>
            <p className='text-sm font-medium' style={{ color: 'var(--text-secondary)' }}>
              {title}
            </p>
          </div>
        </div>
      )}
    </motion.div>
  )
}

const CarbonTable: FC<{ data: any[] }> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className='text-center py-8' style={{ color: 'var(--text-secondary)' }}>
        No data available
      </div>
    )
  }

  // Sort data by date, newest first
  const sortedData = [...data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <div className='overflow-x-auto'>
      <table className='w-full'>
        <thead>
          <tr className='border-b' style={{ borderColor: 'var(--border)' }}>
            <th className='text-left p-3 text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>Date</th>
            <th className='text-right p-3 text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>Carbon Intensity</th>
            <th className='text-right p-3 text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>Grid Energy</th>
            <th className='text-right p-3 text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>Solar Energy</th>
            <th className='text-right p-3 text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>Unavoidable</th>
            <th className='text-right p-3 text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>Avoided</th>
            <th className='text-right p-3 text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>Self-Sufficiency</th>
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, index) => (
            <tr key={index} className='border-b hover:bg-opacity-50 transition-colors' style={{ borderColor: 'var(--border)' }}>
              <td className='p-3 text-sm' style={{ color: 'var(--text-primary)' }}>{row.date}</td>
              <td className='p-3 text-sm text-right' style={{ color: 'var(--text-secondary)' }}>{row.carbonIntensity} gCO₂/kWh</td>
              <td className='p-3 text-sm text-right' style={{ color: 'var(--text-secondary)' }}>{row.gridEnergy} kWh</td>
              <td className='p-3 text-sm text-right' style={{ color: 'var(--text-secondary)' }}>{row.solarEnergy} kWh</td>
              <td className='p-3 text-sm text-right' style={{ color: '#ef4444' }}>{row.unavoidableEmissions} kg</td>
              <td className='p-3 text-sm text-right' style={{ color: '#22c55e' }}>{row.avoidedEmissions} kg</td>
              <td className='p-3 text-sm text-right' style={{ color: '#3b82f6' }}>{row.selfSufficiencyScore}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default CarbonIntensity
