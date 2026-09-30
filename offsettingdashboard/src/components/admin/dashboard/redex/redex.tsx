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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className='overflow-hidden rounded-xl border border-line bg-panel shadow-card'
      >
        <div className='flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5'>
          <h2 className='text-[15px] font-semibold tracking-[-0.01em] text-fg'>
            {data?.data.items.length} Redex requests
          </h2>
        </div>
        <div className='p-4'>
          <div className='mb-6 flex sm:justify-between sm:items-end flex-col sm:flex-row gap-4'>
            <div className='w-full sm:w-[30%]'>
              <label className='mb-1 block text-[12px] font-medium text-muted'>
                Filter by status
              </label>
              <Select
                value={status}
                onChange={(value) => onChangeStatus(value)}
                className='w-full'
                options={options}
                defaultValue={'false'}
              />
            </div>
            <CustomButton
              htmlType='button'
              icon={<Send size={18} />}
              
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
