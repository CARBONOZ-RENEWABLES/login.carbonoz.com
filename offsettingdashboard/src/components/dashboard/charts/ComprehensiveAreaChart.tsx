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
  dateFormat?: string
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

const ComprehensiveAreaChart: FC<Props> = ({ data, dateFormat = 'DD/MM' }): ReactElement => {
  const timeZone = 'Indian/Mauritius'

  const formattedData = data.map((item) => ({
    date: dayjs(item.date).tz(timeZone).format(dateFormat),
    loadPower: parseFloat(item.loadPower),
    pvPower: parseFloat(item.pvPower),
    gridIn: parseFloat(item.gridIn),
    gridOut: parseFloat(item.gridOut),
    batteryCharged: parseFloat(item.batteryCharged),
    batteryDischarged: parseFloat(item.batteryDischarged),
  }))

  return (
    <ResponsiveContainer width='100%' height={500}>
      <AreaChart data={formattedData} margin={{ top: 20, right: 30, left: 0, bottom: 10 }}>
        <defs>
          <linearGradient id='gradientLoadFull' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='5%' stopColor='#DC2626' stopOpacity={0.35} />
            <stop offset='95%' stopColor='#DC2626' stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id='gradientPvFull' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='5%' stopColor='#F59E0B' stopOpacity={0.35} />
            <stop offset='95%' stopColor='#F59E0B' stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id='gradientGridInFull' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='5%' stopColor='#2563EB' stopOpacity={0.35} />
            <stop offset='95%' stopColor='#2563EB' stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id='gradientGridOutFull' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='5%' stopColor='#059669' stopOpacity={0.35} />
            <stop offset='95%' stopColor='#059669' stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id='gradientBatteryCharged' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='5%' stopColor='#7C3AED' stopOpacity={0.35} />
            <stop offset='95%' stopColor='#7C3AED' stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id='gradientBatteryDischarged' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='5%' stopColor='#DB2777' stopOpacity={0.35} />
            <stop offset='95%' stopColor='#DB2777' stopOpacity={0.02} />
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
          stroke='#DC2626'
          strokeWidth={2.5}
          fill='url(#gradientLoadFull)'
          dot={false}
          activeDot={{ r: 6, fill: '#DC2626', stroke: '#fff', strokeWidth: 3 }}
          name='Load Power'
        />
        <Area
          type='monotone'
          dataKey='pvPower'
          stroke='#F59E0B'
          strokeWidth={2.5}
          fill='url(#gradientPvFull)'
          dot={false}
          activeDot={{ r: 6, fill: '#F59E0B', stroke: '#fff', strokeWidth: 3 }}
          name='PV Power'
        />
        <Area
          type='monotone'
          dataKey='gridIn'
          stroke='#2563EB'
          strokeWidth={2}
          fill='url(#gradientGridInFull)'
          dot={false}
          activeDot={{ r: 5, fill: '#2563EB', stroke: '#fff', strokeWidth: 2 }}
          name='Grid In'
        />
        <Area
          type='monotone'
          dataKey='gridOut'
          stroke='#059669'
          strokeWidth={2}
          fill='url(#gradientGridOutFull)'
          dot={false}
          activeDot={{ r: 5, fill: '#059669', stroke: '#fff', strokeWidth: 2 }}
          name='Grid Out'
        />
        <Area
          type='monotone'
          dataKey='batteryCharged'
          stroke='#7C3AED'
          strokeWidth={2}
          fill='url(#gradientBatteryCharged)'
          dot={false}
          activeDot={{ r: 5, fill: '#7C3AED', stroke: '#fff', strokeWidth: 2 }}
          name='Battery Charged'
        />
        <Area
          type='monotone'
          dataKey='batteryDischarged'
          stroke='#DB2777'
          strokeWidth={2}
          fill='url(#gradientBatteryDischarged)'
          dot={false}
          activeDot={{ r: 5, fill: '#DB2777', stroke: '#fff', strokeWidth: 2 }}
          name='Battery Discharged'
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export default ComprehensiveAreaChart
