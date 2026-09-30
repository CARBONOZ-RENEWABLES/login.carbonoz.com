import { DatePicker } from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import { ArrowDown, ArrowUp, ArrowUpDown, Download, FileSpreadsheet, FileText, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useDispatch } from 'react-redux'
import Notify from '../../../components/common/notification/notification'
import { Button, Card, cn, MenuItem, Popover, Segmented, Skeleton, StatusBadge } from '../../../design'
import { formatDate, Language, useI18n, useT } from '../../../i18n'
import type { AppDispatch } from '../../../lib/redux/store'
import { EnergyHistory, solarApi } from '../api'
import { bucketLabel, EnergyRow, formatKwh, formatPct, periodLabel, Resolution, toRow, totals } from '../energy'
import { download, EXPORT_COLUMNS, ExportColumn, Group, mergeWindows, normalizePeriod, Period, PresetId, presets, slug, toCsv, todayIn, windowsFor } from '../energyReport'
import { COLORS, SERIES_LABEL } from './energyStyle'

type SortKey = 'key' | ExportColumn

/** Picker input formats per language (the table itself uses Intl). */
const PICKER_FORMAT: Record<Language, Record<'date' | 'month' | 'year', string>> = {
  en: { date: 'DD/MM/YYYY', month: 'MMM YYYY', year: 'YYYY' },
  de: { date: 'DD.MM.YYYY', month: 'MMM YYYY', year: 'YYYY' },
  fr: { date: 'DD/MM/YYYY', month: 'MMM YYYY', year: 'YYYY' },
  es: { date: 'DD/MM/YYYY', month: 'MMM YYYY', year: 'YYYY' },
}
const COLUMNS: { key: ExportColumn; pct?: boolean }[] = EXPORT_COLUMNS.map((key) => ({ key, pct: key === 'coverage' }))

/** Today in the site's time zone, YYYY-MM-DD. */

/** Fetches the API windows covering a custom period (existing endpoint, cached per window). */
function useEnergyWindows(siteId: string, windows: { range: '30d' | '1y' | '10y'; anchor: string }[] | null) {
  const dispatch = useDispatch<AppDispatch>()
  const [state, setState] = useState<{ data?: EnergyHistory[]; error?: boolean; fetching: boolean }>({ fetching: false })
  const key = windows ? JSON.stringify(windows) : ''
  useEffect(() => {
    if (!windows) return
    const subs = windows.map((w) => dispatch(solarApi.endpoints.getSolarEnergy.initiate({ siteId, ...w })))
    let live = true
    setState((s) => ({ ...s, fetching: true, error: false }))
    Promise.all(subs.map((s) => s.unwrap()))
      .then((rs) => live && setState({ data: rs.map((r) => r.data), fetching: false }))
      .catch(() => live && setState((s) => ({ ...s, error: true, fetching: false })))
    return () => {
      live = false
      subs.forEach((s) => s.unsubscribe())
    }
    // `key` stands for `windows`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, key, dispatch])
  return state
}

function RowState({ r }: { r: EnergyRow }) {
  const t = useT()
  if (!r.hasData) return <span className='text-[11px] text-subtle'>{t('energy.noData')}</span>
  if (r.inProgress) return <StatusBadge tone='info'>{t('energy.inProgressShort')}</StatusBadge>
  if (r.incomplete) return <StatusBadge tone='warning'>{t('energy.incomplete')}</StatusBadge>
  return null
}

/**
 * Energy table: follows the chart range by default; users can pick any period
 * (presets or dates) and a resolution, sort, and export CSV or PDF.
 */
export function EnergyTable({ siteId, siteName, timezone, chartRows, chartRes }: { siteId: string; siteName: string; timezone: string; chartRows: EnergyRow[]; chartRes: Resolution }) {
  const { t, lang } = useI18n()
  const today = todayIn(timezone)
  const [custom, setCustom] = useState<{ group: Group; period: Period; preset?: PresetId } | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'key', dir: 'desc' })
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null)

  const windows = useMemo(() => (custom ? windowsFor(custom.period, custom.group) : null), [custom])
  const fetched = useEnergyWindows(siteId, windows)
  const res: Resolution = custom?.group ?? chartRes
  const rows: EnergyRow[] = useMemo(() => {
    if (!custom) return chartRows
    return fetched.data ? mergeWindows(fetched.data, custom.period, custom.group).map((b) => toRow(b)) : []
  }, [custom, chartRows, fetched.data])
  // Chart mode: the chart's buckets as a calendar period (keys, never UTC timestamps).
  const asDay = (k: string) => (k.length === 4 ? `${k}-01-01` : k.length === 7 ? `${k}-01` : k)
  const period: Period | null = custom?.period ?? (rows.length ? normalizePeriod({ from: asDay(rows[0].key), to: asDay(rows[rows.length - 1].key) }, res, today) : null)
  const loading = !!custom && !fetched.data && !fetched.error
  const updating = !!custom && fetched.fetching && !!fetched.data

  const sorted = useMemo(() => {
    const list = [...rows]
    const dir = sort.dir === 'asc' ? 1 : -1
    list.sort((a, b) => {
      if (sort.key === 'key') return (a.key < b.key ? -1 : 1) * dir
      const av = a[sort.key]
      const bv = b[sort.key]
      // Missing values always last.
      if (av == null) return bv == null ? 0 : 1
      if (bv == null) return -1
      return (av - bv) * dir
    })
    return list
  }, [rows, sort])
  const sum = useMemo(() => totals(rows), [rows])
  const incompleteCount = rows.filter((r) => r.incomplete).length

  const choose = (group: Group, p: Period, preset?: PresetId) => setCustom({ group, period: normalizePeriod(p, group, today), preset })
  const picker = res === 'day' ? 'date' : res
  const presetList = presets(today).filter((p) => p.group === res)

  const headers = () => ({
    period: t(res === 'day' ? 'energy.table.date' : res === 'month' ? 'energy.table.month' : 'energy.table.year'),
    columns: Object.fromEntries(COLUMNS.map((c) => [c.key, `${t(SERIES_LABEL[c.key])} (${c.pct ? '%' : 'kWh'})`])) as Record<ExportColumn, string>,
    completeness: t('energy.table.completeness'),
    state: t('energy.table.state'),
  })
  const periodText = period ? periodLabel([{ key: period.from }, { key: period.to }], 'day') : ''
  const meta = () => [
    `${t('energy.table.site')}: ${siteName}`,
    `${t('energy.table.period')}: ${periodText} (${t(`energy.table.groups.${res}`)})`,
    `${t('energy.table.timezone')}: ${timezone}`,
    `${t('energy.table.generated')}: ${formatDate(new Date(), { dateStyle: 'medium', timeStyle: 'short' })}`,
  ]
  const filename = (ext: string) => `carbonoz-energy-${slug(siteName)}-${period?.from ?? ''}_${period?.to ?? ''}.${ext}`
  const chronological = [...rows]

  const exportCsv = () => {
    download(filename('csv'), toCsv(chronological, headers(), meta()), 'text/csv;charset=utf-8')
  }
  const exportPdf = async () => {
    setExporting('pdf')
    try {
      const { exportPdf: make } = await import('../energyPdf')
      const h = headers()
      await make({
        filename: filename('pdf'),
        title: t('energy.table.reportTitle'),
        meta: meta(),
        head: [h.period, ...COLUMNS.map((c) => h.columns[c.key])],
        body: chronological.map((r) => [bucketLabel(r.key, res, 'long') + (r.inProgress ? ` (${t('energy.inProgressShort')})` : r.incomplete ? ` (${t('energy.incomplete')})` : ''), ...COLUMNS.map((c) => (c.pct ? formatPct(r[c.key]) : formatKwh(r[c.key], res)))]),
        foot: [t('energy.table.total'), ...COLUMNS.map((c) => (c.pct ? formatPct(sum[c.key]) : formatKwh(sum[c.key], res)))],
        note: t('energy.method'),
        pageLabel: (p, n) => t('energy.table.page', { p, n }),
      })
    } catch {
      Notify({ type: 'error', message: t('energy.table.exportFailed') })
    } finally {
      setExporting(null)
    }
  }

  const SortHead = ({ k, label, align = 'right' }: { k: SortKey; label: string; align?: 'left' | 'right' }) => {
    const active = sort.key === k
    const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
    return (
      <th scope='col' aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={cn('sticky top-0 z-10 whitespace-nowrap border-b border-line bg-panel-2 px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted', align === 'right' ? 'text-right' : 'text-left', k === 'key' && 'left-0 z-20')}>
        <button type='button' onClick={() => setSort((s) => ({ key: k, dir: s.key === k && s.dir === 'desc' ? 'asc' : 'desc' }))} className={cn('inline-flex items-center gap-1 hover:text-fg', active && 'text-fg')}>
          {align === 'right' && <Icon size={12} className={active ? 'opacity-100' : 'opacity-40'} />}
          {label}
          {align === 'left' && <Icon size={12} className={active ? 'opacity-100' : 'opacity-40'} />}
        </button>
      </th>
    )
  }
  const cell = (v: number | null, pct?: boolean) => (v == null ? <span className='text-subtle' title={t('energy.noData')}>—</span> : <span className='text-fg'>{pct ? formatPct(v) : formatKwh(v, res)}</span>)

  return (
    <Card className='p-0'>
      {/* Header and controls */}
      <div className='flex flex-col gap-3 border-b border-line px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between'>
        <div className='min-w-0'>
          <h3 className='text-[15px] font-semibold text-fg'>{t('energy.table.title')}</h3>
          <p className='text-[12px] text-muted'>
            {t(`energy.table.count.${res}`, { count: rows.length })} · {periodText} · {timezone}
            {incompleteCount > 0 && <> · {t('energy.table.incompleteCount', { count: incompleteCount })}</>}
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Segmented<Group>
            label={t('energy.table.groupBy')}
            value={res}
            onChange={(g) => period && choose(g, period)}
            options={[
              { id: 'day', label: t('energy.table.groups.day') },
              { id: 'month', label: t('energy.table.groups.month') },
              { id: 'year', label: t('energy.table.groups.year') },
            ]}
          />
          <div data-testid='energy-period' className='w-full sm:w-auto'>
          <DatePicker.RangePicker
            aria-label={t('energy.table.period')}
            picker={picker}
            format={PICKER_FORMAT[lang][picker]}
            value={period ? [dayjs(period.from), dayjs(period.to)] : null}
            allowClear={false}
            disabledDate={(d: Dayjs) => d.isAfter(dayjs(today), 'day')}
            presets={presetList.map((p) => ({ label: t(`energy.table.presets.${p.id}`), value: [dayjs(p.period.from), dayjs(p.period.to)] as [Dayjs, Dayjs] }))}
            onChange={(v) => {
              if (!v?.[0] || !v?.[1]) return
              const preset = presetList.find((p) => p.period.from === v[0]!.format('YYYY-MM-DD') && p.period.to === v[1]!.format('YYYY-MM-DD'))?.id
              choose(res, { from: v[0].format('YYYY-MM-DD'), to: v[1].format('YYYY-MM-DD') }, preset)
            }}
            className='h-9 w-full sm:w-[260px]'
          />
          </div>
          {custom && (
            <Button size='sm' variant='ghost' onClick={() => setCustom(null)} title={t('energy.table.followChart')}>
              <RotateCcw size={13} /> {t('energy.table.reset')}
            </Button>
          )}
          <Popover
            label={t('energy.table.export')}
            className='w-60'
            trigger={({ toggle, ref, ...aria }) => (
              <Button ref={ref} {...aria} onClick={toggle} variant='primary' size='md' disabled={!rows.length || exporting === 'pdf'}>
                <Download size={15} /> {exporting === 'pdf' ? t('energy.table.preparing') : t('energy.table.export')}
              </Button>
            )}
          >
            {(close) => (
              <>
                <MenuItem
                  icon={<FileSpreadsheet size={15} />}
                  onSelect={() => {
                    close()
                    exportCsv()
                  }}
                >
                  <span className='flex flex-col'>
                    <span>{t('energy.table.csv')}</span>
                    <span className='text-[11px] text-muted'>{t('energy.table.csvHint')}</span>
                  </span>
                </MenuItem>
                <MenuItem
                  icon={<FileText size={15} />}
                  onSelect={() => {
                    close()
                    exportPdf()
                  }}
                >
                  <span className='flex flex-col'>
                    <span>{t('energy.table.pdf')}</span>
                    <span className='text-[11px] text-muted'>{t('energy.table.pdfHint')}</span>
                  </span>
                </MenuItem>
              </>
            )}
          </Popover>
        </div>
      </div>

      {fetched.error && custom ? (
        <p className='px-4 py-6 text-center text-[13px] text-danger'>{t('energy.error')}</p>
      ) : loading ? (
        // Subtle skeleton while a new period loads for the first time; no spinner.
        <div className='grid gap-2 p-4'>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className='h-8 rounded-md' />
          ))}
        </div>
      ) : (
        <div className={cn('transition-opacity duration-200', updating && 'opacity-60')}>
          {/* Desktop / tablet: sortable table with sticky header, first column and totals */}
          <div className='hidden max-h-[560px] overflow-auto sm:block' data-testid='energy-table'>
            <table className='w-full min-w-[760px] border-separate border-spacing-0 text-[13px]'>
              <thead>
                <tr>
                  <SortHead k='key' label={t(res === 'day' ? 'energy.table.date' : res === 'month' ? 'energy.table.month' : 'energy.table.year')} align='left' />
                  {COLUMNS.map((c) => (
                    <SortHead key={c.key} k={c.key} label={t(SERIES_LABEL[c.key])} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.key} className={cn('group transition-colors hover:bg-panel-2/70', !r.hasData && 'text-subtle')}>
                    <td className='sticky left-0 whitespace-nowrap border-b border-line bg-panel px-3 py-2 group-hover:bg-panel-2'>
                      <span className='flex items-center gap-2'>
                        <span className='font-medium text-fg'>{bucketLabel(r.key, res, 'long')}</span>
                        <RowState r={r} />
                      </span>
                    </td>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className='tabular whitespace-nowrap border-b border-line px-3 py-2 text-right'>
                        {cell(r[c.key], c.pct)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot data-testid='energy-totals'>
                <tr>
                  <td className='sticky bottom-0 left-0 z-20 whitespace-nowrap border-t border-line-strong bg-panel-2 px-3 py-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-fg-2'>{t('energy.table.total')}</td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} className='tabular sticky bottom-0 z-10 whitespace-nowrap border-t border-line-strong bg-panel-2 px-3 py-2.5 text-right font-semibold text-fg'>
                      <span className='inline-flex items-center gap-1.5'>
                        <span className='h-2 w-2 rounded-sm' style={{ background: COLORS[c.key] }} aria-hidden />
                        {c.pct ? formatPct(sum[c.key]) : formatKwh(sum[c.key], res)}
                      </span>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Phones: one card per period, then the totals */}
          <ul className='grid gap-2 p-3 sm:hidden' data-testid='energy-cards'>
            {sorted.map((r) => (
              <li key={r.key} className='rounded-lg border border-line bg-panel-2 px-3 py-2.5'>
                <div className='flex items-center justify-between gap-2'>
                  <span className='text-[13px] font-medium text-fg'>{bucketLabel(r.key, res, 'long')}</span>
                  <RowState r={r} />
                </div>
                {r.hasData && (
                  <dl className='mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]'>
                    {COLUMNS.map((c) => (
                      <div key={c.key} className='flex min-w-0 justify-between gap-2'>
                        <dt className='truncate text-muted'>{t(SERIES_LABEL[c.key])}</dt>
                        <dd className='tabular shrink-0'>{cell(r[c.key], c.pct)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}
            <li className='rounded-lg border border-line-strong bg-panel px-3 py-2.5'>
              <p className='text-[12px] font-semibold uppercase tracking-[0.04em] text-fg-2'>{t('energy.table.total')}</p>
              <dl className='mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]'>
                {COLUMNS.map((c) => (
                  <div key={c.key} className='flex min-w-0 justify-between gap-2'>
                    <dt className='truncate text-muted'>{t(SERIES_LABEL[c.key])}</dt>
                    <dd className='tabular shrink-0 font-semibold text-fg'>{c.pct ? formatPct(sum[c.key]) : formatKwh(sum[c.key], res)}</dd>
                  </div>
                ))}
              </dl>
            </li>
          </ul>
        </div>
      )}
    </Card>
  )
}
