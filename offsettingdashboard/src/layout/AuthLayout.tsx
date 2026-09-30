import { motion } from 'framer-motion'
import { BatteryCharging, Leaf, Sun } from 'lucide-react'
import { ReactNode } from 'react'
import Photo from '../assets/3-modified.jpg'
import { BrandMark } from './AppShell'
import { ThemeToggle } from './HeaderControls'

/** Sign-in / sign-up frame: form card on the left, CARBONOZ imagery on wide screens. */
export function AuthLayout({ title, subtitle, children, footer }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className='flex min-h-dvh w-full text-fg'>
      <div className='relative flex min-w-0 flex-1 flex-col px-5 py-6 sm:px-10'>
        <div className='flex items-center justify-between'>
          <BrandMark size={30} />
          <ThemeToggle />
        </div>
        <div className='flex flex-1 items-center justify-center py-10'>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className='w-full max-w-[400px]'>
            <h1 className='text-[24px] font-semibold tracking-[-0.02em] text-fg'>{title}</h1>
            {subtitle && <p className='mt-1.5 text-[13.5px] leading-relaxed text-fg-2'>{subtitle}</p>}
            <div className='mt-7 rounded-2xl border border-line bg-panel p-5 shadow-card sm:p-6'>{children}</div>
            {footer && <div className='mt-5 text-center text-[13px] text-muted'>{footer}</div>}
          </motion.div>
        </div>
        <p className='text-center text-[11.5px] text-subtle'>CARBONOZ Renewables · Intelligent solar energy management</p>
      </div>

      <aside className='relative hidden w-[46%] max-w-[760px] overflow-hidden lg:block'>
        <img src={Photo} alt='' className='absolute inset-0 h-full w-full object-cover' />
        <div className='absolute inset-0 bg-gradient-to-t from-[#060a14]/90 via-[#060a14]/35 to-[#060a14]/10' />
        <div className='absolute inset-x-0 bottom-0 p-10 text-white'>
          <p className='max-w-md text-[26px] font-semibold leading-tight tracking-[-0.02em]'>See every watt your solar system produces, stores and saves.</p>
          <ul className='mt-6 grid max-w-md grid-cols-3 gap-3'>
            {[
              { icon: <Sun size={18} className='text-[#f7c948]' />, label: 'Live solar flow' },
              { icon: <BatteryCharging size={18} className='text-[#2fd46e]' />, label: 'AI battery charging' },
              { icon: <Leaf size={18} className='text-[#2fd46e]' />, label: 'Carbon impact' },
            ].map((f) => (
              <li key={f.label} className='rounded-xl border border-white/15 bg-white/10 px-3 py-3 text-[12px] font-medium backdrop-blur-md'>
                {f.icon}
                <span className='mt-2 block'>{f.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  )
}
