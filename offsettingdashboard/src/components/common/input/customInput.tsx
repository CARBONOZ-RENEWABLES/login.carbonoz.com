import { Form, Input, Radio, Select, Space } from 'antd'
import { Rule } from 'antd/lib/form'
import { ChangeEvent, FC, ReactNode, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface CustomInputProps {
  label?: string
  placeholder?: string
  type?: 'normal' | 'file' | 'select-multiple' | 'select' | 'radio' | 'textarea'
  inputType?: string
  value?: string | number | string[] | FileList | null
  name?: string
  isLoading?: boolean
  disabled?: boolean
  rules?: Rule[]
  styles?: string
  onChange?: (value: string | number | string[] | FileList | null) => void
  options?: Array<{ label: string; value: string | number }>
  defaultValue?: Array<string | number | (string | number)>
  customlabel?: ReactNode
  selectDefaultValue?: string | number
}

const CustomInput: FC<CustomInputProps> = ({
  label = '',
  customlabel,
  placeholder,
  type = 'normal',
  inputType,
  value,
  name,
  isLoading,
  disabled,
  rules,
  styles,
  onChange = () => null,
  options = [],
  defaultValue = [],
  selectDefaultValue,
}) => {
  const [isFocused, setIsFocused] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const isPasswordField = inputType === 'password'
  const actualInputType = isPasswordField && showPassword ? 'text' : inputType

  const NormalInput = (
    <div className='mb-4'>
      {label && !customlabel && (
        <label className='text-sm font-semibold mb-2 block' style={{ color: 'var(--text-secondary)' }}>
          {label}
        </label>
      )}

      <Form.Item name={name} rules={rules} label={customlabel} className='mb-0'>
        <div className="relative">
          <Input
            value={value as string}
            type={actualInputType}
            placeholder={placeholder || ''}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className={`py-3 px-4 rounded-[10px] border transition-all duration-200 ${styles} ${
              isFocused
                ? 'ring-2 ring-[#DEAF0B]/40 border-[#DEAF0B]'
                : 'border-[var(--border)] hover:border-[#DEAF0B]/50'
            }`}
            style={{ 
              background: 'var(--surface-overlay)',
              color: 'var(--text-primary)',
              fontSize: '0.9375rem'
            }}
            disabled={(inputType === 'file' && isLoading) || disabled}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onChange(inputType === 'file' ? e?.target?.files : e?.target?.value)
            }
          />
          {isPasswordField && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors duration-200"
              style={{ color: 'var(--text-muted)' }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          )}
        </div>
      </Form.Item>
    </div>
  )

  const TextAreaInput = (
    <div className='mb-4'>
      {label && !customlabel && (
        <label className='text-sm font-semibold mb-2 block' style={{ color: 'var(--text-secondary)' }}>
          {label}
        </label>
      )}

      <Form.Item name={name} rules={rules} label={customlabel} className='mb-0'>
        <Input.TextArea
          value={value as string}
          placeholder={placeholder || 'Enter text'}
          className={`py-3 px-4 rounded-[10px] border transition-all duration-200 ${styles} border-[var(--border)] hover:border-[#DEAF0B]/50 focus:ring-2 focus:ring-[#DEAF0B]/40 focus:border-[#DEAF0B]`}
          style={{ 
            background: 'var(--surface-overlay)',
            color: 'var(--text-primary)'
          }}
          disabled={disabled}
          rows={6}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
            onChange(e?.target?.value)
          }
        />
      </Form.Item>
    </div>
  )

  const SelectMultipleInput = (
    <div className='mb-4'>
      {label && !customlabel && (
        <label className='text-sm font-semibold mb-2 block' style={{ color: 'var(--text-secondary)' }}>
          {label}
        </label>
      )}

      <Form.Item name={name} rules={rules} label={customlabel} className='mb-0'>
        <Select
          className={`rounded-[10px] ${styles}`}
          mode='multiple'
          size='large'
          loading={isLoading}
          disabled={disabled}
          placeholder={placeholder || 'Please select'}
          defaultValue={defaultValue as (string | number)[]}
          onChange={(value) => onChange(value as string[])}
          style={{ width: '100%' }}
          options={options}
        />
      </Form.Item>
    </div>
  )

  const SelectInput = (
    <div className='mb-4'>
      {label && !customlabel && (
        <label className='text-sm font-semibold mb-2 block' style={{ color: 'var(--text-secondary)' }}>
          {label}
        </label>
      )}

      <Form.Item name={name} rules={rules} label={customlabel} className='mb-0'>
        <Select
          value={value as string | number}
          onChange={(value) => onChange(value as string | number)}
          className={`rounded-[10px] ${styles}`}
          loading={isLoading}
          disabled={disabled}
          options={options}
          defaultValue={selectDefaultValue}
          size='large'
        >
          {options.map((option, index) => (
            <Select.Option key={index} value={option.value}>
              {option.label}
            </Select.Option>
          ))}
        </Select>
      </Form.Item>
    </div>
  )

  const RadioInput = (
    <div className='mb-4'>
      {label && !customlabel && (
        <label className='text-sm font-semibold mb-2 block' style={{ color: 'var(--text-secondary)' }}>
          {label}
        </label>
      )}

      <Form.Item name={name} rules={rules} label={customlabel} className='mb-0'>
        <Radio.Group
          onChange={(e) => onChange(e.target.value)}
          value={value as string}
          className={`${styles}`}
        >
          <Space direction='vertical' className='mt-2 space-y-2'>
            {options.map((option) => (
              <Radio
                key={option.value}
                value={option.value}
                style={{ color: 'var(--text-primary)' }}
              >
                {option.label}
              </Radio>
            ))}
          </Space>
        </Radio.Group>
      </Form.Item>
    </div>
  )

  switch (type) {
    case 'select-multiple':
      return SelectMultipleInput
    case 'select':
      return SelectInput
    case 'radio':
      return RadioInput
    case 'textarea':
      return TextAreaInput
    default:
      return NormalInput
  }
}

export default CustomInput
