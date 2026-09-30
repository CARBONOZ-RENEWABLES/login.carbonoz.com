import { BrandMark } from './AppShell'
import { ThemeToggle, UserMenu } from './HeaderControls'

/** Slim top bar for the onboarding flow (no navigation yet — the user has no system registered). */
export function OnboardingTopBar({ firstName, lastName }: { firstName?: string; lastName?: string }) {
  return (
    <header className='sticky top-0 z-30 flex shrink-0 items-center justify-between gap-3 border-b border-line bg-app/85 px-4 py-2.5 backdrop-blur-md sm:px-6' style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
      <div className='flex items-center gap-3'>
        <BrandMark size={28} />
        <span className='hidden rounded-full border border-line-strong bg-panel/60 px-2.5 py-0.5 text-[11.5px] font-medium text-muted sm:inline'>Setup</span>
      </div>
      <div className='flex items-center gap-1.5'>
        <ThemeToggle />
        <UserMenu firstName={firstName} lastName={lastName} />
      </div>
    </header>
  )
}
