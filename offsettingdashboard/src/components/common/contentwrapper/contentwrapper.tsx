import { Layout } from 'antd'
import { FC, ReactElement, ReactNode } from 'react'

interface WrapperProps {
  children: ReactNode
}

const ContentWrapper: FC<WrapperProps> = ({ children }): ReactElement => {
  const { Content } = Layout
  return (
    <Content className='h-[100%] w-[100%]' style={{ background: 'var(--surface-base)', color: 'var(--text-primary)' }}>
      <div className='w-full h-[100%] mt-[4px] lg:p-5 p-2 overflow-y-auto pb-20 md:pb-5'>
        {children}
      </div>
    </Content>
  )
}

export default ContentWrapper
