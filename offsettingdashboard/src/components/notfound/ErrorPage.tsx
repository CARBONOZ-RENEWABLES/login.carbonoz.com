import { FC, ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import CustomButton from '../common/button/button'

const ErrorPage: FC = (): ReactElement => {
  const navigate = useNavigate()
  return (
    <div className='w-[100%] h-[600px] grid items-center justify-center'>
      <div>
        <h1 className='text-[160px] font-bold text_404 text-center'>404</h1>
        <p className='text-[16px] text-center text-gray-500'>Page not found</p>
        <div className='mt-6 w-[100%] grid items-center justify-center'>
          <CustomButton
            type='primary'
            className='h-[60px]'
            onClick={() => navigate('/')}
          >
            Go home
          </CustomButton>
        </div>
      </div>
    </div>
  )
}

export default ErrorPage
