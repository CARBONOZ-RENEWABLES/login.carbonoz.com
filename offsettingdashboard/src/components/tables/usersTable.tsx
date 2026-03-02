import { Table, Button, Popconfirm } from 'antd'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { FC, ReactElement, useCallback } from 'react'
import { useSelector } from 'react-redux'
import { CheckCircle, XCircle } from 'lucide-react'
import { EUserStatus } from '../../config/constant'
import { AccountUser } from '../../lib/api/admin/adminEndpoints'
import { RootState } from '../../lib/redux/store'
import { useGrantSubscriptionAccessMutation, useRevokeSubscriptionAccessMutation } from '../../lib/api/admin/adminEndpoints'

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
  const [grantAccess] = useGrantSubscriptionAccessMutation()
  const [revokeAccess] = useRevokeSubscriptionAccessMutation()

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
      rowSelection={rowSelectionEnabled ? rowSelection : undefined}
    >
      <Column
        title='Created at'
        key='createdAt'
        {...getColumnProps('Date')}
        render={(record: AccountUser) => (
          <span className='text-gray-500 font-bold'>
            {formatDate(record?.createdAt)}
          </span>
        )}
      />

      <Column
        title='Email'
        key='email'
        {...getColumnProps('Email')}
        render={(record: AccountUser) => (
          <span className='font-bold text-blue-500 dark:text-gray-100'>
            {record.email}
          </span>
        )}
      />

      <Column
        title='Name'
        key='firstName'
        {...getColumnProps('Name')}
        render={(record: AccountUser) => (
          <span className='font-bold text-blue-500 dark:text-gray-100'>
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
      <Column
        title='Subscription'
        key='subscription'
        {...getColumnProps('Subscription')}
        render={(record: any) => (
          <div className='flex flex-col gap-2'>
            <div className='flex items-center gap-2'>
              {record.manualAccessOverride ? (
                <Popconfirm
                  title="Revoke subscription access?"
                  onConfirm={() => revokeAccess(record.id)}
                  okText="Yes"
                  cancelText="No"
                >
                  <Button size='small' danger icon={<XCircle size={14} />}>
                    Revoke
                  </Button>
                </Popconfirm>
              ) : (
                <Popconfirm
                  title="Grant subscription access?"
                  onConfirm={() => grantAccess(record.id)}
                  okText="Yes"
                  cancelText="No"
                >
                  <Button size='small' type='primary' icon={<CheckCircle size={14} />}>
                    Grant
                  </Button>
                </Popconfirm>
              )}
            </div>
            {record.manualAccessExpiry && (
              <span className='text-xs text-gray-500'>
                Expires: {dayjs(record.manualAccessExpiry).format('DD/MM/YYYY')}
              </span>
            )}
          </div>
        )}
      />
    </Table>
  )
}

export default UsersTable
