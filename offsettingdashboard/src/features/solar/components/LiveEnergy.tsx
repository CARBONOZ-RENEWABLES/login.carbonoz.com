import { Percent } from 'lucide-react'
import { ReactNode } from 'react'
import { translate as t } from '../../../i18n'
import { relativeTime } from '../../../layout/ShellContext'
import { SolarOverview, useGetSolarEnergyQuery } from '../api'
import { formatKwh, formatPct, pvCoverage, toRow } from '../energy'
import { headline, metricCardProps, SiteModel, SOLAR_SIGN } from '../model'
import { MetricCard } from './cards'
import { ICONS } from './icons'

/** Positive part of a signed power in the normalised convention (W), or undefined. */
const part = (w: number | undefined, positiveMeans: boolean, want: boolean) => (w == null ? undefined : Math.max(0, (positiveMeans ? w : -w) * (want ? 1 : -1)))

/**
 * Live energy cards: what flows right now (SolarBMS system totals) with
 * today's energy so far underneath. Delayed data is labelled, never shown as current.
 */
export function LiveEnergy({ siteId, o, site }: { siteId: string; o: SolarOverview; site: SiteModel }) {
  const h = headline(site)
  const today = useGetSolarEnergyQuery({ siteId, range: '30d' })
  const buckets = today.data?.data.buckets
  const day = buckets?.length ? toRow(buckets[buckets.length - 1]) : undefined

  const gridImport = part(h.grid, SOLAR_SIGN.gridImportPositive, true)
  const gridExport = part(h.grid, SOLAR_SIGN.gridImportPositive, false)
  const charging = part(h.battery, SOLAR_SIGN.batteryChargingPositive, true)
  const discharging = part(h.battery, SOLAR_SIGN.batteryChargingPositive, false)
  const coverage = pvCoverage(h.load ?? null, gridImport ?? null)

  const stale = (o.stale || h.allStale) && o.updatedAt ? t('solar.lastReading', { when: relativeTime(Date.parse(o.updatedAt)) }) : null
  const todayHint = (v: string | null) => stale ?? (day && v != null ? t('energy.live.today', { value: v }) : t('energy.live.now'))
  const tone = stale ? 'text-gridp' : undefined

  const cards: ReactNode[] = [
    <MetricCard key='pv' icon={ICONS.pv} label={t('energy.pv')} {...metricCardProps('pv_power_w', h.pv)} hint={todayHint(day?.pv != null ? formatKwh(day.pv, 'month') : null)} tone={tone ?? (h.pv != null && h.pv > 20 ? 'text-batt' : undefined)} />,
    <MetricCard key='load' icon={ICONS.load} label={t('energy.consumption')} {...metricCardProps('load_power_w', h.load)} hint={todayHint(day?.consumption != null ? formatKwh(day.consumption, 'month') : null)} tone={tone} />,
    <MetricCard
      key='grid'
      icon={ICONS.grid}
      label={t('energy.gridImport')}
      {...metricCardProps('grid_power_w', gridImport)}
      hint={!stale && gridExport != null && gridExport > 20 ? t('energy.live.exporting', { value: metricCardProps('grid_power_w', gridExport).value + ' ' + metricCardProps('grid_power_w', gridExport).unit }) : todayHint(day?.gridImport != null ? formatKwh(day.gridImport, 'month') : null)}
      tone={tone}
    />,
    <MetricCard key='chg' icon={ICONS.battery(h.soc)} label={t('energy.batteryCharged')} {...metricCardProps('battery_power_w', charging)} hint={todayHint(day?.batteryCharged != null ? formatKwh(day.batteryCharged, 'month') : null)} tone={tone ?? (charging != null && charging > 20 ? 'text-batt' : undefined)} />,
    <MetricCard key='dis' icon={ICONS.battery(h.soc)} label={t('energy.batteryDischarged')} {...metricCardProps('battery_power_w', discharging)} hint={todayHint(day?.batteryDischarged != null ? formatKwh(day.batteryDischarged, 'month') : null)} tone={tone} />,
    <MetricCard
      key='cov'
      icon={<Percent size={30} strokeWidth={1.6} className='text-batt' />}
      label={t('energy.coverage')}
      value={coverage == null ? '—' : formatPct(coverage).replace(/\s?%$/, '')}
      unit={coverage == null ? undefined : '%'}
      hint={stale ?? (day?.coverage != null ? t('energy.live.today', { value: formatPct(day.coverage) }) : t('energy.live.now'))}
      tone={tone}
    />,
  ]

  return (
    <section aria-label={t('energy.live.title')} className='grid grid-cols-2 gap-3 sm:grid-cols-3 min-[1700px]:grid-cols-6'>
      {cards}
    </section>
  )
}
