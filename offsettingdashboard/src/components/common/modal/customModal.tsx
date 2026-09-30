import { Col, Modal, Row } from 'antd'
import { FC, ReactNode } from 'react'
import { X } from 'lucide-react'
import { motion } from 'framer-motion'

interface CustomModalProps {
  isVisible: boolean
  setIsVisible: (visible: boolean) => void
  loading?: boolean
  title?: string
  footerWidth?: number
  footerContent?: ReactNode
  handleCancel?: () => void
  destroyOnClose?: boolean
  width?: number
  subTitle?: string
  subTitleKey?: string
  children?: ReactNode
}

const CustomModal: FC<CustomModalProps> = ({
  isVisible,
  setIsVisible,
  loading = false,
  title = '',
  footerWidth = 10,
  footerContent,
  handleCancel,
  destroyOnClose,
  width = 500,
  subTitle,
  subTitleKey,
  children,
}) => {
  const onCancel = () => {
    setIsVisible(false)
    handleCancel && handleCancel()
  }

  return (
    <Modal
      title={
        <div className='flex items-start justify-between gap-4 border-b border-line px-5 py-4'>
          <div className='flex-1'>
            <motion.h2
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className='text-[16px] font-semibold text-fg'
            >
              {title}
            </motion.h2>
            {subTitle && (
              <p className='mt-0.5 text-[12.5px] text-muted'>
                {subTitle}{' '}
                <span className='font-medium text-fg'>{subTitleKey}</span>
              </p>
            )}
          </div>
          {!loading && title && (
            <button
              type='button'
              onClick={onCancel}
              aria-label='Close dialog'
              className='-mr-1 grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-panel-3 hover:text-fg'
            >
              <X size={16} />
            </button>
          )}
        </div>
      }
      width={width}
      footer={
        footerContent ? (
          <div className='border-t border-line px-5 py-3'>
            <Row justify='end'>
              <Col
                xs={24}
                sm={24}
                md={10}
                lg={footerWidth}
                xl={footerWidth}
                xxl={footerWidth}
              >
                {footerContent}
              </Col>
            </Row>
          </div>
        ) : (
          false
        )
      }
      open={isVisible}
      onCancel={handleCancel || onCancel}
      centered
      maskClosable={!loading}
      closable={false}
      destroyOnClose={destroyOnClose}
      styles={{
        body: { padding: '16px 20px' },
        content: { padding: 0, overflow: 'hidden', border: '1px solid rgb(var(--c-line-strong))' },
        header: { margin: 0, padding: 0, background: 'transparent' },
        footer: { margin: 0 },
        mask: { backdropFilter: 'blur(2px)', background: 'rgba(0, 0, 0, 0.5)' },
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.div>
    </Modal>
  )
}

export default CustomModal
