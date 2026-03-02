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
}) => {
  const getStyles = () => {
    const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#DEAF0B]/40'
    
    switch (variant) {
      case 'primary':
        return `${base} bg-[#DEAF0B] text-black hover:bg-[#c49a0a] hover:shadow-[0_0_20px_rgba(222,175,11,0.4)]`
      case 'secondary':
        return `${base} bg-transparent border border-[var(--border)] hover:border-[#DEAF0B] hover:text-[#DEAF0B]`
      case 'ghost':
        return `${base} bg-transparent hover:bg-[var(--surface-overlay)]`
      case 'destructive':
        return `${base} bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20`
      default:
        return `${base} bg-[#DEAF0B] text-black hover:bg-[#c49a0a] hover:shadow-[0_0_20px_rgba(222,175,11,0.4)]`
    }
  }

  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      transition={{ duration: 0.2 }}
      type={htmlType}
      onClick={onClick}
      disabled={disabled || loading}
      form={form}
      className={`${getStyles()} ${className} ${disabled || loading ? 'opacity-50 cursor-not-allowed' : ''}`}
      style={{ color: variant === 'primary' ? '#000' : undefined }}
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
