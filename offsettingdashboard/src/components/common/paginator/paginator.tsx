import { Pagination } from 'antd'
import { FC, ReactElement } from 'react'

interface PaginatorProps {
  total?: number
  setCurrentPage?: (page: number) => void
  pageSize?: number
  totalPages?: number
  currentPage: number
  isDarkMode?: boolean
}

const Paginator: FC<PaginatorProps> = ({
  total = 0,
  setCurrentPage = () => null,
  pageSize = 10,
  totalPages,
  currentPage,
}): ReactElement | null => {
  const onChange = (page: number) => {
    setCurrentPage(page - 1)
  }

  if ((totalPages ?? 0) <= 1) {
    return null
  }

  return (
    <div className='grid justify-end mt-8 w-full mb-5'>
      <Pagination
        onChange={onChange}
        showSizeChanger={false}
        defaultCurrent={1}
        current={totalPages ? currentPage + 1 : 1}
        total={total}
        pageSize={pageSize}
      />
    </div>
  )
}

export default Paginator
