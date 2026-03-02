import { FC } from 'react'

interface AppLoaderProps {
  height?: string
  className?: string
}

const Loader: FC = () => (
  <div className='flex items-center justify-center'>
    <div className='relative w-16 h-16'>
      <div className='absolute inset-0 border-4 rounded-full' style={{ borderColor: 'var(--border)' }}></div>
      <div className='absolute inset-0 border-4 border-t-transparent rounded-full animate-spin' style={{ borderColor: '#DEAF0B' }}></div>
      <div className='absolute inset-2 border-4 border-b-transparent rounded-full animate-spin' style={{ borderColor: 'rgba(222,175,11,0.3)', animationDirection: 'reverse', animationDuration: '1s' }}></div>
    </div>
  </div>
)

export const AppLoader: FC<AppLoaderProps> = ({ height, className }) => {
  return (
    <div
      className={`${className} ${
        height ? `h-[${height}]` : 'h-[100vh]'
      } w-[100%] flex items-center justify-center`}
    >
      <Loader />
    </div>
  )
}

export const GeneralContentLoader: FC<AppLoaderProps> = ({ height }) => {
  return (
    <div
      className={`w-[100%] ${
        height ? `h-[${height}]` : 'h-[70vh]'
      } flex items-center justify-center`}
    >
      <Loader />
    </div>
  )
}
