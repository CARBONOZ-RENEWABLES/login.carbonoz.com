import dayjs from 'dayjs'
import { saveAs } from 'file-saver'

interface FileDownloadProps {
  file: Blob
  name: string
  fileFormat?: string
}

export const handleFileDownload = ({
  file,
  name,
  fileFormat = 'csv',
}: FileDownloadProps): void => {
  const date = dayjs().format('YYYY-MM-DD')
  saveAs(file, `${name}-${date}.${fileFormat.toLowerCase()}`)
}
