import { FC, useEffect, useState } from 'react'
import Logo from '../../../assets/1.jpg'

interface AppLoaderProps {
  height?: string
  className?: string
}

const Loader: FC = () => (
  <div className='flex flex-col items-center gap-4' role='status' aria-label='Loading'>
    <div className='relative h-12 w-12'>
      <img src={Logo} alt='' className='absolute inset-[9px] h-[30px] w-[30px] rounded-[8px] object-cover' />
      <span className='absolute inset-0 animate-spin rounded-full border-2 border-line-strong border-t-accent' />
    </div>
    <span className='text-[12.5px] text-muted'>Loading…</span>
  </div>
)

export const AppLoader: FC<AppLoaderProps> = ({ height, className }) => (
  <div className={`${className ?? ''} flex w-full items-center justify-center`} style={{ height: height ?? '100dvh' }}>
    <Loader />
  </div>
)

export const GeneralContentLoader: FC<AppLoaderProps> = ({ height }) => (
  <div className='flex w-full items-center justify-center' style={{ height: height ?? '70vh' }}>
    <Loader />
  </div>
)

/** The main loading screen stays up at least this long when the app opens. */
export const MIN_LOADER_MS = 2500
const FADE_MS = 300
// Counted from the first time it shows (once per app session), so a re-mount
// (e.g. a language switch) neither restarts nor cuts it short.
let bootStart: number | null = null
const remaining = () => MIN_LOADER_MS - (performance.now() - (bootStart ??= performance.now()))

/**
 * Covers the page with the app loader for MIN_LOADER_MS when the dashboard
 * first opens (not on later navigation). The page renders underneath meanwhile, so
 * its data loads in parallel; the cover then fades out.
 */
export const BootLoader: FC = () => {
  const [phase, setPhase] = useState<'show' | 'fade' | 'gone'>(() => (remaining() > 0 ? 'show' : remaining() > -FADE_MS ? 'fade' : 'gone'))
  useEffect(() => {
    if (phase === 'gone') return
    const wait = phase === 'show' ? Math.max(0, remaining()) : Math.max(0, remaining() + FADE_MS)
    const timer = window.setTimeout(() => setPhase(phase === 'show' ? 'fade' : 'gone'), wait)
    return () => window.clearTimeout(timer)
  }, [phase])
  if (phase === 'gone') return null
  return (
    <div data-testid='boot-loader' className={`app-backdrop fixed inset-0 z-[2000] transition-opacity duration-300 ${phase === 'fade' ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
      <AppLoader />
    </div>
  )
}
