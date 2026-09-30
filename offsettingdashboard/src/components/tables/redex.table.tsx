import { Table } from 'antd'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { FC, ReactElement, useCallback } from 'react'
import { useSelector } from 'react-redux'
import { RedexInfo } from '../../lib/api/admin/adminEndpoints'
import { SkeletonRows } from '../../design'
import { RootState } from '../../lib/redux/store'

dayjs.extend(utc)
dayjs.extend(timezone)

interface RedexTableProps {
  data: RedexInfo[] | undefined
  isFetching: boolean
}

const { Column } = Table

const RedexTable: FC<RedexTableProps> = ({
  data,
  isFetching,
}): ReactElement => {
  const darkMode = useSelector((state: RootState) => state.theme.darkMode)

  const formatDate = useCallback((date: string) => {
    return dayjs(date).format('DD/MM/YYYY')
  }, [])

  const getColumnProps = useCallback(
    (label: string) => ({
      className: 'c-column',
      onCell: () =>
        ({
          'data-label': label,
        } as React.TdHTMLAttributes<HTMLTableCellElement>),
    }),
    []
  )

  // First load: shimmer rows; the app loader is the only spinner.
  if (isFetching && !data?.length) return <SkeletonRows />

  return (
    <Table
      className={`data_table border-collapse w-full ${
        darkMode ? 'dark-table' : ''
      }`}
      dataSource={data}
      rowKey={(record) => record?.id}
      rowClassName='shadow'
      pagination={false}
      loading={false}
      bordered={false}
      scroll={{ x: 0 }}
    >
      <Column
        title='Created At'
        key='createdAt'
        {...getColumnProps('Created At')}
        render={(record: RedexInfo) => (
          <span>{formatDate(record.createdAt)}</span>
        )}
      />

      <Column
        title='Updated At'
        key='updatedAt'
        {...getColumnProps('Updated At')}
        render={(record: RedexInfo) => (
          <span>{formatDate(record.updatedAt)}</span>
        )}
      />
      <Column
        title='Country Code'
        key='countryCode'
        {...getColumnProps('Country Code')}
        render={(record: RedexInfo) => <span>{record.countryCode}</span>}
      />

      <Column
        title='Grouped English Name'
        key='groupedEnglishName'
        {...getColumnProps('Grouped English Name')}
        render={(record: RedexInfo) => <span>{record.groupedEnglishName}</span>}
      />

      <Column
        title='Grouped Local Name'
        key='groupedLocalName'
        {...getColumnProps('Grouped Local Name')}
        render={(record: RedexInfo) => <span>{record.groupedLocalName}</span>}
      />

      <Column
        title='Province'
        key='province'
        {...getColumnProps('Province')}
        render={(record: RedexInfo) => <span>{record.province}</span>}
      />

      <Column
        title='Timezone'
        key='timezone'
        {...getColumnProps('Timezone')}
        render={(record: RedexInfo) => <span>{record.timezone}</span>}
      />

      <Column
        title='Data Frequency'
        key='generationDataFrequency'
        {...getColumnProps('Data Frequency')}
        render={(record: RedexInfo) => (
          <span>{record.generationDataFrequency}</span>
        )}
      />

      <Column
        title='Device Registered'
        key='deviceRegistered'
        {...getColumnProps('Device Registered')}
        render={(record: RedexInfo) => (
          <span
            className={`font-bold ${
              record.deviceRegistered ? 'text-green-500' : 'text-red-500'
            }`}
          >
            {record.deviceRegistered ? 'Yes' : 'No'}
          </span>
        )}
      />
    </Table>
  )
}

export default RedexTable
