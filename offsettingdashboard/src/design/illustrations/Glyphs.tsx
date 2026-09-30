import { SVGProps } from 'react'

/** High-voltage transmission tower (Lucide has no pylon). */
export function PylonIcon({ size = 24, strokeWidth = 1.5, ...props }: SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={strokeWidth} strokeLinecap='round' strokeLinejoin='round' {...props}>
      <path d='M12 2 8 22M12 2l4 20M9.2 16h5.6M9.9 12h4.2M10.6 8h2.8' />
      <path d='M4 6h16M5 10h14M4 6l1 2M20 6l-1 2' />
      <path d='M8 22l6-6M16 22l-6-6M9.2 16l4.9-4M14.8 16 9.9 12' opacity='0.8' />
    </svg>
  )
}

/** Vertical battery with a live fill level. */
export function BatteryGlyph({
  level,
  width = 22,
  height = 36,
  color = 'rgb(var(--c-batt))',
  charging,
  className,
}: {
  level: number
  width?: number
  height?: number
  color?: string
  charging?: boolean
  className?: string
}) {
  const inner = Math.max(0, Math.min(1, level / 100))
  return (
    <svg width={width} height={height} viewBox='0 0 22 36' className={className} aria-hidden>
      <rect x='7' y='0.75' width='8' height='3' rx='1' fill={color} />
      <rect x='1.5' y='3.5' width='19' height='31.5' rx='4' fill='none' stroke={color} strokeWidth='1.6' />
      <rect x='4' y={6 + 26.5 * (1 - inner)} width='14' height={26.5 * inner} rx='2' fill={color} opacity='0.9' />
      {charging && <path d='M12.4 11 7.6 20h3.6l-1.2 6.5 5-9.3h-3.7z' fill='#0b1220' />}
    </svg>
  )
}
