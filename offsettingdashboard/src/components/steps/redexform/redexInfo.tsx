import { Viewer, Worker } from '@react-pdf-viewer/core'
import '@react-pdf-viewer/core/lib/styles/index.css'
import { FC, ReactElement } from 'react'
import { AlertCircle } from 'lucide-react'
import { Callout } from '../../../design'
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
          <Callout title='Important information' icon={<AlertCircle size={14} />}>
            Please download this form, sign it, and submit it as part of the REDEX process. It is an essential step to proceed further. Failure to sign and submit the form may result in delays in your REDEX submission.
          </Callout>

          <Worker workerUrl={PdfJsWorker}>
            <div className={`${className ? className : 'h-[400px] sm:h-[550px] w-full max-w-4xl'} mx-auto overflow-hidden rounded-xl border border-line bg-panel-2`}>
              <Viewer fileUrl={file ? file : pdf} plugins={[]} />
            </div>
          </Worker>
        </>
      )}
    </>
  )
}

export default RedexForm
