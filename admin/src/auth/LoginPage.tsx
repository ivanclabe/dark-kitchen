import { Button } from '@/shared/ui/Button'
import { signInErrorMessage } from '@/shared/utils/authErrors'
import { normalizeEmail } from '@/shared/utils/email'
import { EmailInput } from '@/shared/ui/EmailInput'
import { Input } from '@/shared/ui/FormField'
import { getErrorMessage } from '@/shared/utils/errors'
import { KeyRound, Lock, ShieldAlert, ShieldCheck, Smartphone } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { GlobalAdminLogo } from '../layout/GlobalAdminLogo'
import { supabase } from '../lib/supabase'
import { useAdminSession } from './session'

/**
 * Global Admin sign-in (ADR 0019): its own screen, never Quanela's. Password
 * (handled by Supabase Auth), then the role check in the database, then a
 * one-time code from an authenticator app. Nothing here stores a password.
 */
export function LoginPage() {
  const { stage } = useAdminSession()
  return (
    <div className="flex min-h-dvh items-center justify-center bg-console-950 px-4 py-10">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(249,115,22,0.08),transparent)]" aria-hidden />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <GlobalAdminLogo />
        </div>
        <div className="rounded-2xl border border-console-700 bg-console-900/90 p-6 shadow-2xl shadow-black/40">
          {stage === 'mfa_enroll' ? <EnrollStep /> : stage === 'mfa_verify' ? <VerifyStep /> : stage === 'restricted' ? <RestrictedStep /> : <PasswordStep />}
        </div>
        <p className="mt-6 text-center font-mono text-[10px] tracking-wider text-neutral-600">ACCESO RESTRINGIDO · CADA ACCIÓN QUEDA REGISTRADA</p>
      </div>
    </div>
  )
}

function Heading({ icon: Icon, title, children }: { icon: typeof Lock; title: string; children?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="flex items-center gap-2 text-base font-semibold text-neutral-50">
        <Icon size={16} className="text-brasa-400" aria-hidden /> {title}
      </h1>
      {children && <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">{children}</p>}
    </div>
  )
}

function PasswordStep() {
  const { refresh } = useAdminSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: normalizeEmail(email), password })
    if (signInError) {
      setError(signInErrorMessage(signInError))
      setBusy(false)
      return
    }
    await refresh()
    setBusy(false)
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <Heading icon={Lock} title="Iniciar sesión">
        Consola de administración de la plataforma. Solo para Global Admins.
      </Heading>
      <label className="block text-xs text-neutral-400">
        Correo
        <EmailInput autoComplete="username" required value={email} onValueChange={setEmail} className="!mt-1" />
      </label>
      <label className="block text-xs text-neutral-400">
        Contraseña
        <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="!mt-1" />
      </label>
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" className="w-full" loading={busy}>
        Continuar
      </Button>
    </form>
  )
}

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]{6}"
      maxLength={6}
      required
      autoFocus
      aria-label="Código de 6 dígitos"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      className="!mt-0 text-center font-mono text-xl tracking-[0.5em]"
    />
  )
}

function VerifyStep() {
  const { refresh, signOut } = useAdminSession()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const factor = factors?.totp.find((f) => f.status === 'verified')
      if (!factor) throw new Error('No hay un autenticador registrado.')
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
      if (verifyError) throw verifyError
      await refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Código incorrecto.'))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <Heading icon={ShieldCheck} title="Segundo factor">
        Escribe el código de 6 dígitos de tu app autenticadora.
      </Heading>
      <CodeInput value={code} onChange={setCode} />
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={code.length !== 6}>
        Verificar
      </Button>
      <button type="button" onClick={() => void signOut()} className="w-full text-center text-xs text-neutral-500 hover:text-neutral-300">
        Usar otra cuenta
      </button>
    </form>
  )
}

interface Enrollment {
  id: string
  qr: string
  secret: string
}

let pendingEnrollment: Promise<Enrollment> | null = null

/**
 * One enrollment at a time, shared by every caller: React's development
 * double-mount (and a quick re-render) must not create two factors, which
 * Supabase rejects ("a factor with the friendly name … already exists").
 */
function startEnrollment(): Promise<Enrollment> {
  pendingEnrollment ??= (async () => {
    // Unfinished enrollments from earlier attempts are cleared first.
    const { data: existing } = await supabase.auth.mfa.listFactors()
    for (const f of existing?.all ?? []) if (f.factor_type === 'totp' && f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Quanela Global Admin ${new Date().toISOString().slice(0, 16)}` })
    if (error || !data) throw error ?? new Error('No se pudo preparar el autenticador.')
    return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret }
  })().finally(() => {
    pendingEnrollment = null
  })
  return pendingEnrollment
}

function EnrollStep() {
  const { refresh, signOut } = useAdminSession()
  const [factor, setFactor] = useState<Enrollment | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    startEnrollment().then(
      (f) => active && setFactor(f),
      (err: unknown) => active && setError(getErrorMessage(err, 'No se pudo preparar el autenticador.')),
    )
    return () => {
      active = false
    }
  }, [attempt])

  function retry() {
    setError(null)
    setFactor(null)
    setAttempt((n) => n + 1)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!factor) return
    setBusy(true)
    setError(null)
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
    if (verifyError) {
      setError('Código incorrecto. Revisa la hora del teléfono e inténtalo de nuevo.')
      setCode('')
      setBusy(false)
      return
    }
    await refresh()
    setBusy(false)
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <Heading icon={Smartphone} title="Activa el segundo factor">
        El portal exige un código de una app autenticadora (Google Authenticator, 1Password…). Escanea el código y escribe los 6 dígitos.
      </Heading>
      <div className="flex justify-center rounded-xl bg-white p-3">
        {factor ? <img src={factor.qr} alt="Código QR para la app autenticadora" className="size-44" /> : <div className="size-44 animate-pulse rounded bg-neutral-200" />}
      </div>
      {factor && (
        <p className="flex items-center gap-1.5 break-all font-mono text-[11px] text-neutral-500">
          <KeyRound size={11} className="shrink-0" aria-hidden /> {factor.secret}
        </p>
      )}
      <CodeInput value={code} onChange={setCode} />
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}{' '}
          {!factor && (
            <button type="button" onClick={retry} className="font-medium text-neutral-200 underline hover:text-white">
              Reintentar
            </button>
          )}
        </p>
      )}
      <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!factor || code.length !== 6}>
        Activar y entrar
      </Button>
      <button type="button" onClick={() => void signOut()} className="w-full text-center text-xs text-neutral-500 hover:text-neutral-300">
        Cancelar
      </button>
    </form>
  )
}

function RestrictedStep() {
  const { restrictedEmail, signOut } = useAdminSession()
  return (
    <div className="space-y-4">
      <Heading icon={ShieldAlert} title="Acceso restringido">
        {restrictedEmail ? `${restrictedEmail} no` : 'Esta cuenta no'} tiene acceso a Quanela Global Admin. Tu sesión en Quanela no cambia.
      </Heading>
      <Button variant="secondary" className="w-full" onClick={() => void signOut()}>
        Volver
      </Button>
    </div>
  )
}
