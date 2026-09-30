import { FC, MouseEventHandler, ReactNode } from 'react'
import { motion } from 'framer-motion'

interface CustomButtonProps {
  disabled?: boolean
  icon?: ReactNode
  size?: 'large' | 'middle' | 'small'
  target?: string
  type?: 'default' | 'primary' | 'dashed' | 'link' | 'text'
  onClick?: MouseEventHandler<HTMLElement>
  children?: ReactNode
  htmlType?: 'button' | 'submit' | 'reset'
  className?: string
  loading?: boolean
  form?: string
  background?: string
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive'
  style?: React.CSSProperties
}

const CustomButton: FC<CustomButtonProps> = ({
  disabled,
  icon,
  onClick,
  children,
  htmlType = 'button',
  className = '',
  loading,
  form,
  variant = 'primary',
  style,
}) => {
  const getStyles = () => {
    const base =
      'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[13.5px] font-medium transition-[background-color,color,border-color,box-shadow] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 min-h-[38px] px-4'
    switch (variant) {
      case 'secondary':
        return `${base} border border-line-strong bg-panel/40 text-fg-2 hover:border-subtle hover:bg-panel-2 hover:text-fg`
      case 'ghost':
        return `${base} text-muted hover:bg-panel-3 hover:text-fg`
      case 'destructive':
        return `${base} border border-danger/25 bg-danger/10 text-danger hover:bg-danger/20`
      default:
        return `${base} bg-accent text-on-accent shadow-[0_6px_18px_-8px_rgb(var(--c-accent)/0.8)] hover:bg-accent-hover`
    }
  }

  return (
    <motion.button
      whileTap={{ scale: disabled || loading ? 1 : 0.97 }}
      transition={{ duration: 0.12 }}
      type={htmlType}
      onClick={onClick}
      disabled={disabled || loading}
      form={form}
      className={`${getStyles()} ${className} ${disabled || loading ? 'opacity-50 cursor-not-allowed' : ''}`}
      style={style}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {icon}
      {children}
    </motion.button>
  )
}

export default CustomButton
