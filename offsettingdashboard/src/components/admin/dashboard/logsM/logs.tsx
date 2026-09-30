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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className='overflow-hidden rounded-xl border border-line bg-panel shadow-card'
      >
        <div className='flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5'>
          <h2 className='text-[15px] font-semibold tracking-[-0.01em] text-fg'>
            {data?.data.totalItems} Logs
          </h2>
        </div>
        <div className='p-4'>
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
