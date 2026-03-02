import { Viewer, Worker } from '@react-pdf-viewer/core'
import '@react-pdf-viewer/core/lib/styles/index.css'
import { FC, ReactElement } from 'react'
import { AlertCircle } from 'lucide-react'
import PdfJsWorker from '../../../../node_modules/pdfjs-dist/build/pdf.worker?url'
import pdf from '../../../assets/redex-form/Template.pdf'

interface props {
  className?: string
  file?: Uint8Array
  noDisplay?: boolean
}

const RedexForm: FC<props> = ({ className, file, noDisplay }): ReactElement => {
  return (
    <>
      {noDisplay ? (
        <Worker workerUrl={PdfJsWorker}>
          <div className={`${className ? className : 'h-[550px] w-full max-w-4xl'} mx-auto`}>
            <Viewer fileUrl={file ? file : pdf} plugins={[]} />
          </div>
        </Worker>
      ) : (
        <>
          <div className='mb-6 p-4 sm:p-5 rounded-xl border' style={{ background: 'var(--surface-overlay)', borderColor: 'var(--border)' }}>
            <div className='flex items-start gap-3'>
              <AlertCircle size={20} style={{ color: '#DEAF0B', marginTop: '2px', flexShrink: 0 }} />
              <div>
                <h2 className='text-base sm:text-lg font-bold mb-2' style={{ color: 'var(--text-primary)' }}>Important Information</h2>
                <p className='text-xs sm:text-sm' style={{ color: 'var(--text-secondary)' }}>
                  Please download this form, sign it, and submit it as part of the REDEX process. It is an essential step to proceed further. Failure to sign and submit the form may result in delays in your REDEX submission.
                </p>
              </div>
            </div>
          </div>

          <Worker workerUrl={PdfJsWorker}>
            <div className={`${className ? className : 'h-[400px] sm:h-[550px] w-full max-w-4xl'} mx-auto rounded-xl overflow-hidden border`} style={{ borderColor: 'var(--border)' }}>
              <Viewer fileUrl={file ? file : pdf} plugins={[]} />
            </div>
          </Worker>
        </>
      )}
    </>
  )
}

export default RedexForm
