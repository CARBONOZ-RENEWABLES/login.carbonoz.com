import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { FC, ReactElement } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { energyInt } from '../../../../lib/api/Analytics/analyticsEndpoints'

dayjs.extend(utc)
dayjs.extend(timezone)

interface Props {
  data: Array<energyInt>
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className='border rounded-xl p-4 shadow-xl backdrop-blur-xl' style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}>
        <p className='text-sm font-semibold mb-2' style={{ color: 'var(--text-primary)' }}>{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className='text-xs flex items-center gap-2' style={{ color: 'var(--text-secondary)' }}>
            <span className='w-3 h-3 rounded-full' style={{ backgroundColor: entry.color }} />
            <span className='font-medium'>{entry.name}:</span>
            <span className='font-semibold' style={{ color: 'var(--text-primary)' }}>{entry.value.toFixed(2)}</span>
          </p>
        ))}
      </div>
    )
  }
  return null
}

const Last7DaysGraph: FC<Props> = ({ data }): ReactElement => {
  const timeZone = 'Indian/Mauritius'

  const formattedData = data.map((item) => ({
    date: dayjs(item.date).tz(timeZone).format('DD/MM/YYYY'),
    loadPower: parseFloat(item.loadPower),
    pvPower: parseFloat(item.pvPower),
    gridIn: parseFloat(item.gridIn),
    gridOut: parseFloat(item.gridOut),
    batteryCharged: parseFloat(item.batteryCharged),
    batteryDischarged: parseFloat(item.batteryDischarged),
  }))

  return (
    <ResponsiveContainer width='100%' height={400}>
      <LineChart data={formattedData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id='colorLoadPower' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='5%' stopColor='#DEAF0B' stopOpacity={0.3} />
            <stop offset='95%' stopColor='#DEAF0B' stopOpacity={0} />
          </linearGradient>
          <linearGradient id='colorPvPower' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='5%' stopColor='#10B981' stopOpacity={0.3} />
            <stop offset='95%' stopColor='#10B981' stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray='3 3' stroke='rgba(222, 175, 11, 0.08)' vertical={false} />
        <XAxis
          dataKey='date'
          stroke='var(--text-muted)'
          style={{ fontSize: '12px', fontFamily: 'Inter' }}
          tickLine={false}
          axisLine={{ stroke: 'rgba(222, 175, 11, 0.2)' }}
        />
        <YAxis
          stroke='var(--text-muted)'
          style={{ fontSize: '12px', fontFamily: 'Inter' }}
          tickLine={false}
          axisLine={{ stroke: 'rgba(222, 175, 11, 0.2)' }}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#DEAF0B', strokeWidth: 1, strokeDasharray: '5 5' }} />
        <Legend
          wrapperStyle={{ fontSize: '12px', fontFamily: 'Inter', paddingTop: '20px' }}
          iconType='circle'
        />
        <Line
          type='monotone'
          dataKey='loadPower'
          stroke='#DEAF0B'
          strokeWidth={3}
          dot={{ fill: '#DEAF0B', r: 4 }}
          activeDot={{ r: 6, fill: '#DEAF0B', stroke: '#fff', strokeWidth: 2 }}
          fill='url(#colorLoadPower)'
        />
        <Line
          type='monotone'
          dataKey='pvPower'
          stroke='#10B981'
          strokeWidth={2.5}
          dot={{ fill: '#10B981', r: 3 }}
          activeDot={{ r: 5, fill: '#10B981', stroke: '#fff', strokeWidth: 2 }}
          fill='url(#colorPvPower)'
        />
        <Line
          type='monotone'
          dataKey='gridIn'
          stroke='#F59E0B'
          strokeWidth={2}
          dot={{ fill: '#F59E0B', r: 3 }}
          activeDot={{ r: 5 }}
        />
        <Line
          type='monotone'
          dataKey='gridOut'
          stroke='#EF4444'
          strokeWidth={2}
          dot={{ fill: '#EF4444', r: 3 }}
          activeDot={{ r: 5 }}
        />
        <Line
          type='monotone'
          dataKey='batteryCharged'
          stroke='#3B82F6'
          strokeWidth={2}
          dot={{ fill: '#3B82F6', r: 3 }}
          activeDot={{ r: 5 }}
        />
        <Line
          type='monotone'
          dataKey='batteryDischarged'
          stroke='#8B5CF6'
          strokeWidth={2}
          dot={{ fill: '#8B5CF6', r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export default Last7DaysGraph
