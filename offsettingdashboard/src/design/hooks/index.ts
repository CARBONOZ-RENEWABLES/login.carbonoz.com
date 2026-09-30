import { translate } from '../../i18n'
import { RefObject, useCallback, useEffect, useState, useSyncExternalStore } from 'react'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', cb)
      return () => mql.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)')

/** Calls `handler` on pointer-down outside every ref while `active`. */
export function useClickOutside(refs: RefObject<HTMLElement>[], handler: () => void, active = true) {
  useEffect(() => {
    if (!active) return
    const onDown = (e: PointerEvent) => {
      if (refs.every((r) => !r.current || !r.current.contains(e.target as Node))) handler()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [refs, handler, active])
}

/** Native Fullscreen API with a CSS fallback (iOS Safari lacks element fullscreen). */
export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [native, setNative] = useState(false)
  const [fallback, setFallback] = useState(false)

  useEffect(() => {
    const onChange = () => setNative(document.fullscreenElement === ref.current && !!ref.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [ref])

  useEffect(() => {
    if (!fallback) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFallback(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fallback])

  const toggle = useCallback(async () => {
    const el = ref.current
    if (!el) return
    if (document.fullscreenElement) return void (await document.exitFullscreen())
    if (fallback) return setFallback(false)
    if (el.requestFullscreen) {
      try {
        await el.requestFullscreen()
        return
      } catch {
        /* fall through to CSS fallback */
      }
    }
    setFallback(true)
  }, [ref, fallback])

  return { isFullscreen: native || fallback, isFallback: fallback, toggle }
}

/** "Good morning / afternoon / evening", refreshed every minute. */
export function useGreeting() {
  const calc = () => {
    const h = new Date().getHours()
    if (h < 5) return translate('greeting.night')
    if (h < 12) return translate('greeting.morning')
    if (h < 18) return translate('greeting.afternoon')
    return translate('greeting.evening')
  }
  const [g, setG] = useState(calc)
  useEffect(() => {
    const id = setInterval(() => setG(calc()), 60_000)
    return () => clearInterval(id)
  }, [])
  return g
}
