import { Cloud, CloudRain, CloudSun, MapPin, Moon, Sun } from 'lucide-react'
import { ReactNode, useMemo } from 'react'
import { Card, CardHeader, cn, EmptyState } from '../../../design'
import { SERIES } from '../../../design/theme'
import { formatFixed, translate as t } from '../../../i18n'
import { HistoryPoint } from '../../../services/energyFlow'
import { PanelDef } from '../../charts/panels'
import { TimeSeriesChart } from '../../charts/TimeSeriesChart'
import type { SiteWeather, WeatherHour } from '../api'

type Ready = Extract<SiteWeather, { available: true }>

/** Hour of day (0–23) at the site. */
const siteHour = (t: number, tz: string) => Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: tz }).format(t))
const siteDay = (t: number, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(t)

/** Weather of a few hours as one icon: rain, cloud, sun and cloud, sun (or moon at night). */
function weatherIcon(hours: WeatherHour[], night: boolean): { icon: ReactNode; label: string } {
  const avg = (k: keyof WeatherHour) => {
    const v = hours.map((h) => h[k]).filter((x): x is number => typeof x === 'number')
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  }
  const rain = hours.reduce((a, h) => a + (h.precipitationMm ?? 0), 0)
  const cloud = avg('cloudCoverPct') ?? 0
  if (rain >= 0.5) return { icon: <CloudRain size={22} className='text-[rgb(var(--c-cell-low))]' />, label: t('solar.weather.rain') }
  if (cloud >= 70) return { icon: <Cloud size={22} className='text-muted' />, label: t('solar.weather.cloudy') }
  if (cloud >= 30) return { icon: <CloudSun size={22} className={night ? 'text-muted' : 'text-solar'} />, label: t('solar.weather.partly') }
  return night ? { icon: <Moon size={20} className='text-muted' />, label: t('solar.weather.clear') } : { icon: <Sun size={22} className='text-solar' />, label: t('solar.weather.sunny') }
}

/** Legend for the generated (solid) / predicted (dashed) pair. */
function PvLegend() {
  return (
    <div className='mt-2 flex flex-wrap items-center gap-4 text-[11.5px] text-fg-2'>
      <span className='flex items-center gap-1.5'>
        <span className='h-[2px] w-5 rounded' style={{ background: SERIES.pv }} aria-hidden />
        {t('solar.weather.generated')}
      </span>
      <span className='flex items-center gap-1.5'>
        <span className='h-0 w-5 border-t-2 border-dashed' style={{ borderColor: SERIES.battPower }} aria-hidden />
        {t('solar.weather.predicted')}
      </span>
      <span className='flex items-center gap-1.5'>
        <span className='h-3 w-0 border-l-2 border-dashed border-[rgb(var(--c-danger))]' aria-hidden />
        {t('solar.weather.now')}
      </span>
    </div>
  )
}

const kwh = (v: number | null) => (v == null ? '—' : `${formatFixed(v, 1)} kWh`)

/**
 * "PV today" like the inverter app: yesterday / generated / remaining /
 * tomorrow, weather per part of the day, predicted vs generated with a now line.
 */
export function PvTodayCard({ w, compact = false }: { w: Ready; compact?: boolean }) {
  const now = Date.parse(w.now)
  const today = siteDay(now, w.timezone)
  const hours = useMemo(() => w.hourly.filter((h) => siteDay(h.t, w.timezone) === today), [w, today])
  const blocks = [0, 6, 12, 18].map((from) => {
    const hs = hours.filter((h) => {
      const x = siteHour(h.t, w.timezone)
      return x >= from && x < from + 6
    })
    return { from, ...weatherIcon(hs, from === 0 || from === 18) }
  })
  const d = w.days
  const pct = d.today.predictedKwh ? Math.min(100, ((d.today.generatedKwh ?? 0) / d.today.predictedKwh) * 100) : 0
  const data = hours.map((h) => ({ t: h.t, gen: h.pvW, pred: h.predictedW })) as unknown as HistoryPoint[]
  const panel: PanelDef = {
    id: 'pv-today',
    title: t('solar.weather.pvToday'),
    unit: 'kW',
    kind: 'line',
    series: [
      { key: 'gen', name: t('solar.weather.generated'), color: SERIES.pv },
      { key: 'pred', name: t('solar.weather.predicted'), color: SERIES.battPower, dashed: true },
    ],
    stats: [],
    decimals: 2,
    domain: [0, 'nice'],
  }
  return (
    <Card className='p-4'>
      <CardHeader title={t('solar.weather.pvToday')} subtitle={w.calibration ? undefined : t('solar.weather.calibrating')} />
      <div className='mt-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-x-3 gap-y-1 text-[12px]'>
        <div className='text-muted'>
          <p className='tabular text-[13px]'>{kwh(d.yesterday.generatedKwh)}</p>
          <p>{t('solar.weather.yesterday')}</p>
        </div>
        <div className='min-w-0'>
          <div className='flex items-baseline justify-between gap-2'>
            <span>
              <span className='tabular text-[15px] font-semibold text-fg'>{kwh(d.today.generatedKwh)}</span> <span className='text-muted'>{t('solar.weather.generated')}</span>
            </span>
            <span className='text-right'>
              <span className='tabular text-[13px] font-semibold text-fg'>{kwh(d.today.remainingKwh)}</span> <span className='text-muted'>{t('solar.weather.remaining')}</span>
            </span>
          </div>
          <div className='mt-1.5 h-2 overflow-hidden rounded-full bg-panel-3' role='progressbar' aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={t('solar.weather.ofPredicted')}>
            <div className='h-full rounded-full bg-solar' style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className='text-right text-muted'>
          <p className='tabular text-[13px]'>{kwh(d.tomorrow.predictedKwh)}</p>
          <p>{t('solar.weather.tomorrow')}</p>
        </div>
      </div>
      <ul className='mt-3 grid grid-cols-4 gap-2' aria-label={t('solar.weather.parts')}>
        {blocks.map((b) => (
          <li key={b.from} className='flex flex-col items-center gap-1 rounded-lg bg-panel-2 py-2' title={b.label}>
            {b.icon}
            <span className='tabular text-[10.5px] text-muted'>
              {String(b.from).padStart(2, '0')}–{String(b.from + 6).padStart(2, '0')}
            </span>
            <span className='sr-only'>{b.label}</span>
          </li>
        ))}
      </ul>
      {!compact && (
        <div className='mt-3 h-[200px]'>
          <TimeSeriesChart panel={panel} data={data} range='24h' marker={now} />
        </div>
      )}
      {!compact && <PvLegend />}
    </Card>
  )
}

function WeatherChart({ title, unit, color, rows, k, now, kind = 'area' }: { title: string; unit: PanelDef['unit']; color: string; rows: WeatherHour[]; k: keyof WeatherHour; now: number; kind?: PanelDef['kind'] }) {
  const panel: PanelDef = { id: String(k), title, unit, kind, series: [{ key: String(k), name: title, color }], stats: [], decimals: 1, domain: unit === '%' ? [0, 100] : ['nice', 'nice'] }
  return (
    <Card className='flex flex-col p-4'>
      <CardHeader title={title} subtitle={unit} />
      <div className='mt-3 h-[200px]'>
        <TimeSeriesChart panel={panel} data={rows as unknown as HistoryPoint[]} range='7d' marker={now} />
      </div>
    </Card>
  )
}

/** Weather charts from yesterday to tomorrow, and PV predicted vs generated over the same days. */
export function WeatherCharts({ w }: { w: Ready }) {
  const now = Date.parse(w.now)
  const pv: PanelDef = {
    id: 'pv-pred',
    title: t('solar.weather.pvPredicted'),
    unit: 'kW',
    kind: 'line',
    series: [
      { key: 'pvW', name: t('solar.weather.generated'), color: SERIES.pv },
      { key: 'predictedW', name: t('solar.weather.predicted'), color: SERIES.battPower, dashed: true },
    ],
    stats: [],
    decimals: 2,
    domain: [0, 'nice'],
  }
  return (
    <div className='grid gap-3 lg:grid-cols-2'>
      <Card className='flex flex-col p-4 lg:col-span-2'>
        <CardHeader title={t('solar.weather.pvPredicted')} subtitle={t('solar.weather.pvPredictedHint')} />
        <div className='mt-3 h-[240px]'>
          <TimeSeriesChart panel={pv} data={w.hourly as unknown as HistoryPoint[]} range='7d' marker={now} />
        </div>
        <PvLegend />
      </Card>
      <WeatherChart title={t('solar.weather.temperature')} unit='°C' color={SERIES.temp} rows={w.hourly} k='temperatureC' now={now} />
      <WeatherChart title={t('solar.weather.cloudCover')} unit='%' color='#64748b' rows={w.hourly} k='cloudCoverPct' now={now} />
      <WeatherChart title={t('solar.weather.wind')} unit='km/h' color={SERIES.voltage} rows={w.hourly} k='windSpeedKmh' now={now} />
      <WeatherChart title={t('solar.weather.irradiance')} unit='W/m²' color={SERIES.battPower} rows={w.hourly} k='irradianceWm2' now={now} />
    </div>
  )
}

/** Why there is no weather: location missing (admin sets it) or the weather service unreachable. */
export function WeatherUnavailable({ reason, className }: { reason: 'disabled' | 'no_location' | 'unavailable'; className?: string }) {
  return (
    <EmptyState
      className={cn(className)}
      icon={<MapPin size={18} />}
      title={reason === 'no_location' ? t('solar.weather.noLocation') : t('solar.weather.unavailable')}
      description={reason === 'no_location' ? t('solar.weather.noLocationHint') : t('solar.weather.unavailableHint')}
    />
  )
}
