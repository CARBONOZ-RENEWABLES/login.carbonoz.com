import { notification } from 'antd'
import { FC } from 'react'

interface NotifyProps {
  placement?: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'
  description?: string
  message?: string
  type?: 'success' | 'info' | 'warning' | 'error'
  duration?: number
}

const Notify: FC<NotifyProps> = ({
  placement = 'topRight',
  description,
  message = 'Notification',
  type = 'success',
  duration = 4.5,
}) => {
  notification.destroy()

  notification[type]({
    message,
    description,
    placement,
    duration,
  })

  return null
}

export default Notify
