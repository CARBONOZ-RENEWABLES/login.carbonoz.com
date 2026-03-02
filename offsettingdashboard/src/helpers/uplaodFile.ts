type UploadFileParams = {
  files: File[]
  setUploadLoading?: (loading: boolean) => void
  setUploadSuccess?: (success: boolean) => void
  setUploadFailure?: (failure: boolean) => void
  setImgURL?: (url: string | null) => void
}

const uploadFile = ({
  files = [],
  setUploadLoading = () => null,
  setUploadSuccess = () => null,
  setUploadFailure = () => null,
  setImgURL = () => null,
}: UploadFileParams): Promise<string[]> => {
  const CLAUD_NAME = import.meta.env.VITE_CLAUDINARY_CLAUD_NAME
  const PRESET = import.meta.env.VITE_CLAUDINARY_PRESET

  return new Promise((resolve, reject) => {
    if (!CLAUD_NAME || !PRESET) {
      console.error('Environment variables for Cloudinary are not set.')
      reject('Environment variables not set')
      return
    }
    setUploadLoading(true)
    const uploadPromises = files.map(async (file) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('upload_preset', PRESET)

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLAUD_NAME}/image/upload`,
        {
          method: 'POST',
          body: formData,
        }
      )
      const res_1 = await res.json()
      return res_1.secure_url
    })
    Promise.all(uploadPromises)
      .then((urls) => {
        setUploadLoading(false)
        setUploadFailure(false)
        setUploadSuccess(true)
        setImgURL(urls[0])
        resolve(urls)
      })
      .catch((error) => {
        setUploadLoading(false)
        setUploadFailure(true)
        setUploadSuccess(false)
        setImgURL(null)
        reject(error)
      })
  })
}

export default uploadFile
