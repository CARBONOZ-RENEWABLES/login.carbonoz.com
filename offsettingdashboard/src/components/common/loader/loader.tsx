import { FC } from 'react'
import Logo from '../../../assets/1.jpg'

interface AppLoaderProps {
  height?: string
  className?: string
}

const Loader: FC = () => (
  <div className='flex flex-col items-center gap-4' role='status' aria-label='Loading'>
    <div className='relative h-12 w-12'>
      <img src={Logo} alt='' className='absolute inset-[9px] h-[30px] w-[30px] rounded-[8px] object-cover' />
      <span className='absolute inset-0 animate-spin rounded-full border-2 border-line-strong border-t-accent' />
    </div>
    <span className='text-[12.5px] text-muted'>Loading…</span>
  </div>
)

export const AppLoader: FC<AppLoaderProps> = ({ height, className }) => (
  <div className={`${className ?? ''} flex w-full items-center justify-center`} style={{ height: height ?? '100dvh' }}>
    <Loader />
  </div>
)

export const GeneralContentLoader: FC<AppLoaderProps> = ({ height }) => (
  <div className='flex w-full items-center justify-center' style={{ height: height ?? '70vh' }}>
    <Loader />
  </div>
)
