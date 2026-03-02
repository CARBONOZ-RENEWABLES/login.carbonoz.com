import { Image } from 'antd'
import { CSSProperties, FC } from 'react'

interface CustomImageProps {
  src?: string
  alt?: string
  width?: string | number
  height?: string | number
  preview?: boolean
  placeholder?: string
  className?: string
  style?: CSSProperties
  onClick?: () => void
}

const CustomImage: FC<CustomImageProps> = ({
  src,
  alt,
  width,
  height,
  preview,
  placeholder,
  className,
  style,
  onClick,
}) => {
  return (
    <Image
      onClick={onClick}
      style={style}
      src={src}
      alt={alt || ''}
      width={width}
      height={height}
      preview={!!preview}
      placeholder={placeholder || ''}
      className={className}
    />
  )
}

export default CustomImage
