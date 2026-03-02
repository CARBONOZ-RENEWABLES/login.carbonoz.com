/* eslint-disable @typescript-eslint/no-explicit-any */
import { Col, Form, Row } from 'antd'
import { FC, ReactElement, useEffect, useState } from 'react'
import { BarChart3, Calendar } from 'lucide-react'
import { motion } from 'framer-motion'
import {
  useGetEnergyFor12MonthsQuery,
  useGetEnergyFor30DaysQuery,
  useGetEnergyQuery,
} from '../../../lib/api/Analytics/analyticsEndpoints'
import CustomInput from '../../common/input/customInput'
import { GeneralContentLoader } from '../../common/loader/loader'
import Last12MonthGraph from './12months/PastTwelveMonth'
import Last30DaysGraph from './30days/PastThirtyDays'
import Last7DaysGraph from './7days/PastSevenDays'

const EnergyChart: FC = (): ReactElement => {
  const [from, setFrom] = useState()
  const [to, setTo] = useState()

  const { data, isFetching, refetch } = useGetEnergyQuery(
    from && to ? { from, to } : {}
  )
  const {
    data: monthlyData,
    isFetching: fetching,
    refetch: refechMonthly,
  } = useGetEnergyFor30DaysQuery(from && to ? { from, to } : {})

  const {
    data: yearlyData,
    isFetching: yearlyFetching,
    refetch: yearlyRefetch,
  } = useGetEnergyFor12MonthsQuery({})

  useEffect(() => {
    refetch()
    refechMonthly()
    yearlyRefetch()
  }, [refetch, refechMonthly, yearlyRefetch])

  function onChangeFromDate(e: any) {
    setFrom(e)
  }
  function onChangeToDate(e: any) {
    setTo(e)
  }

  const [form] = Form.useForm()

  return (
    <section className='w-[100%]'>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className='flex items-center gap-4 mb-8'>
        <div className='w-12 h-12 rounded-xl flex items-center justify-center' style={{ background: 'rgba(222,175,11,0.1)' }}>
          <BarChart3 size={24} style={{ color: '#DEAF0B' }} />
        </div>
        <div>
          <h1 className='text-3xl font-bold tracking-tight' style={{ color: 'var(--text-primary)' }}>Energy Charts</h1>
          <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Visualize your energy consumption trends</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className='mb-8 p-6 rounded-xl border'
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <div className='flex items-center gap-3 mb-4'>
          <Calendar size={20} style={{ color: '#DEAF0B' }} />
          <h3 className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>Date Range Filter</h3>
        </div>
        <Form className='space-y-12' name='user-info-form' form={form}>
          <Row className='w-[100%] flex flex-row gap-5'>
            <Col className='gutter-row lg:w-[25%] w-[100%]'>
              <CustomInput
                placeholder='From'
                label='From'
                inputType='date'
                name='from'
                onChange={onChangeFromDate}
              />
            </Col>
            <Col className='gutter-row lg:w-[25%] w-[100%]'>
              <CustomInput
                placeholder='To'
                label='To'
                inputType='date'
                name='to'
                onChange={onChangeToDate}
              />
            </Col>
          </Row>
        </Form>
      </motion.div>

      {isFetching || fetching || yearlyFetching ? (
        <GeneralContentLoader />
      ) : (
        <section className='flex flex-col gap-8'>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className='rounded-xl border overflow-hidden shadow-md'
            style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
          >
            <div className='p-6 border-b border-l-4' style={{ borderBottomColor: 'var(--border)', borderLeftColor: '#DEAF0B' }}>
              <h2 className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>Last 7 Days</h2>
              <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Daily energy consumption</p>
            </div>
            <div className='p-6'>
              <Last7DaysGraph data={data?.data || []} />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className='rounded-xl border overflow-hidden shadow-md'
            style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
          >
            <div className='p-6 border-b border-l-4' style={{ borderBottomColor: 'var(--border)', borderLeftColor: '#DEAF0B' }}>
              <h2 className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>Last 30 Days</h2>
              <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Monthly energy consumption</p>
            </div>
            <div className='p-6'>
              <Last30DaysGraph data={monthlyData?.data || []} />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className='rounded-xl border overflow-hidden shadow-md'
            style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
          >
            <div className='p-6 border-b border-l-4' style={{ borderBottomColor: 'var(--border)', borderLeftColor: '#DEAF0B' }}>
              <h2 className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>Last 12 Months</h2>
              <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Yearly energy consumption</p>
            </div>
            <div className='p-6'>
              <Last12MonthGraph data={yearlyData?.data || []} />
            </div>
          </motion.div>
        </section>
      )}
    </section>
  )
}

export default EnergyChart
