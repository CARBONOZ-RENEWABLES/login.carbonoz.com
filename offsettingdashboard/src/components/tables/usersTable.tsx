import { Table } from 'antd'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { FC, ReactElement, useCallback } from 'react'
import { useSelector } from 'react-redux'
import { EUserStatus } from '../../config/constant'
import { AccountUser } from '../../lib/api/admin/adminEndpoints'
import { SkeletonRows } from '../../design'
import { RootState } from '../../lib/redux/store'

dayjs.extend(utc)
dayjs.extend(timezone)

interface UsersTableProps {
  data: AccountUser[] | undefined
  isFetching: boolean
  rowSelectionEnabled?: boolean
  selectedRowKeys?: React.Key[]
  onRowSelectionChange: (
    selectedKeys: React.Key[],
    selectedRows: AccountUser[]
  ) => void
}

const { Column } = Table

const UsersTable: FC<UsersTableProps> = ({
  data,
  isFetching,
  rowSelectionEnabled = false,
  selectedRowKeys = [],
  onRowSelectionChange,
}): ReactElement => {
  const darkMode = useSelector((state: RootState) => state.theme.darkMode)

  const rowSelection = {
    selectedRowKeys,
    onChange: (selectedKeys: React.Key[], selectedRows: AccountUser[]) => {
      onRowSelectionChange(selectedKeys, selectedRows)
    },
  }

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
      rowSelection={rowSelectionEnabled ? rowSelection : undefined}
    >
      <Column
        title='Created at'
        key='createdAt'
        {...getColumnProps('Date')}
        render={(record: AccountUser) => (
          <span className='font-medium text-fg-2'>
            {formatDate(record?.createdAt)}
          </span>
        )}
      />

      <Column
        title='Email'
        key='email'
        {...getColumnProps('Email')}
        render={(record: AccountUser) => (
          <span className='font-medium text-accent-ink'>
            {record.email}
          </span>
        )}
      />

      <Column
        title='Name'
        key='firstName'
        {...getColumnProps('Name')}
        render={(record: AccountUser) => (
          <span className='font-medium text-accent-ink'>
            {record?.firstName} {record?.lastName}
          </span>
        )}
      />

      <Column
        title='Verification'
        key='active'
        {...getColumnProps('Verification')}
        render={(record: AccountUser) => (
          <span
            className={` font-bold   ${
              record.active
                ? ' text-green-500 dark:text-green-500'
                : ' text-red-500 dark:text-red-500'
            }`}
          >
            {record?.active ? 'Verified' : 'Not verified'}
          </span>
        )}
      />
      <Column
        title='Status'
        key='activeStatus'
        {...getColumnProps('Status')}
        render={(record: AccountUser) => (
          <span
            className={` font-bold   ${
              record.activeStatus
                ? ' text-green-500 dark:text-green-500'
                : ' text-red-500 dark:text-red-500'
            }`}
          >
            {record?.activeStatus ? EUserStatus.ENABLED : EUserStatus.DISABLED}
          </span>
        )}
      />
    </Table>
  )
}

export default UsersTable
