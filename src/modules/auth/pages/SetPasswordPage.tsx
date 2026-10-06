import { useAuth } from '@/shared/hooks/useAuth'
import { APP_ENTRY } from '@/shared/tenant/navigation'
import { supabase } from '@/shared/lib/supabase'
import { Button } from '@/shared/ui/Button'
import { FormField, Input } from '@/shared/ui/FormField'
import { typography } from '@/shared/ui/typography'
import { AlertTriangle, CheckCircle2, Flame, KeyRound } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

/** One verification per link, even if the page mounts twice. */
const verifications = new Map<string, Promise<boolean>>()
function verifyRecoveryLink(tokenHash: string): Promise<boolean> {
  let pending = verifications.get(tokenHash)
  if (!pending) {
    pending = supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }).then(({ error }) => !error)
    verifications.set(tokenHash, pending)
  }
  return pending
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-brasa-500 shadow-[0_8px_24px_-8px_var(--color-brasa-500)]">
            <Flame size={24} className="text-white" strokeWidth={2.5} aria-hidden />
          </span>
        </div>
        <div className="space-y-5 rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-6">{children}</div>
      </div>
    </div>
  )
}

/**
 * Create or change the password from a link shared by the platform (ADR 0019,
 * "Enlace para crear contraseña"): /set-password?token_hash=…&type=recovery.
 * The page opens the session with the link (single use) and the person types
 * their own password; nobody else ever sees it.
 */
export function SetPasswordPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const tokenHash = params.get('token_hash')
  const [linkFailed, setLinkFailed] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!tokenHash) return
    let active = true
    void verifyRecoveryLink(tokenHash).then((ok) => {
      if (!active) return
      setLinkFailed(!ok)
      navigate('/set-password', { replace: true })
    })
    return () => {
      active = false
    }
  }, [tokenHash, navigate])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setBusy(true)
    setError(null)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (updateError) {
      setError(/different from the old/i.test(updateError.message) ? 'Usa una contraseña distinta a la anterior.' : updateError.message)
      return
    }
    setDone(true)
  }

  if (tokenHash || loading) {
    return (
      <Shell>
        <p className={typography.small}>Verificando el enlace…</p>
      </Shell>
    )
  }

  if (done) {
    return (
      <Shell>
        <p className="flex items-center gap-2 font-medium text-neutral-100">
          <CheckCircle2 size={16} className="text-emerald-400" aria-hidden /> Contraseña guardada
        </p>
        <p className={typography.small}>Desde ahora entras a Quanela con tu correo y esta contraseña.</p>
        <Button variant="primary" size="lg" className="w-full" onClick={() => navigate(APP_ENTRY, { replace: true })}>
          Entrar a Quanela
        </Button>
      </Shell>
    )
  }

  if (!session) {
    return (
      <Shell>
        <p className="flex items-center gap-2 font-medium text-neutral-100">
          <AlertTriangle size={16} className="text-amber-400" aria-hidden /> {linkFailed ? 'El enlace ya se usó o venció' : 'Enlace no válido'}
        </p>
        <p className={typography.small}>Los enlaces para crear contraseña son de un solo uso y vencen en poco tiempo. Pide uno nuevo a quien te lo envió.</p>
        <Link to="/login" className="block text-sm text-brasa-400 hover:underline">
          Ir a iniciar sesión
        </Link>
      </Shell>
    )
  }

  return (
    <Shell>
      <div>
        <p className={typography.overline}>Tu contraseña</p>
        <h1 className={`mt-1 ${typography.h2}`}>Crea tu contraseña</h1>
        <p className={`mt-1 ${typography.small}`}>{session.user.email}</p>
      </div>
      <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <FormField label="Nueva contraseña" required hint="Mínimo 8 caracteres.">
          {(a11y) => <Input {...a11y} type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />}
        </FormField>
        <FormField label="Repítela" required error={error}>
          {(a11y) => <Input {...a11y} type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
        </FormField>
        <Button type="submit" variant="primary" size="lg" icon={KeyRound} className="w-full" loading={busy} disabled={password.length < 8 || confirm.length < 8}>
          Guardar contraseña
        </Button>
      </form>
    </Shell>
  )
}
