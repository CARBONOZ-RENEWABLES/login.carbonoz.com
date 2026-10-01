import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'
const matches = () => typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches

/**
 * The user asked the system for less motion. CSS animations are already
 * stopped globally (index.css); this covers motion CSS can't reach, such as
 * SVG <animateMotion>.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(matches)
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY)
    if (!mq) return
    const on = () => setReduced(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduced
}
