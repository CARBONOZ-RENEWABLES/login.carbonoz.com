import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react'
import { cn, Segmented } from '../../../design'
import { getLocale, translate as t } from '../../../i18n'
import { canGoForward, step, TimeWindow, WINDOW_PRESETS, windowBounds, WindowPreset, zoom } from '../timeWindow'

const btn = 'grid h-8 w-8 place-items-center rounded-lg border border-line-strong text-fg-2 hover:bg-panel-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40'

/** "22 Oct 2026", "15 Oct – 22 Oct 2026" or "22 Oct, 09:00 – 15:00" for the window shown. */
function windowLabel(w: TimeWindow) {
  const { from, to } = windowBounds(w)
  const loc = getLocale()
  const day = (ms: number, year = true) => new Date(ms).toLocaleDateString(loc, { day: 'numeric', month: 'short', ...(year && { year: 'numeric' }) })
  const time = (ms: number) => new Date(ms).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })
  if (w.preset === 'today') return w.offset === 0 ? t('solar.window.today') : w.offset === 1 ? t('solar.window.yesterday') : day(from)
  if (w.offset === 0) return t('solar.window.last', { range: t(`solar.ranges.${w.preset}`) })
  if (to - from <= 24 * 3600e3) return `${day(from, false)}, ${time(from)} – ${time(to)}`
  return `${day(from, false)} – ${day(to)}`
}

/** Range presets, previous/next window, zoom out/in — one control for every chart on the page. */
export function WindowPicker({ value, onChange }: { value: TimeWindow; onChange: (w: TimeWindow) => void }) {
  const zin = zoom(value, 'in')
  const zout = zoom(value, 'out')
  return (
    <div className='flex flex-wrap items-center gap-2'>
      <Segmented<WindowPreset> options={WINDOW_PRESETS.map((id) => ({ id, label: t(`solar.ranges.${id}`) }))} value={value.preset} onChange={(preset) => onChange({ preset, offset: 0 })} label={t('solar.timeRange')} />
      <div className='flex items-center gap-1'>
        <button type='button' className={btn} onClick={() => onChange(step(value, -1))} aria-label={t('solar.window.previous')} title={t('solar.window.previous')}>
          <ChevronLeft size={16} />
        </button>
        <span className={cn('tabular min-w-[9rem] px-1 text-center text-[12.5px] font-medium text-fg-2')} aria-live='polite'>
          {windowLabel(value)}
        </span>
        <button type='button' className={btn} onClick={() => onChange(step(value, 1))} disabled={!canGoForward(value)} aria-label={t('solar.window.next')} title={t('solar.window.next')}>
          <ChevronRight size={16} />
        </button>
        <button type='button' className={btn} onClick={() => zout && onChange(zout)} disabled={!zout} aria-label={t('solar.window.zoomOut')} title={t('solar.window.zoomOut')}>
          <ZoomOut size={15} />
        </button>
        <button type='button' className={btn} onClick={() => zin && onChange(zin)} disabled={!zin} aria-label={t('solar.window.zoomIn')} title={t('solar.window.zoomIn')}>
          <ZoomIn size={15} />
        </button>
      </div>
    </div>
  )
}
