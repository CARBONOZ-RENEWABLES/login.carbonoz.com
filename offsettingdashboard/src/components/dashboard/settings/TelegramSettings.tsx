import { ReactElement, useEffect, useState } from 'react'
import { Button, FormRow, FormSection, inputClass, StatusBadge, Switch } from '../../../design'
import { useT } from '../../../i18n'
import {
  TelegramLinkCode,
  TelegramPreferences,
  useCreateTelegramLinkCodeMutation,
  useGetTelegramQuery,
  useUnlinkTelegramMutation,
  useUpdateTelegramPreferencesMutation,
} from '../../../features/telegram/api'

type Toggle = 'notifyLowSoc' | 'notifyOffline' | 'notifyStale' | 'notifyAlarms' | 'notifyRecovery'
const TOGGLES: Toggle[] = ['notifyLowSoc', 'notifyOffline', 'notifyStale', 'notifyAlarms', 'notifyRecovery']

/** Settings → Telegram. Renders nothing while the integration is switched off on the server. */
export function TelegramSettings(): ReactElement | null {
  const t = useT()
  const { data, isLoading } = useGetTelegramQuery()
  const [createCode, { isLoading: creating }] = useCreateTelegramLinkCodeMutation()
  const [save, { isLoading: saving, isError: saveFailed }] = useUpdateTelegramPreferencesMutation()
  const [unlink, { isLoading: unlinking }] = useUnlinkTelegramMutation()
  const [code, setCode] = useState<TelegramLinkCode | null>(null)
  const [socDraft, setSocDraft] = useState('')

  const status = data?.data
  const link = status?.enabled ? status.link : null
  // Fresh server values replace the draft; once linked, the code is used up: hide it.
  useEffect(() => {
    setSocDraft(link ? String(link.lowSocPct) : '')
    if (link) setCode(null)
  }, [link])

  if (isLoading || !status?.enabled) return null
  const update = (p: Partial<TelegramPreferences>) => save(p)

  const toggleSite = (id: string) => {
    if (!link) return
    const ids = link.siteIds.includes(id) ? link.siteIds.filter((s) => s !== id) : [...link.siteIds, id]
    update({ siteIds: ids })
  }

  return (
    <FormSection
      title={t('settings.telegram.title')}
      description={t('settings.telegram.description')}
      action={
        <StatusBadge tone={link ? 'good' : 'neutral'} dot>
          {link ? t('settings.telegram.linked') : t('settings.telegram.notLinked')}
        </StatusBadge>
      }
    >
      {!status.notificationsEnabled && <p className='text-[12px] text-muted'>{t('settings.telegram.notificationsOff')}</p>}

      {!link && (
        <FormRow label={t('settings.telegram.connect')} hint={t('settings.telegram.connectHint')}>
          <Button variant='primary' size='sm' loading={creating} onClick={async () => setCode((await createCode().unwrap()).data)}>
            {code ? t('settings.telegram.newCode') : t('settings.telegram.createCode')}
          </Button>
        </FormRow>
      )}
      {!link && code && (
        <div className='rounded-lg border border-line bg-panel-2 px-3.5 py-3 text-[13px] text-fg'>
          {code.deepLink && (
            <p>
              <a className='font-medium text-accent-ink underline' href={code.deepLink} target='_blank' rel='noreferrer'>
                {t('settings.telegram.openBot')}
              </a>
            </p>
          )}
          <p className='mt-1 text-muted'>
            {t('settings.telegram.orSend')} <code className='rounded bg-panel-3 px-1.5 py-0.5 font-mono text-fg'>/link {code.code}</code>
          </p>
          <p className='mt-1 text-[11.5px] text-subtle'>
            {t('settings.telegram.expires', { time: new Date(code.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}
          </p>
        </div>
      )}

      {link && (
        <>
          <FormRow label={t('settings.telegram.notify')} hint={t('settings.telegram.notifyHint')}>
            <Switch label={t('settings.telegram.notify')} checked={link.notify} disabled={saving} onChange={(v) => update({ notify: v })} />
          </FormRow>
          {link.notify && (
            <>
              {TOGGLES.map((k) => (
                <FormRow key={k} label={t(`settings.telegram.kinds.${k}`)}>
                  <Switch label={t(`settings.telegram.kinds.${k}`)} checked={link[k]} disabled={saving} onChange={(v) => update({ [k]: v })} />
                </FormRow>
              ))}
              <FormRow label={t('settings.telegram.lowSoc')} hint={t('settings.telegram.lowSocHint')}>
                <input
                  className={`${inputClass} w-20`}
                  type='number'
                  min={5}
                  max={95}
                  value={socDraft}
                  aria-label={t('settings.telegram.lowSoc')}
                  onChange={(e) => setSocDraft(e.target.value)}
                  onBlur={() => {
                    const n = Number(socDraft)
                    if (Number.isInteger(n) && n >= 5 && n <= 95 && n !== link.lowSocPct) update({ lowSocPct: n })
                    else setSocDraft(String(link.lowSocPct))
                  }}
                />
              </FormRow>
              {status.sites.length > 0 && (
                <div className='rounded-lg border border-line bg-panel-2 px-3.5 py-3'>
                  <p className='text-[13px] text-fg'>{t('settings.telegram.sites')}</p>
                  <p className='text-[11.5px] text-muted'>
                    {status.mustChooseSites ? t('settings.telegram.sitesAdminHint') : t('settings.telegram.sitesHint')}
                  </p>
                  <div className='mt-2 flex flex-wrap gap-2'>
                    {status.sites.map((s) => (
                      <label key={s.id} className='flex items-center gap-1.5 text-[12.5px] text-fg-2'>
                        <input type='checkbox' checked={link.siteIds.includes(s.id)} disabled={saving} onChange={() => toggleSite(s.id)} />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {saveFailed && <p className='text-[12px] text-danger'>{t('settings.telegram.saveFailed')}</p>}
          <div>
            <Button variant='danger' size='sm' loading={unlinking} onClick={() => unlink()}>
              {t('settings.telegram.unlink')}
            </Button>
          </div>
        </>
      )}
    </FormSection>
  )
}
