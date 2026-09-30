import { memo, useId } from 'react'

type P = [number, number]
type Quad = [P, P, P, P] // [u0v0, u1v0, u1v1, u0v1]

const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const at = (q: Quad, u: number, v: number): P => lerp(lerp(q[0], q[1], u), lerp(q[3], q[2], u), v)
const sub = (q: Quad, u0: number, v0: number, u1: number, v1: number): Quad => [at(q, u0, v0), at(q, u1, v0), at(q, u1, v1), at(q, u0, v1)]
const pts = (ps: P[]) => ps.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')

// Geometry (viewBox 240 × 170)
const A: P = [52, 136] // front bottom-left
const B: P = [112, 143] // corner bottom
const C: P = [112, 88] // corner eave
const D: P = [82, 58] // front apex
const E: P = [52, 85] // front eave left
const F: P = [198, 129] // back bottom-right
const G: P = [198, 80] // back eave
const H: P = [168, 50] // ridge back
const I: P = [205, 83] // roof eave back (overhang)
const J: P = [115, 92] // roof eave front (overhang)

const frontFace: Quad = [E, C, B, A]
const sideWall: Quad = [C, G, F, B]
const roof: Quad = [D, H, I, J]
const panelArea = sub(roof, 0.07, 0.1, 0.95, 0.9)

const COLS = 7
const ROWS = 3

/** Home with rooftop PV, lit windows and garden (HomeOS illustration) — centre of the Energy Flow. */
export const HouseIllustration = memo(function HouseIllustration({ className, lit = true }: { className?: string; lit?: boolean }) {
  const id = useId().replace(/:/g, '')
  const g = (n: string) => `${id}-${n}`

  const panels: Quad[] = []
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) panels.push(sub(panelArea, c / COLS + 0.006, r / ROWS + 0.02, (c + 1) / COLS - 0.006, (r + 1) / ROWS - 0.02))

  const sideWindows: Quad[] = [sub(sideWall, 0.07, 0.2, 0.28, 0.6), sub(sideWall, 0.62, 0.2, 0.93, 0.6)]
  const door = sub(sideWall, 0.37, 0.3, 0.52, 1)
  const frontWindow = sub(frontFace, 0.2, 0.12, 0.8, 0.7)
  const gableWindow: P[] = [lerp(E, D, 0.55), lerp(D, C, 0.45), at(frontFace, 0.72, 0.02), at(frontFace, 0.28, 0.02)]

  return (
    <svg viewBox="0 0 240 170" className={className} role="img" aria-label="Home with rooftop solar panels">
      <defs>
        <radialGradient id={g('lawn')} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#3f9a4b" />
          <stop offset="70%" stopColor="#23692f" />
          <stop offset="100%" stopColor="#153f1d" />
        </radialGradient>
        <linearGradient id={g('glass')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe7a8" />
          <stop offset="100%" stopColor="#f6a431" />
        </linearGradient>
        <linearGradient id={g('pv')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3b67c9" />
          <stop offset="55%" stopColor="#1c3677" />
          <stop offset="100%" stopColor="#15285a" />
        </linearGradient>
        <linearGradient id={g('side')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3a4150" />
          <stop offset="100%" stopColor="#262b36" />
        </linearGradient>
        <linearGradient id={g('front')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8a6440" />
          <stop offset="100%" stopColor="#5a3f27" />
        </linearGradient>
        <radialGradient id={g('spill')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffb547" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffb547" stopOpacity="0" />
        </radialGradient>
        <filter id={g('glow')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* ground */}
      <ellipse cx="124" cy="151" rx="112" ry="17" fill="#0d2413" />
      <ellipse cx="124" cy="146" rx="110" ry="17" fill={`url(#${g('lawn')})`} />
      <path d="M150 140 L170 136 L196 160 L168 163 Z" fill="#8c8f96" opacity="0.45" />

      {/* back tree */}
      <rect x="31" y="112" width="3" height="22" rx="1" fill="#4a3522" />
      <circle cx="32" cy="104" r="16" fill="#1f6a2d" />
      <circle cx="26" cy="99" r="9" fill="#2b8a3b" />
      <rect x="215" y="104" width="2.4" height="30" rx="1" fill="#4a3522" />
      <ellipse cx="216" cy="98" rx="8" ry="22" fill="#1d5f29" />
      <ellipse cx="214" cy="93" rx="4" ry="14" fill="#2a8038" />

      {lit && <ellipse className="glow-pulse" cx="118" cy="146" rx="70" ry="12" fill={`url(#${g('spill')})`} />}

      {/* walls */}
      <polygon points={pts([E, D, C, B, A])} fill={`url(#${g('front')})`} />
      {[0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84].map((u) => (
        <line key={u} x1={lerp(E, C, u)[0]} y1={Math.max(lerp(E, D, u * 2)[1], lerp(D, C, (u - 0.5) * 2)[1])} x2={lerp(A, B, u)[0]} y2={lerp(A, B, u)[1]} stroke="#3f2b19" strokeWidth="0.5" opacity="0.6" />
      ))}
      <polygon points={pts(sideWall)} fill={`url(#${g('side')})`} />
      <polyline points={pts([at(sideWall, 0, 0.68), at(sideWall, 1, 0.68)])} stroke="#1c2029" strokeWidth="1" fill="none" />

      {/* windows */}
      <g filter={lit ? `url(#${g('glow')})` : undefined} opacity={lit ? 0.9 : 0}>
        <polygon points={pts(frontWindow)} fill="#ffb547" />
        {sideWindows.map((w, i) => (
          <polygon key={i} points={pts(w)} fill="#ffb547" />
        ))}
      </g>
      <polygon points={pts(frontWindow)} fill={lit ? `url(#${g('glass')})` : '#233049'} stroke="#1a1d24" strokeWidth="1.4" />
      <polyline points={pts([at(frontWindow, 0.5, 0), at(frontWindow, 0.5, 1)])} stroke="#1a1d24" strokeWidth="1.2" />
      <polyline points={pts([at(frontWindow, 0, 0.5), at(frontWindow, 1, 0.5)])} stroke="#1a1d24" strokeWidth="1.2" />
      <polygon points={pts(gableWindow)} fill={lit ? '#ffd27a' : '#233049'} stroke="#1a1d24" strokeWidth="1.2" opacity="0.95" />
      {sideWindows.map((w, i) => (
        <g key={i}>
          <polygon points={pts(w)} fill={lit ? `url(#${g('glass')})` : '#233049'} stroke="#15181f" strokeWidth="1.3" />
          <polyline points={pts([at(w, 0.5, 0), at(w, 0.5, 1)])} stroke="#15181f" strokeWidth="1.1" />
        </g>
      ))}
      <polygon points={pts(door)} fill="#1a1d24" />
      <polygon points={pts(sub(door, 0.14, 0.08, 0.86, 0.55))} fill={lit ? '#f7b447' : '#2a3448'} opacity="0.85" />

      {/* roof */}
      <polygon points={pts(roof)} fill="#161a22" />
      <polygon points={pts(panelArea)} fill="#0e1830" />
      {panels.map((p, i) => (
        <polygon key={i} points={pts(p)} fill={`url(#${g('pv')})`} stroke="#6f94e6" strokeWidth="0.35" strokeOpacity="0.8" />
      ))}
      <polygon points={pts(sub(panelArea, 0, 0, 1, 0.35))} fill="#ffffff" opacity="0.06" />
      <polyline points={pts([[E[0] - 7, E[1] + 3], D, J])} fill="none" stroke="#2c3240" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={pts([D, H])} fill="none" stroke="#2c3240" strokeWidth="2.5" strokeLinecap="round" />
      <polyline points={pts([J, I])} fill="none" stroke="#0b0d12" strokeWidth="1.6" />

      {/* garden */}
      <ellipse cx="60" cy="139" rx="12" ry="7" fill="#2a8a3a" />
      <ellipse cx="72" cy="143" rx="9" ry="5.5" fill="#1f6d2d" />
      <ellipse cx="186" cy="132" rx="11" ry="6.5" fill="#2a8a3a" />
      <ellipse cx="176" cy="136" rx="7" ry="4.5" fill="#35a046" />
      <ellipse cx="126" cy="147" rx="8" ry="4" fill="#2a8a3a" />
      <circle cx="98" cy="146" r="1.4" fill="#ffd27a" className="glow-pulse" />
      <circle cx="148" cy="143" r="1.4" fill="#ffd27a" className="glow-pulse" />
    </svg>
  )
})
