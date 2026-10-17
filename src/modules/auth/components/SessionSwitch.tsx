import { useAuth } from '@/shared/hooks/useAuth'
import { buttonClass, Button } from '@/shared/ui/Button'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { ArrowRight, LogOut } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

/**
 * Someone arrives at /login or /registro with a session already open on this device:
 * instead of sending them away, they choose — keep going with that account, or close
 * it here and use another (sign in with another account, or create a new business).
 * Closing it only signs out this app on this device; nothing else of the browser is cleared.
 */
export function SessionSwitch({
  title,
  description,
  continueTo,
  continueLabel,
  switchLabel,
  onSignedOut,
}: {
  title: string
  description: string
  continueTo: string
  continueLabel: string
  switchLabel: string
  onSignedOut?: () => void
}) {
  const { user, profile, signOut } = useAuth()
  const { show } = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const who = user?.email ?? user?.phone ?? profile?.fullName ?? 'tu cuenta'

  async function switchAccount() {
    setBusy(true)
    setError(null)
    const result = await signOut()
    setBusy(false)
    if (result?.error) {
      setError(result.error)
      return
    }
    show('Cerraste sesión. Ya puedes usar otra cuenta.', 'success')
    onSignedOut?.()
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className={typography.h2}>{title}</h1>
        <p className={`mt-1.5 ${typography.small}`}>{description}</p>
      </div>
      <p className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3 text-sm text-neutral-300">
        Sesión abierta como <span className="font-medium break-all text-neutral-50">{who}</span>
        {profile?.fullName && who !== profile.fullName && <span className="text-neutral-500"> · {profile.fullName}</span>}
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Link to={continueTo} className={buttonClass({ variant: 'primary', size: 'lg' })}>
          {continueLabel} <ArrowRight aria-hidden />
        </Link>
        <Button variant="secondary" size="lg" icon={LogOut} loading={busy} onClick={() => void switchAccount()}>
          {switchLabel}
        </Button>
      </div>
    </div>
  )
}
