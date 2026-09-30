import { Compass } from 'lucide-react'
import { FC, ReactElement } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Card } from '../../design'

export function NotFoundCard({ onHome }: { onHome: () => void }) {
  return (
    <Card className='mx-auto my-10 flex w-full max-w-md flex-col items-center px-6 py-12 text-center'>
      <span className='grid h-12 w-12 place-items-center rounded-full bg-panel-3 text-muted'>
        <Compass size={22} />
      </span>
      <p className='mt-4 text-[40px] font-semibold leading-none tracking-[-0.03em] text-fg'>404</p>
      <p className='mt-2 text-[14px] text-fg-2'>This page doesn't exist.</p>
      <Button variant='primary' className='mt-6' onClick={onHome}>
        Go home
      </Button>
    </Card>
  )
}

const NotFound: FC = (): ReactElement => {
  const navigate = useNavigate()
  const location = useLocation()
  return <NotFoundCard onHome={() => navigate(location.pathname.includes('admin') ? '/admin' : '/ds')} />
}

export default NotFound
