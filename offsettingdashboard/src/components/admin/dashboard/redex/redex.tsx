import { Select } from 'antd'
import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { motion } from 'framer-motion'
import handleAPIRequests from '../../../../helpers/handleApiRequest'
import {
  useRedexInfosQuery,
  useSendToRedexMutation,
} from '../../../../lib/api/admin/adminEndpoints'
import CustomButton from '../../../common/button/button'
import Paginator from '../../../common/paginator/paginator'
import RedexTable from '../../../tables/redex.table'

const AdminRedexInformation = () => {
  const [status, setStatus] = useState<string>('false')
  const size = 10
  const [currentPage, setCurrentPage] = useState<number>(0)

  const { data, isFetching, refetch } = useRedexInfosQuery({
    status,
    page: currentPage.toString(),
    size: size.toString(),
  })
  const [sendData, { isLoading }] = useSendToRedexMutation()

  const options = [
    { value: 'true', label: 'Registered devices' },
    { value: 'false', label: 'Non Registered devices' },
  ]

  const onChangeStatus = (status: string) => {
    setStatus(status)
    setCurrentPage(0)
  }

  const onFinish = () => {
    handleAPIRequests({
      request: sendData,
      ...{},
      notify: true,
      message: 'Data sent successfully',
    })
  }

  useEffect(() => {
    refetch()
  }, [refetch])

  return (
    <div className='w-[100%]'>
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className='text-2xl mb-6 font-bold tracking-tight'
        style={{ color: 'var(--text-primary)' }}
      >
        Redex Requests
      </motion.h1>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className='mt-8 border rounded-xl overflow-hidden shadow-md'
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <div className='flex justify-between items-center p-6 border-b border-l-4' style={{ borderBottomColor: 'var(--border)', borderLeftColor: '#DEAF0B' }}>
          <h1 className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>
            {data?.data.items.length} Redex requests
          </h1>
        </div>
        <div className='p-6'>
          <div className='mb-6 flex sm:justify-between sm:items-end flex-col sm:flex-row gap-4'>
            <div className='w-full sm:w-[30%]'>
              <label className='text-sm font-semibold mb-2 block' style={{ color: 'var(--text-secondary)' }}>
                Filter by status
              </label>
              <Select
                value={status}
                onChange={(value) => onChangeStatus(value)}
                className='w-full'
                options={options}
                defaultValue={'false'}
                size='large'
              />
            </div>
            <CustomButton
              htmlType='button'
              icon={<Send size={18} />}
              className='h-[52px] px-6'
              onClick={onFinish}
              loading={isLoading}
              variant='primary'
            >
              Send Data to Redex
            </CustomButton>
          </div>
          <RedexTable data={data?.data.items} isFetching={isFetching} />
          <Paginator
            total={data?.data.totalItems}
            setCurrentPage={setCurrentPage}
            totalPages={data?.data.totalPages}
            currentPage={currentPage}
            pageSize={size}
          />
        </div>
      </motion.div>
    </div>
  )
}

export default AdminRedexInformation
