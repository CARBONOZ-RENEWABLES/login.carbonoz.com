import { FC, ReactElement } from 'react'
import { FormRow, FormSection, Segmented } from '../../../design'
import { useTheme } from '../../../lib/hooks/useTheme'
import { useT } from '../../../i18n'

const Settings: FC = (): ReactElement => {
  const { isDark, toggle } = useTheme()
  const t = useT()
  return (
    <div className='flex flex-col gap-4'>
      <FormSection title={t('settings.appearance')} description={t('settings.appearanceHint')}>
        <FormRow label={t('settings.theme')} hint={t('settings.themeHint')}>
          <Segmented
            label={t('settings.theme')}
            value={isDark ? 'dark' : 'light'}
            onChange={(v) => (v === 'dark') !== isDark && toggle()}
            options={[
              { id: 'light', label: t('settings.light') },
              { id: 'dark', label: t('settings.dark') },
            ]}
          />
        </FormRow>
      </FormSection>
    </div>
  )
}

export default Settings
