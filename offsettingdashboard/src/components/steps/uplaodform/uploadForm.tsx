import { Form } from 'antd'
import { FC, ReactElement, useState } from 'react'
import Dropzone, { Accept } from 'react-dropzone'
import { useNavigate } from 'react-router-dom'
import { Upload, FileText, AlertCircle } from 'lucide-react'
import { ESteps } from '../../../config/constant'
import handleAPIRequests from '../../../helpers/handleApiRequest'
import { getFromLocal, removeFromLocal } from '../../../helpers/handleStorage'
import Notify from '../../common/notification/notification'
import RedexForm from '../redexform/redexInfo'

const API_URL = import.meta.env.VITE_API_URL

const BASE_URL = `${API_URL}/v1`

interface Props {
  makeStep: () => void
  setLoadingAction: (state: boolean) => void
}

const UploadForm: FC<Props> = ({
  makeStep,
  setLoadingAction,
}): ReactElement => {
  const navigate = useNavigate()
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [fileName, setFileName] = useState<string>('')
  const [preview, setPreview] = useState<Uint8Array | null>(null)
  const [File, setFile] = useState<File | null>(null)
  const onDrop = (acceptedFiles: File[]) => {
    setIsDragging(false)
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0]
      setFile(file)
      setFileName(file.name)
      const reader = new FileReader()
      reader.onload = () => {
        const arrayBuffer = reader.result as ArrayBuffer
        const uint8Array = new Uint8Array(arrayBuffer)
        setPreview(uint8Array)
      }
      reader.readAsArrayBuffer(file)
    }
  }

  const acceptedFileTypes: Accept = {
    'application/pdf': ['.pdf'],
  }

  const [form] = Form.useForm()

  const onAddSucess = () => {
    navigate('/ds')
  }

  const onSuccess = () => {
    setLoadingAction(false)
    const data = {
      step: ESteps.REDEX_FIELDS,
    }
    handleAPIRequests({
      request: makeStep,
      ...data,
      onSuccess: onAddSucess,
      notify: true,
    })
  }

  const onFinish = () => {
    if (!File) {
      return
    }
    setLoadingAction(true)
    const formData = new FormData()
    formData.append('file', File)

    const localToken = getFromLocal<string>('token')

    fetch(`${BASE_URL}/user/redex-file`, {
      headers: {
        authorization: `Bearer ${localToken}`,
      },
      method: 'POST',
      body: formData,
    })
      .then(() => {
        onSuccess()
      })
      .catch((err) => {
        if (err.statusCode === 401) {
          removeFromLocal('token')
          window.location.href = '/'
        }

        if (err?.data) {
          Notify({
            message: err?.data?.error || 'Error',
            description:
              typeof err?.data?.message === 'string'
                ? err?.data?.message
                : err?.data?.message?.length >= 1
                ? err?.data?.message[0]
                : 'Something went wrong. Please try again later!',
            type: 'error',
          })
        }
      })
  }

  return (
    <Form name='upload-info-form' form={form} onFinish={onFinish}>
      <div className='mb-6 p-5 rounded-xl border' style={{ background: 'var(--surface-overlay)', borderColor: 'var(--border)' }}>
        <div className='flex items-start gap-3'>
          <AlertCircle size={20} style={{ color: '#DEAF0B', marginTop: '2px' }} />
          <div>
            <h2 className='text-lg font-bold mb-2' style={{ color: 'var(--text-primary)' }}>Form Upload Instructions</h2>
            <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
              Please upload the signed form as a PDF file. This form is crucial to the REDEX process. Ensure the document is clear and correctly filled out. Once uploaded, click submit to proceed.
            </p>
          </div>
        </div>
      </div>

      <h2 className='text-lg font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>Upload Signed Form</h2>
      <div>
        <Dropzone
          multiple={false}
          onDrop={onDrop}
          onDragEnter={() => setIsDragging(true)}
          onDragLeave={() => setIsDragging(false)}
          accept={acceptedFileTypes}
        >
          {({ getRootProps, getInputProps }) => (
            <section
              className={`relative border-2 border-dashed rounded-xl w-full h-[300px] transition-all duration-200 cursor-pointer ${
                isDragging ? 'border-[#DEAF0B] bg-[rgba(222,175,11,0.05)]' : ''
              }`}
              style={{ borderColor: isDragging ? '#DEAF0B' : 'var(--border)', background: isDragging ? 'rgba(222,175,11,0.05)' : 'var(--surface-overlay)' }}
            >
              <div
                {...getRootProps({
                  className:
                    'text-center absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full',
                })}
              >
                <input {...getInputProps()} />
                {fileName.length > 0 ? (
                  <div className='font-bold flex flex-col gap-5 items-center'>
                    {preview && (
                      <RedexForm
                        file={preview}
                        className='h-[200px] w-[200px]'
                        noDisplay={true}
                      />
                    )}
                    <div className='flex items-center gap-2'>
                      <FileText size={20} style={{ color: '#DEAF0B' }} />
                      <p style={{ color: 'var(--text-primary)' }}>{fileName}</p>
                    </div>
                  </div>
                ) : (
                  <div className='flex flex-col items-center gap-4'>
                    <div className='w-16 h-16 rounded-xl flex items-center justify-center' style={{ background: 'rgba(222,175,11,0.1)' }}>
                      <Upload size={32} style={{ color: '#DEAF0B' }} />
                    </div>
                    <div>
                      <p className='font-semibold mb-1' style={{ color: 'var(--text-primary)' }}>
                        Drag and drop file here
                      </p>
                      <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
                        or click to select file
                      </p>
                    </div>
                    <p className='text-xs' style={{ color: 'var(--text-muted)' }}>
                      PDF files only
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}
        </Dropzone>
      </div>
    </Form>
  )
}

export default UploadForm
