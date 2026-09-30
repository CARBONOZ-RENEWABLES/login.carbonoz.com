import { House, Sun } from 'lucide-react'
import { BatteryGlyph, PylonIcon } from '../../../design'

/** Headline icons, identical to the dashboard metric cards. */
export const ICONS = {
  pv: <Sun size={34} strokeWidth={1.5} className='text-solar' />,
  load: <House size={32} strokeWidth={1.5} className='text-home' />,
  grid: <PylonIcon size={34} strokeWidth={1.3} className='text-fg-2' />,
  battery: (soc?: number) => <BatteryGlyph level={soc ?? 0} width={22} height={36} />,
}
