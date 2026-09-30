import { FC, ReactElement } from 'react'
import { FormRow, FormSection, Segmented } from '../../../design'
import { useTheme } from '../../../lib/hooks/useTheme'

const Settings: FC = (): ReactElement => {
  const { isDark, toggle } = useTheme()
  return (
    <div className='flex flex-col gap-4'>
      <FormSection title='Appearance' description='How CARBONOZ looks on this device.'>
        <FormRow label='Theme' hint='Dark is easier on the eyes for wall-mounted displays.'>
          <Segmented
            label='Theme'
            value={isDark ? 'dark' : 'light'}
            onChange={(t) => (t === 'dark') !== isDark && toggle()}
            options={[
              { id: 'light', label: 'Light' },
              { id: 'dark', label: 'Dark' },
            ]}
          />
        </FormRow>
      </FormSection>
    </div>
  )
}

export default Settings
