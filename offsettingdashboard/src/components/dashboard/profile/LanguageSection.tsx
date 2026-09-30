import { Languages } from 'lucide-react'
import { FC } from 'react'
import { FormRow, FormSection, inputClass } from '../../../design'
import { Language, LANGUAGES, useI18n } from '../../../i18n'
import { store } from '../../../lib/redux/store'
import { userApi } from '../../../lib/api/user/userEndPoints'
import Notify from '../../common/notification/notification'

/**
 * Application language. Switches the whole UI immediately (no reload) and
 * saves the choice on this device and, when the account has profile
 * information, in the profile (`customerLanguage`) so other devices follow.
 */
const LanguageSection: FC<{ canSaveToProfile: boolean }> = ({ canSaveToProfile }) => {
  const { lang, t, setLanguage } = useI18n()

  const choose = (next: Language) => {
    if (next === lang) return
    if (canSaveToProfile) {
      // Dispatched on the store so it completes even though the page re-renders in the new language.
      store
        .dispatch(userApi.endpoints.editAdditionalInfo.initiate({ customerLanguage: next }))
        .unwrap()
        .catch(() => Notify({ type: 'warning', message: t('profile.language.notSavedTitle'), description: t('profile.language.notSaved') }))
    }
    setLanguage(next)
  }

  return (
    <FormSection title={t('profile.language.title')} description={t('profile.language.description')}>
      <FormRow label={t('profile.language.label')} hint={t('profile.language.hint')}>
        <label className='relative block w-full sm:w-60'>
          <span className='sr-only'>{t('profile.language.label')}</span>
          <Languages size={15} className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle' aria-hidden />
          <select data-testid='language-select' className={`${inputClass} pl-9`} value={lang} onChange={(e) => choose(e.target.value as Language)}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} {l.label}
              </option>
            ))}
          </select>
        </label>
      </FormRow>
    </FormSection>
  )
}

export default LanguageSection
