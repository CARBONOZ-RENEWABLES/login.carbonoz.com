/* eslint-disable @typescript-eslint/no-explicit-any */
import { Form } from 'antd'
import { FC, ReactElement, useEffect, useState } from 'react'
import { Download, BarChart3 } from 'lucide-react'
import { motion } from 'framer-motion'
import handleAPIRequests from '../../../helpers/handleApiRequest'
import { handleFileDownload } from '../../../helpers/handleFileDownload'
import {
  csvfileFormat,
  energyInt,
  useDownloadCSVMutation,
  useGetEnergyFor12MonthsQuery,
  useGetEnergyFor30DaysQuery,
  useGetEnergyForLast10YearsQuery,
  useGetEnergyQuery,
} from '../../../lib/api/Analytics/analyticsEndpoints'
import CustomButton from '../../common/button/button'
import FilterTimeZones from '../../forms/filterTimezone'
import EnergyTable from '../../tables/energyTable'
import AnalyticsCard from '../common/cards/card'
import { AdditionalInfoInt } from '../../../lib/api/user/userEndPoints'
import Last7DaysGraph from '../charts/7days/PastSevenDays'
import Last30DaysGraph from '../charts/30days/PastThirtyDays'
import Last12MonthGraph from '../charts/12months/PastTwelveMonth'

interface CustomInputProps {
  Timezone: string
}

interface AnalyticsProps {
  additionalData: AdditionalInfoInt | undefined
}

const Analytics: FC<AnalyticsProps> = ({ additionalData }): ReactElement => {
  const [form] = Form.useForm()
  const [timeZone, setTimeZone] = useState<string | null>(null)
  const { data, isFetching, refetch } = useGetEnergyQuery(
    timeZone ? { timeZone } : {}
  )
  const [downloadingPeriod, setDownloadingPeriod] = useState<number | null>(
    null
  )
  const [downloadCsv, { isLoading }] = useDownloadCSVMutation()
  const {
    data: monthlyData,
    isFetching: fetching,
    refetch: refechMonthly,
  } = useGetEnergyFor30DaysQuery(timeZone ? { timeZone } : {})

  const {
    data: yearlyData,
    isFetching: yearlyFetching,
    refetch: yearlyRefetch,
  } = useGetEnergyFor12MonthsQuery(timeZone ? { timeZone } : {})

  const {
    data: decadeData,
    isFetching: decadeFetching,
    refetch: decadeRefetch,
  } = useGetEnergyForLast10YearsQuery()

  const pastThirtyDays = monthlyData ? [...monthlyData.data].reverse() : []

  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    refetch()
    refechMonthly()
    yearlyRefetch()
    decadeRefetch()
  }, [refetch, refechMonthly, yearlyRefetch, decadeRefetch])

  const paginationConfig = {
    current: currentPage,
    pageSize: pageSize,
    total: monthlyData?.data?.length || 0,
    onChange: (page: number, pageSize?: number) => {
      setCurrentPage(page)
      if (pageSize) {
        setPageSize(pageSize)
      }
    },
  }

  const calculateTotalLoadPower = (data: Array<energyInt> | undefined) =>
    data?.reduce((total, item) => {
      const loadPowerValue = parseFloat(item.loadPower.replace(/[^0-9.]/g, ''))
      return total + (isNaN(loadPowerValue) ? 0 : loadPowerValue)
    }, 0)

  const totalLoadPower = calculateTotalLoadPower(data?.data)
  const totalLoadPower30 = calculateTotalLoadPower(monthlyData?.data)
  const totalLoadPowerMonthly = calculateTotalLoadPower(yearlyData?.data)

  const onDownload = (period: number) => {
    setDownloadingPeriod(period)
    const obj: csvfileFormat = { date: period }

    handleAPIRequests({
      request: downloadCsv,
      ...obj,
      notify: true,
      onSuccess: (file: Blob) => {
        const fileNames = {
          7: 'CSV-report-for-last-7-days',
          30: 'CSV-report-for-last-30-days',
          12: 'CSV-report-for-last-12-months',
        }
        handleFileDownload({
          name: fileNames[period as keyof typeof fileNames],
          file,
        })
      },
    })
  }

  const onFinish = (value: CustomInputProps) => {
    setTimeZone(value.Timezone)
  }

  const defaultTimeZone = additionalData?.customerTimezone

  return (
    <section className='w-[100%]'>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className='w-[100%] mb-8'
      >
        <div className='flex items-center gap-3 mb-2'>
          <div className='w-10 h-10 rounded-xl flex items-center justify-center' style={{ background: 'rgba(222,175,11,0.1)' }}>
            <BarChart3 size={24} style={{ color: '#DEAF0B' }} />
          </div>
          <div>
            <h1 className='text-3xl font-bold tracking-tight' style={{ color: 'var(--text-primary)' }}>Analytics</h1>
            <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Monitor your energy consumption and performance metrics</p>
          </div>
        </div>
      </motion.div>

      <section className='grid 2xl:grid-cols-3 xl:grid-cols-3 lg:grid-cols-2 md:grid-cols-2 sm:grid-cols-2 grid-cols-1 mb-10 w-[100%] gap-4'>
        <AnalyticsCard
          data={totalLoadPower?.toFixed(1)}
          title='For past 7 days'
          loading={isFetching || fetching || yearlyFetching || decadeFetching}
        />
        <AnalyticsCard
          data={totalLoadPower30?.toFixed(1)}
          title='For past 30 days'
          loading={isFetching || fetching || yearlyFetching || decadeFetching}
        />
        <AnalyticsCard
          data={totalLoadPowerMonthly?.toFixed(1)}
          title='For past 12 months'
          loading={isFetching || fetching || yearlyFetching || decadeFetching}
        />
      </section>

      <div className='w-full mb-6'>
        <FilterTimeZones
          form={form}
          onFinish={onFinish}
          defaultTimeZone={defaultTimeZone}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className='mt-8 border rounded-xl overflow-hidden shadow-md transition-all duration-200 hover:shadow-lg'
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <div className='p-6 border-b border-l-4' style={{ borderBottomColor: 'var(--border)', borderLeftColor: '#DEAF0B' }}>
          <h2 className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>Energy Chart</h2>
          <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Last 7 days</p>
        </div>
        <div className='p-6'>
          <Last7DaysGraph data={data?.data || []} />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className='mt-8 border rounded-xl overflow-hidden shadow-md transition-all duration-200 hover:shadow-lg'
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <div className='flex justify-between items-center p-6 border-b border-l-4' style={{ borderBottomColor: 'var(--border)', borderLeftColor: '#DEAF0B' }}>
          <div>
            <h2 className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>Energy Data Table</h2>
            <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Last 7 days</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onDownload(7)}
            disabled={isLoading && downloadingPeriod === 7}
            className='flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'
            style={{
              background: 'linear-gradient(135deg, #DEAF0B 0%, #c99d0a 100%)',
              color: '#ffffff',
              boxShadow: '0 2px 8px rgba(222,175,11,0.3)'
            }}
          >
            {isLoading && downloadingPeriod === 7 ? (
              <>
                <div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin' />
                <span>Downloading...</span>
              </>
            ) : (
              <>
                <Download size={16} />
                <span>Download CSV</span>
              </>
            )}
          </motion.button>
        </div>
        <div className='p-6'>
          <EnergyTable
            data={pastThirtyDays.slice(0, 7)}
            isFetching={isFetching}
          />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className='mt-8 border rounded-xl overflow-hidden shadow-md transition-all duration-200 hover:shadow-lg'
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <div className='p-6 border-b border-l-4' style={{ borderBottomColor: 'var(--border)', borderLeftColor: '#DEAF0B' }}>
          <h2 className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>Energy Chart</h2>
          <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Last 30 days</p>
        </div>
        <div className='p-6'>
          <Last30DaysGraph data={monthlyData?.data || []} />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className='mt-8 border rounded-xl overflow-hidden shadow-md transition-all duration-200 hover:shadow-lg'
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <div className='flex justify-between items-center p-6 border-b border-l-4' style={{ borderBottomColor: 'var(--border)', borderLeftColor: '#DEAF0B' }}>
          <div>
            <h2 className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>Energy Data Table</h2>
            <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Last 30 days</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onDownload(30)}
            disabled={isLoading && downloadingPeriod === 30}
            className='flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'
            style={{
              background: 'linear-gradient(135deg, #DEAF0B 0%, #c99d0a 100%)',
              color: '#ffffff',
              boxShadow: '0 2px 8px rgba(222,175,11,0.3)'
            }}
          >
            {isLoading && downloadingPeriod === 30 ? (
              <>
                <div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin' />
                <span>Downloading...</span>
              </>
            ) : (
              <>
                <Download size={16} />
                <span>Download CSV</span>
              </>
            )}
          </motion.button>
        </div>
        <div className='p-6'>
          <EnergyTable
            data={pastThirtyDays}
            isFetching={isFetching}
            type='monthly'
            pagination={paginationConfig}
          />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className='mt-8 border rounded-xl overflow-hidden shadow-md transition-all duration-200 hover:shadow-lg'
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <div className='p-6 border-b border-l-4' style={{ borderBottomColor: 'var(--border)', borderLeftColor: '#DEAF0B' }}>
          <h2 className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>Energy Chart</h2>
          <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Last 12 months</p>
        </div>
        <div className='p-6'>
          <Last12MonthGraph data={yearlyData?.data || []} />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className='mt-8 border rounded-xl overflow-hidden shadow-md transition-all duration-200 hover:shadow-lg'
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <div className='flex justify-between items-center p-6 border-b border-l-4' style={{ borderBottomColor: 'var(--border)', borderLeftColor: '#DEAF0B' }}>
          <div>
            <h2 className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>Energy Data Table</h2>
            <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Last 12 months</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onDownload(12)}
            disabled={isLoading && downloadingPeriod === 12}
            className='flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'
            style={{
              background: 'linear-gradient(135deg, #DEAF0B 0%, #c99d0a 100%)',
              color: '#ffffff',
              boxShadow: '0 2px 8px rgba(222,175,11,0.3)'
            }}
          >
            {isLoading && downloadingPeriod === 12 ? (
              <>
                <div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin' />
                <span>Downloading...</span>
              </>
            ) : (
              <>
                <Download size={16} />
                <span>Download CSV</span>
              </>
            )}
          </motion.button>
        </div>
        <div className='p-6'>
          <EnergyTable
            data={yearlyData?.data}
            isFetching={isFetching}
            type='yearly'
          />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className='mt-8 border rounded-xl overflow-hidden shadow-md transition-all duration-200 hover:shadow-lg'
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <div className='flex justify-between items-center p-6 border-b border-l-4' style={{ borderBottomColor: 'var(--border)', borderLeftColor: '#DEAF0B' }}>
          <div>
            <h2 className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>Energy Data Table</h2>
            <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Last 10 years</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            disabled={true}
            className='flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 opacity-40 cursor-not-allowed'
            style={{
              background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
              color: '#ffffff'
            }}
          >
            <Download size={16} />
            <span>Not Available</span>
          </motion.button>
        </div>
        <div className='p-6'>
          <EnergyTable
            data={decadeData?.data}
            isFetching={isFetching}
            type='decade'
          />
        </div>
      </motion.div>
    </section>
  )
}

export default Analytics
