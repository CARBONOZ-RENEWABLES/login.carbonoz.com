import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { FC, ReactElement } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { energyInt } from '../../../lib/api/Analytics/analyticsEndpoints'

dayjs.extend(utc)
dayjs.extend(timezone)

interface Props {
  data: Array<energyInt>
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className='border rounded-xl p-4 shadow-2xl backdrop-blur-xl' style={{ background: 'rgba(255, 255, 255, 0.98)', borderColor: '#e5e7eb' }}>
        <p className='text-sm font-bold mb-3 pb-2 border-b' style={{ color: '#111827' }}>{label}</p>
        <div className='space-y-2'>
          {payload.map((entry: any, index: number) => (
            <div key={index} className='flex items-center justify-between gap-4'>
              <div className='flex items-center gap-2'>
                <span className='w-3 h-3 rounded-full' style={{ backgroundColor: entry.color }} />
                <span className='text-xs font-medium text-gray-600'>{entry.name}:</span>
              </div>
              <span className='text-xs font-bold' style={{ color: entry.color }}>{entry.value.toFixed(2)} kWh</span>
            </div>
          ))}
        </div>
      </div>
    )
  }
  return null
}

const AdvancedAreaChart: FC<Props> = ({ data }): ReactElement => {
  const timeZone = 'Indian/Mauritius'

  const formattedData = data.map((item) => ({
    date: dayjs(item.date).tz(timeZone).format('DD/MM'),
    loadPower: parseFloat(item.loadPower),
    pvPower: parseFloat(item.pvPower),
    gridIn: parseFloat(item.gridIn),
    gridOut: parseFloat(item.gridOut),
    batteryCharged: parseFloat(item.batteryCharged),
    batteryDischarged: parseFloat(item.batteryDischarged),
  }))

  return (
    <ResponsiveContainer width='100%' height={450}>
      <AreaChart data={formattedData} margin={{ top: 20, right: 30, left: 0, bottom: 10 }}>
        <defs>
          <linearGradient id='gradientLoad' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='5%' stopColor='#EF4444' stopOpacity={0.4} />
            <stop offset='95%' stopColor='#EF4444' stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id='gradientPv' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='5%' stopColor='#FBBF24' stopOpacity={0.4} />
            <stop offset='95%' stopColor='#FBBF24' stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id='gradientGridIn' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='5%' stopColor='#3B82F6' stopOpacity={0.4} />
            <stop offset='95%' stopColor='#3B82F6' stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id='gradientGridOut' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='5%' stopColor='#10B981' stopOpacity={0.4} />
            <stop offset='95%' stopColor='#10B981' stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray='3 3' stroke='#e5e7eb' strokeOpacity={0.5} vertical={false} />
        <XAxis
          dataKey='date'
          stroke='#6b7280'
          style={{ fontSize: '11px', fontFamily: 'Inter, system-ui', fontWeight: 500 }}
          tickLine={false}
          axisLine={{ stroke: '#d1d5db', strokeWidth: 1 }}
          tick={{ fill: '#6b7280' }}
        />
        <YAxis
          stroke='#6b7280'
          style={{ fontSize: '11px', fontFamily: 'Inter, system-ui', fontWeight: 500 }}
          tickLine={false}
          axisLine={{ stroke: '#d1d5db', strokeWidth: 1 }}
          tick={{ fill: '#6b7280' }}
          label={{ value: 'kWh', angle: -90, position: 'insideLeft', style: { fill: '#6b7280', fontSize: 12 } }}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#DEAF0B', strokeWidth: 2, strokeDasharray: '5 5' }} />
        <Legend
          wrapperStyle={{ 
            fontSize: '12px', 
            fontFamily: 'Inter, system-ui', 
            paddingTop: '25px',
            fontWeight: 500
          }}
          iconType='circle'
          iconSize={10}
        />
        <Area
          type='monotone'
          dataKey='loadPower'
          stroke='#EF4444'
          strokeWidth={2.5}
          fill='url(#gradientLoad)'
          dot={false}
          activeDot={{ r: 6, fill: '#EF4444', stroke: '#fff', strokeWidth: 3 }}
          name='Load Power'
        />
        <Area
          type='monotone'
          dataKey='pvPower'
          stroke='#FBBF24'
          strokeWidth={2.5}
          fill='url(#gradientPv)'
          dot={false}
          activeDot={{ r: 6, fill: '#FBBF24', stroke: '#fff', strokeWidth: 3 }}
          name='PV Power'
        />
        <Area
          type='monotone'
          dataKey='gridIn'
          stroke='#3B82F6'
          strokeWidth={2}
          fill='url(#gradientGridIn)'
          dot={false}
          activeDot={{ r: 5, fill: '#3B82F6', stroke: '#fff', strokeWidth: 2 }}
          name='Grid In'
        />
        <Area
          type='monotone'
          dataKey='gridOut'
          stroke='#10B981'
          strokeWidth={2}
          fill='url(#gradientGridOut)'
          dot={false}
          activeDot={{ r: 5, fill: '#10B981', stroke: '#fff', strokeWidth: 2 }}
          name='Grid Out'
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export default AdvancedAreaChart
