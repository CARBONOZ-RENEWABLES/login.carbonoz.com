import { Table } from 'antd'
import { FC, ReactElement, useCallback, useState } from 'react'
import { useSelector } from 'react-redux'
import { ELogType } from '../../config/constant'
import { LogInfo } from '../../lib/api/admin/adminEndpoints'
import { RootState } from '../../lib/redux/store'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)
dayjs.extend(timezone)

interface UsersTableProps {
  data: LogInfo[] | undefined
  isFetching: boolean
}

const { Column } = Table

const LogsTable: FC<UsersTableProps> = ({ data, isFetching }): ReactElement => {
  const darkMode = useSelector((state: RootState) => state.theme.darkMode)
  const [expandedRow, setExpandedRow] = useState<string | null>(null) // Change to string | null

  const formatDate = useCallback((date: string) => {
    return dayjs(date).format('DD/MM/YYYY HH:mm')
  }, [])

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

  const handleRowClick = (record: LogInfo) => {
    setExpandedRow((prev) => (prev === record.id ? null : record.id)) // Compare and set string id
  }

  const renderDescription = (description: string) => {
    const truncatedText =
      description.length > 100 ? description.slice(0, 100) + '...' : description
    return <span className='text-gray-500 font-bold'>{truncatedText}</span>
  }

  return (
    <Table
      className={`data_table border-collapse w-full ${
        darkMode ? 'dark-table' : ''
      }`}
      dataSource={data}
      rowKey={(record) => record?.id}
      rowClassName='shadow'
      pagination={false}
      loading={isFetching}
      bordered={false}
      scroll={{ x: 0 }}
      onRow={(record) => ({
        onClick: () => handleRowClick(record),
      })}
      expandable={{
        expandedRowRender: (record: LogInfo) => (
          <p className='text-gray-500'>{record.description}</p>
        ),
        expandedRowKeys: expandedRow === null ? [] : [expandedRow],
      }}
    >
      <Column
        title='Created at'
        key='createdAt'
        {...getColumnProps('Date')}
        render={(record: LogInfo) => (
          <span className='text-gray-500 font-bold'>
            {formatDate(record?.createdAt)}
          </span>
        )}
        width={100}
      />
      <Column
        title='Description'
        key='description'
        {...getColumnProps('Description')}
        render={(record: LogInfo) => renderDescription(record.description)}
        width={300}
      />
      <Column
        title='Ip address'
        key='ipAddress'
        {...getColumnProps('Ip address')}
        render={(record: LogInfo) => (
          <span className='font-bold text-blue-500 dark:text-gray-100'>
            {record?.ipAddress || 'N/A'}
          </span>
        )}
        width={180}
      />
      <Column
        title='Requested Url'
        key='requestUrl'
        {...getColumnProps('Requested Url')}
        render={(record: LogInfo) => (
          <span className='font-bold text-blue-500 dark:text-gray-100'>
            {record?.requestUrl || 'N/A'}
          </span>
        )}
        width={250}
      />
      <Column
        title='Response time'
        key='responseTime'
        {...getColumnProps('Response time')}
        render={(record: LogInfo) => (
          <span className='font-bold text-blue-500 dark:text-gray-100'>
            {record?.responseTime || 'N/A'}
          </span>
        )}
        width={150}
      />
      <Column
        title='Event Type'
        key='eventType'
        {...getColumnProps('Event Type')}
        render={(record: LogInfo) => (
          <span
            className={`font-bold ${
              record?.eventType === ELogType.API_REQUEST
                ? 'text-green-500 dark:text-green-500'
                : 'text-red-500 dark:text-red-500'
            }`}
          >
            {record?.eventType}
          </span>
        )}
        width={160}
      />
    </Table>
  )
}

export default LogsTable
