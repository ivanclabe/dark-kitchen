import { CATEGORIES, COUNTRIES, SECTORS } from '@/modules/organization/lib/business'
import { useAuth } from '@/shared/hooks/useAuth'
import { Button } from '@/shared/ui/Button'
import { FormField, FormGrid, Input, Select } from '@/shared/ui/FormField'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import clsx from 'clsx'
import { ArrowLeft, ArrowRight, Flame, MailCheck, RotateCw } from 'lucide-react'
import { useCallback, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { CONFIRMED_PATH, PUBLIC_SIGNUP_ENABLED, resendConfirmation, signUpBusiness, TURNSTILE_SITE_KEY, type PendingOrganization } from '../api'
import { TurnstileWidget } from '../components/TurnstileWidget'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
/** Espera entre reenvíos del correo de confirmación. */
const RESEND_WAIT_MS = 60_000

function Shell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-10 text-neutral-100">
      <div className={clsx('w-full', wide ? 'max-w-xl' : 'max-w-sm')}>
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 text-neutral-100">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brasa-500 shadow-[0_8px_24px_-8px_var(--color-brasa-500)]">
            <Flame size={20} className="text-white" strokeWidth={2.5} aria-hidden />
          </span>
          <span className="text-lg font-semibold">Dark Kitchen</span>
        </Link>
        <div className="space-y-5 rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-6">{children}</div>
      </div>
    </div>
  )
}

/**
 * Registro de un negocio nuevo (ADR 0008, sección 8): dos pasos cortos —
 * tu usuario y tu organización — y "Revisa tu correo". El enlace del correo
 * lleva a /registro/confirmado, que crea la organización y su primera Cuenta
 * y entra directo. Solo correos confirmados crean negocios (ADR D-A).
 */
export function SignUpPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2 | 'sent'>(1)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [org, setOrg] = useState<PendingOrganization>({ name: '', sector: '', category: '', country: 'CO', address: '', city: '' })
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resent, setResent] = useState(false)
  const [resendLocked, setResendLocked] = useState(false)
  const onCaptcha = useCallback((token: string | null) => setCaptchaToken(token), [])

  if (session && step !== 'sent') return <Navigate to="/" replace />

  if (!PUBLIC_SIGNUP_ENABLED) {
    return (
      <Shell>
        <h1 className={typography.h2}>El registro abre pronto</h1>
        <p className={typography.small}>Por ahora los negocios nuevos se crean con el equipo de Dark Kitchen. Si ya tienes usuario, inicia sesión.</p>
        <Link to="/login" className="block text-sm text-brasa-400 hover:underline">
          Iniciar sesión
        </Link>
      </Shell>
    )
  }

  const step1Errors = {
    fullName: fullName.trim().length >= 2 ? null : 'Mínimo 2 caracteres',
    email: EMAIL.test(email.trim()) ? null : 'Correo inválido',
    password: password.length >= 8 ? null : 'Mínimo 8 caracteres',
  }
  const step1Valid = !Object.values(step1Errors).some(Boolean)
  const step2Valid = org.name.trim().length >= 2 && Boolean(org.sector) && Boolean(org.category) && (!TURNSTILE_SITE_KEY || Boolean(captchaToken))
  const set = (patch: Partial<PendingOrganization>) => setOrg((o) => ({ ...o, ...patch }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!step2Valid) return
    setBusy(true)
    setError(null)
    try {
      const organization: PendingOrganization = {
        ...org,
        name: org.name.trim(),
        address: org.address?.trim() || undefined,
        city: org.city?.trim() || undefined,
        phone: org.phone?.trim() || undefined,
        taxId: org.taxId?.trim() || undefined,
        legalName: org.legalName?.trim() || undefined,
      }
      const { hasSession } = await signUpBusiness({ fullName, email, password, organization, captchaToken: captchaToken ?? undefined })
      // Si el proyecto no exige confirmar el correo, ya hay sesión: se crea el negocio de una vez.
      if (hasSession) navigate(CONFIRMED_PATH, { replace: true })
      else setStep('sent')
    } catch (err) {
      const message = getErrorMessage(err, 'No se pudo crear tu usuario')
      setError(/already registered|already exists/i.test(message) ? 'Ese correo ya tiene usuario en Dark Kitchen. Inicia sesión.' : message)
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    setError(null)
    try {
      await resendConfirmation(email.trim().toLowerCase())
      setResent(true)
      setResendLocked(true)
      window.setTimeout(() => setResendLocked(false), RESEND_WAIT_MS)
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo reenviar el correo'))
    }
  }

  if (step === 'sent') {
    return (
      <Shell>
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
          <MailCheck size={22} aria-hidden />
        </span>
        <div className="text-center">
          <h1 className={typography.h2}>Revisa tu correo</h1>
          <p className={`mt-2 ${typography.small}`}>
            Te enviamos un enlace a <span className="text-neutral-100">{email.trim().toLowerCase()}</span>. Ábrelo y entrarás directo a{' '}
            <span className="text-neutral-100">{org.name.trim()}</span>, lista para empezar.
          </p>
        </div>
        {resent && <p role="status" className="text-center text-sm text-emerald-400">Correo reenviado.</p>}
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <div className="flex flex-col gap-2">
          <Button variant="secondary" icon={RotateCw} onClick={() => void resend()} disabled={resendLocked}>
            Reenviar el correo
          </Button>
          <Button variant="ghost" onClick={() => setStep(1)}>
            ¿Te equivocaste de correo? Corregirlo
          </Button>
        </div>
        <p className={typography.caption}>Si no aparece en unos minutos, revisa la carpeta de spam.</p>
      </Shell>
    )
  }

  return (
    <Shell wide={step === 2}>
      <div>
        <p className={typography.overline}>Paso {step} de 2</p>
        <h1 className={`mt-1 ${typography.h2}`}>{step === 1 ? 'Crea tu usuario' : 'Tu negocio'}</h1>
        <p className={`mt-1 ${typography.small}`}>
          {step === 1 ? 'Con él entrarás a Dark Kitchen.' : 'Lo usamos para preparar tu organización y tu primera cuenta.'}
        </p>
      </div>

      {step === 1 ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (step1Valid) setStep(2)
          }}
          className="space-y-4"
          noValidate
        >
          <FormField label="Tu nombre" required error={fullName ? step1Errors.fullName : null}>
            {(a11y) => <Input {...a11y} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />}
          </FormField>
          <FormField label="Correo" required error={email ? step1Errors.email : null}>
            {(a11y) => <Input {...a11y} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </FormField>
          <FormField label="Contraseña" required hint="Mínimo 8 caracteres." error={password ? step1Errors.password : null}>
            {(a11y) => <Input {...a11y} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </FormField>
          <Button type="submit" variant="primary" size="lg" iconRight={ArrowRight} className="w-full" disabled={!step1Valid}>
            Continuar
          </Button>
        </form>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
          <FormField label="Nombre del negocio" required hint="Así se llamará tu organización y tu primera cuenta. Puedes cambiarlo después.">
            {(a11y) => <Input {...a11y} value={org.name} onChange={(e) => set({ name: e.target.value })} placeholder="Hamburguesería Centro" maxLength={80} autoFocus />}
          </FormField>
          <FormGrid>
            <FormField label="Sector" required>
              {(a11y) => (
                <Select {...a11y} value={org.sector} onChange={(e) => set({ sector: e.target.value })}>
                  <option value="">Elegir…</option>
                  {SECTORS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <FormField label="Categoría" required>
              {(a11y) => (
                <Select {...a11y} value={org.category} onChange={(e) => set({ category: e.target.value })}>
                  <option value="">Elegir…</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <FormField label="Dirección">{(a11y) => <Input {...a11y} value={org.address ?? ''} onChange={(e) => set({ address: e.target.value })} />}</FormField>
            <FormField label="Ciudad">{(a11y) => <Input {...a11y} value={org.city ?? ''} onChange={(e) => set({ city: e.target.value })} />}</FormField>
            <FormField label="País" hint="Define la zona horaria y la moneda.">
              {(a11y) => (
                <Select {...a11y} value={org.country} onChange={(e) => set({ country: e.target.value })}>
                  {COUNTRIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <FormField label="Teléfono (opcional)">{(a11y) => <Input {...a11y} type="tel" value={org.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} />}</FormField>
            <FormField label="NIT (opcional)">{(a11y) => <Input {...a11y} value={org.taxId ?? ''} onChange={(e) => set({ taxId: e.target.value })} />}</FormField>
            <FormField label="Razón social (opcional)">{(a11y) => <Input {...a11y} value={org.legalName ?? ''} onChange={(e) => set({ legalName: e.target.value })} />}</FormField>
          </FormGrid>
          {TURNSTILE_SITE_KEY && <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} onToken={onCaptcha} />}
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep(1)} disabled={busy}>
              Atrás
            </Button>
            <Button type="submit" variant="primary" size="lg" className="flex-1" loading={busy} disabled={!step2Valid}>
              Crear mi negocio
            </Button>
          </div>
        </form>
      )}

      <p className="text-center text-sm text-neutral-500">
        ¿Ya tienes usuario?{' '}
        <Link to="/login" className="text-brasa-400 hover:underline">
          Inicia sesión
        </Link>
      </p>
    </Shell>
  )
}
