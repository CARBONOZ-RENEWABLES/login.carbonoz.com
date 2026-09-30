import { useEffect, useRef, useState } from 'react'

/** Tweens between numeric values so live telemetry updates feel smooth. */
export function AnimatedNumber({ value, decimals = 1, duration = 450 }: { value: number; decimals?: number; duration?: number }) {
  const [display, setDisplay] = useState(value)
  const from = useRef(value)
  const shown = useRef(value)

  useEffect(() => {
    from.current = shown.current
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      shown.current = from.current + (value - from.current) * eased
      setDisplay(shown.current)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  return <>{display.toFixed(decimals)}</>
}
