import dayjs from 'dayjs'
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

interface CarbonDataPoint {
  date: string
  carbonIntensity: number
  gridEnergy: number
  solarEnergy: number
  unavoidableEmissions: number
  avoidedEmissions: number
  selfSufficiencyScore: number
}

interface Props {
  data: CarbonDataPoint[]
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
              <span className='text-xs font-bold' style={{ color: entry.color }}>
                {entry.value.toFixed(2)} {entry.unit || ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }
  return null
}

const CarbonIntensityChart: FC<Props> = ({ data, dateFormat = 'DD/MM' }): ReactElement => {
  const formattedData = data.map((item) => ({
    date: dayjs(item.date).format(dateFormat),
    unavoidableEmissions: parseFloat(item.unavoidableEmissions.toString()),
    avoidedEmissions: parseFloat(item.avoidedEmissions.toString()),
    carbonIntensity: parseFloat(item.carbonIntensity.toString()),
    selfSufficiency: parseFloat(item.selfSufficiencyScore.toString()),
  }))

  return (
    <ResponsiveContainer width='100%' height={500}>
      <AreaChart data={formattedData} margin={{ top: 20, right: 30, left: 0, bottom: 10 }}>
        <defs>
          <linearGradient id='gradientUnavoidable' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='5%' stopColor='#EF4444' stopOpacity={0.4} />
            <stop offset='95%' stopColor='#EF4444' stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id='gradientAvoided' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='5%' stopColor='#22C55E' stopOpacity={0.4} />
            <stop offset='95%' stopColor='#22C55E' stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id='gradientIntensity' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='5%' stopColor='#F59E0B' stopOpacity={0.4} />
            <stop offset='95%' stopColor='#F59E0B' stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id='gradientSufficiency' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='5%' stopColor='#3B82F6' stopOpacity={0.4} />
            <stop offset='95%' stopColor='#3B82F6' stopOpacity={0.05} />
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
          label={{ value: 'kg CO₂', angle: -90, position: 'insideLeft', style: { fill: '#6b7280', fontSize: 12 } }}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#22c55e', strokeWidth: 2, strokeDasharray: '5 5' }} />
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
          dataKey='unavoidableEmissions'
          stroke='#EF4444'
          strokeWidth={2.5}
          fill='url(#gradientUnavoidable)'
          dot={false}
          activeDot={{ r: 6, fill: '#EF4444', stroke: '#fff', strokeWidth: 3 }}
          name='Unavoidable Emissions'
          unit=' kg'
        />
        <Area
          type='monotone'
          dataKey='avoidedEmissions'
          stroke='#22C55E'
          strokeWidth={2.5}
          fill='url(#gradientAvoided)'
          dot={false}
          activeDot={{ r: 6, fill: '#22C55E', stroke: '#fff', strokeWidth: 3 }}
          name='Avoided Emissions'
          unit=' kg'
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export default CarbonIntensityChart
