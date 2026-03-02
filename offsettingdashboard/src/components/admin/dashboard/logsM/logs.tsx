import { FC, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useLogsQuery } from '../../../../lib/api/admin/adminEndpoints'
import Paginator from '../../../common/paginator/paginator'
import LogsTable from '../../../tables/logs.table'

const Logs: FC = () => {
  const [currentPage, setCurrentPage] = useState<number>(0)
  const size = 10
  const { data, isFetching, refetch } = useLogsQuery({
    page: currentPage.toString(),
    size: size.toString(),
  })
  useEffect(() => {
    refetch()
  }, [refetch])
  return (
    <div>
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className='text-2xl mb-6 font-bold tracking-tight'
        style={{ color: 'var(--text-primary)' }}
      >
        System Logs
      </motion.h1>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className='mt-8 border rounded-xl overflow-hidden shadow-md'
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <div className='flex justify-between items-center p-6 border-b border-l-4' style={{ borderBottomColor: 'var(--border)', borderLeftColor: '#DEAF0B' }}>
          <h1 className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>
            {data?.data.totalItems} Logs
          </h1>
        </div>
        <div className='p-6'>
          <LogsTable data={data?.data.items} isFetching={isFetching} />
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

export default Logs
