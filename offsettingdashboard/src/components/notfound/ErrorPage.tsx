import { FC, ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { NotFoundCard } from './notFound'

const ErrorPage: FC = (): ReactElement => {
  const navigate = useNavigate()
  return (
    <div className='grid min-h-dvh place-items-center px-4'>
      <NotFoundCard onHome={() => navigate('/')} />
    </div>
  )
}

export default ErrorPage
