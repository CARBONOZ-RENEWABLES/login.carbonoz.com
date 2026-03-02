import { Table, TablePaginationConfig } from 'antd'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { FC, ReactElement, useCallback } from 'react'
import { useSelector } from 'react-redux'
import { energyInt } from '../../lib/api/Analytics/analyticsEndpoints'
import { RootState } from '../../lib/redux/store'

dayjs.extend(utc)
dayjs.extend(timezone)

interface Props {
  data: Array<energyInt> | undefined
  isFetching: boolean
  type?: 'monthly' | 'daily' | 'yearly' | 'decade'
  pagination?: TablePaginationConfig
  loading?: boolean
}

const { Column } = Table

const EnergyTable: FC<Props> = ({
  data,
  isFetching,
  type = 'daily',
  pagination,
}): ReactElement => {
  let dateFormat
  switch (type) {
    case 'monthly':
      dateFormat = 'DD/MM/YYYY'
      break
    case 'yearly':
      dateFormat = 'MMMM YYYY'
      break
    case 'decade':
      dateFormat = 'YYYY'
      break
    default:
      dateFormat = 'MMMM DD'
  }

  const darkMode = useSelector((state: RootState) => state.theme.darkMode)

  const getColumnProps = useCallback(
    (label: string) => ({
      className: 'bg-white dark:bg-gray-800 dark:text-gray-100 c-column',
      onCell: () =>
        ({
          'data-label': label,
        } as React.TdHTMLAttributes<HTMLTableCellElement>),
    }),
    []
  )

  return (
    <Table
      className='data_table border-collapse w-full'
      dataSource={data}
      rowKey={(record) => record?.id}
      rowClassName='shadow'
      pagination={pagination ? pagination : false}
      loading={isFetching}
      bordered={false}
      scroll={{ x: 0 }}
    >
      <Column
        title='Date'
        key='date'
        {...getColumnProps('Date')}
        render={(record: energyInt) => (
          <span className='text-gray-500 font-bold '>
            {dayjs(record?.date).format(dateFormat)}
          </span>
        )}
      />
      <Column
        title='Load Power'
        key='loadPower'
        {...getColumnProps('Load Power')}
        render={(record: energyInt) => (
          <span className='font-bold text-gray-900 dark:text-gray-100'>
            {parseFloat(record.loadPower).toFixed(1)} Kwh
          </span>
        )}
      />
      <Column
        title='Pv Power'
        key='pvPower'
        {...getColumnProps('Pv Power')}
        render={(record: energyInt) => (
          <span className='font-bold text-gray-900 dark:text-gray-100'>
            {parseFloat(record?.pvPower).toFixed(1)} Kwh
          </span>
        )}
      />
      <Column
        title='Grid In'
        key='gridIn'
        {...getColumnProps('Grid In')}
        render={(record: energyInt) => (
          <span className='font-bold text-gray-900 dark:text-gray-100'>
            {parseFloat(record?.gridIn).toFixed(1)} Kwh
          </span>
        )}
      />
      <Column
        title='Grid Out'
        key='gridOut'
        {...getColumnProps('Grid Out')}
        render={(record: energyInt) => (
          <span className='font-bold text-gray-900 dark:text-gray-100'>
            {parseFloat(record?.gridOut).toFixed(1)} Kwh
          </span>
        )}
      />
      <Column
        title='Battery Charged'
        key='batteryCharged'
        {...getColumnProps('Battery Charged')}
        render={(record: energyInt) => (
          <span className='font-bold text-gray-900 dark:text-gray-100'>
            {parseFloat(record?.batteryCharged).toFixed(1)} Kwh
          </span>
        )}
      />
      <Column
        title='Battery Discharged'
        key='batteryDischarged'
        {...getColumnProps('Battery Discharged')}
        render={(record: energyInt) => (
          <span className='font-bold text-gray-900 dark:text-gray-100'>
            {parseFloat(record?.batteryDischarged).toFixed(1)} Kwh
          </span>
        )}
      />
    </Table>
  )
}

export default EnergyTable
