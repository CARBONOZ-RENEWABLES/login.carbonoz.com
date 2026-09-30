import { Form } from 'antd'
import { FC, ReactElement, useState } from 'react'
import Dropzone, { Accept } from 'react-dropzone'
import { useNavigate } from 'react-router-dom'
import { Upload, FileText, AlertCircle } from 'lucide-react'
import { ESteps } from '../../../config/constant'
import handleAPIRequests from '../../../helpers/handleApiRequest'
import { removeFromLocal } from '../../../helpers/handleStorage'
import { API_CREDENTIALS, authHeaders, loginRedirect } from '../../../lib/auth/session'
import Notify from '../../common/notification/notification'
import { Callout } from '../../../design'
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

    fetch(`${BASE_URL}/user/redex-file`, {
      credentials: API_CREDENTIALS,
      headers: authHeaders(),
      method: 'POST',
      body: formData,
    })
      .then(() => {
        onSuccess()
      })
      .catch((err) => {
        if (err.statusCode === 401) {
          removeFromLocal('token')
          loginRedirect()
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
      <Callout title='Form upload instructions' icon={<AlertCircle size={14} />}>
        Please upload the signed form as a PDF file. This form is crucial to the REDEX process. Ensure the document is clear and correctly filled out. Once uploaded, click submit to proceed.
      </Callout>

      <h2 className='mb-3 text-[14px] font-semibold text-fg'>Upload signed form</h2>
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
              className={`relative h-[260px] w-full cursor-pointer rounded-xl border-2 border-dashed transition-colors duration-200 sm:h-[300px] ${
                isDragging ? 'border-accent bg-accent/10' : 'border-line-strong bg-panel-2 hover:border-accent/60 hover:bg-accent/5'
              }`}
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
                      <FileText size={20} className='text-brand' />
                      <p style={{ color: 'var(--text-primary)' }}>{fileName}</p>
                    </div>
                  </div>
                ) : (
                  <div className='flex flex-col items-center gap-4'>
                    <div className='grid h-14 w-14 place-items-center rounded-2xl bg-accent/15'>
                      <Upload size={26} className='text-accent-ink' />
                    </div>
                    <div>
                      <p className='mb-1 text-[14px] font-medium text-fg'>
                        Drag and drop your signed PDF here
                      </p>
                      <p className='text-[12.5px] text-muted'>
                        or click to choose a file
                      </p>
                    </div>
                    <p className='rounded-full border border-line-strong px-2.5 py-0.5 text-[11px] text-muted'>
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
