interface ValidationRule {
  required: boolean
  message: string
}

const requiredField = (message: string): Array<ValidationRule> => [
  { required: true, message: `${message} is required` },
]

export default requiredField
