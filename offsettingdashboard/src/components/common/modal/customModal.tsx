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
        <div className='flex justify-between items-start px-6 pt-6 pb-4 border-b' style={{ borderColor: 'var(--border)' }}>
          <div className='flex-1'>
            <motion.h2
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className='text-2xl font-bold mb-2'
              style={{ color: 'var(--text-primary)' }}
            >
              {title}
            </motion.h2>
            {subTitle && (
              <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
                {subTitle}{' '}
                <span className='font-semibold' style={{ color: 'var(--text-primary)' }}>{subTitleKey}</span>
              </p>
            )}
          </div>
          {!loading && title && (
            <motion.button
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              onClick={onCancel}
              className='ml-4 p-2 rounded-lg hover:bg-[var(--surface-overlay)] transition-colors duration-200'
            >
              <X size={20} style={{ color: 'var(--text-secondary)' }} />
            </motion.button>
          )}
        </div>
      }
      width={width}
      footer={
        footerContent ? (
          <div className='px-6 py-4 border-t' style={{ borderColor: 'var(--border)', background: 'var(--surface-overlay)' }}>
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
        body: { padding: '24px' },
        mask: { backdropFilter: 'blur(8px)', background: 'rgba(0, 0, 0, 0.5)' },
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
