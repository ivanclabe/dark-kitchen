import { CATEGORIES, COUNTRIES, SECTORS } from '@/modules/organization/lib/business'
import { AccountIcon } from '@/shared/avatars/Avatar'
import { suggestAccountIcon, type AccountIconKey } from '@/shared/avatars/catalog'
import { AccountIconPicker } from '@/shared/avatars/GalleryPicker'
import { useAuth } from '@/shared/hooks/useAuth'
import { PlanCard } from '@/shared/plans/PlanCard'
import { PlanSummary } from '@/shared/plans/PlanSummary'
import { isSelectablePlan, type Plan } from '@/shared/plans/plans'
import { usePublicPricing, useSelectedPlan } from '@/shared/plans/usePlans'
import { Button } from '@/shared/ui/Button'
import { FormField, FormGrid, Input, Select } from '@/shared/ui/FormField'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import clsx from 'clsx'
import { ArrowLeft, ArrowRight, Check, Flame, MailCheck, RotateCw } from 'lucide-react'
import { useCallback, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { CONFIRMED_PATH, PUBLIC_SIGNUP_ENABLED, resendConfirmation, signUpBusiness, TURNSTILE_SITE_KEY, type PendingOrganization } from '../api'
import { TurnstileWidget } from '../components/TurnstileWidget'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
/** Espera entre reenvíos del correo de confirmación. */
const RESEND_WAIT_MS = 60_000

type Step = 'user' | 'plan' | 'business' | 'sent'
const STEP_NUMBER: Record<Exclude<Step, 'sent'>, number> = { user: 1, plan: 2, business: 3 }

function Shell({ children, width = 'sm' }: { children: ReactNode; width?: 'sm' | 'md' | 'xl' }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-10 text-neutral-100">
      <div className={clsx('w-full', { sm: 'max-w-sm', md: 'max-w-xl', xl: 'max-w-5xl' }[width])}>
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

/** Elegir plan (paso 2): las mismas tarjetas que la landing. Los planes de ventas llevan a ventas. */
function PlanPicker({ plans, selected, onSelect }: { plans: Plan[]; selected: string | null; onSelect: (plan: string) => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {plans.map((plan) => {
        const isSelected = plan.key === selected
        const action = plan.selfServe ? (
          <Button variant={isSelected || plan.badge ? 'primary' : 'secondary'} icon={isSelected ? Check : undefined} className="w-full" onClick={() => onSelect(plan.key)}>
            {isSelected ? `${plan.name} seleccionado` : `Elegir ${plan.name}`}
          </Button>
        ) : (
          <a
            href={plan.contactUrl ?? undefined}
            className="flex h-10 w-full items-center justify-center rounded-xl border border-neutral-700 text-sm font-semibold text-neutral-100 transition-colors hover:border-neutral-500 hover:bg-neutral-800/60"
          >
            {plan.ctaLabel}
          </a>
        )
        return <PlanCard key={plan.key} plan={plan} action={action} selected={isSelected} />
      })}
    </div>
  )
}

/**
 * Registro de un negocio nuevo (ADR 0008 §8 y ADR 0010 §3.4), en tres pasos:
 * tu usuario → tu plan → tu negocio y tu primera cuenta, y "Revisa tu
 * correo". Si se llega con un plan (?plan=business, desde Precios), ese paso
 * no se repite: se muestra el plan con "Cambiar plan". Nada se crea en la
 * base hasta confirmar el correo; el enlace lleva a /registro/confirmado,
 * que crea organización, suscripción, primera Cuenta y roles juntos.
 */
export function SignUpPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const { data: pricing, isLoading: plansLoading, isError: plansError, refetch: refetchPlans } = usePublicPricing()
  const { plan: requestedPlan, setPlan } = useSelectedPlan()
  const selectedPlan = isSelectablePlan(pricing?.plans, requestedPlan) ? (pricing?.plans.find((p) => p.key === requestedPlan) ?? null) : null

  const [step, setStep] = useState<Step>('user')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [org, setOrg] = useState<PendingOrganization>({ name: '', sector: '', category: '', country: 'CO', address: '', city: '' })
  const [accountName, setAccountName] = useState('')
  const [accountIcon, setAccountIcon] = useState<AccountIconKey | null>(null)
  const [pickingIcon, setPickingIcon] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resent, setResent] = useState(false)
  const [resendLocked, setResendLocked] = useState(false)
  const set = (patch: Partial<PendingOrganization>) => setOrg((o) => ({ ...o, ...patch }))
  const onCaptcha = useCallback((token: string | null) => setCaptchaToken(token), [])

  if (session && step !== 'sent') return <Navigate to="/" replace />

  const salesUrl = pricing?.plans.find((p) => p.cta === 'contact_sales')?.contactUrl ?? null

  if (!PUBLIC_SIGNUP_ENABLED) {
    return (
      <Shell>
        <h1 className={typography.h2}>El registro abre pronto</h1>
        {selectedPlan && <PlanSummary plan={selectedPlan} />}
        <p className={typography.small}>Por ahora los negocios nuevos se crean con el equipo de Dark Kitchen. Escríbenos y te ayudamos a empezar; si ya tienes usuario, inicia sesión.</p>
        <div className="flex flex-col gap-2 text-sm">
          {salesUrl && (
            <a href={salesUrl} className="text-brasa-400 hover:underline">
              Hablar con ventas
            </a>
          )}
          <Link to="/login" className="text-neutral-300 hover:underline">
            Iniciar sesión
          </Link>
          <Link to="/landing#precios" className="text-neutral-400 hover:underline">
            Ver planes y precios
          </Link>
        </div>
      </Shell>
    )
  }

  const stepUserErrors = {
    fullName: fullName.trim().length >= 2 ? null : 'Mínimo 2 caracteres',
    email: EMAIL.test(email.trim()) ? null : 'Correo inválido',
    password: password.length >= 8 ? null : 'Mínimo 8 caracteres',
  }
  const stepUserValid = !Object.values(stepUserErrors).some(Boolean)
  const effectiveAccountName = accountName.trim() || org.name.trim()
  const effectiveIcon = accountIcon ?? suggestAccountIcon(effectiveAccountName)
  const stepBusinessValid =
    org.name.trim().length >= 2 && effectiveAccountName.length >= 2 && Boolean(org.sector) && Boolean(org.category) && (!TURNSTILE_SITE_KEY || Boolean(captchaToken))

  /** Después de tu usuario: al plan si falta elegirlo; si no, al negocio. */
  const afterUser = () => setStep(selectedPlan ? 'business' : 'plan')
  const choosePlan = (plan: string) => {
    setPlan(plan)
    setStep(stepUserValid ? 'business' : 'user')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!stepBusinessValid || !selectedPlan) return
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
        accountName: effectiveAccountName,
        accountIcon: effectiveIcon,
      }
      const { hasSession } = await signUpBusiness({ fullName, email, password, organization, plan: selectedPlan.key, captchaToken: captchaToken ?? undefined })
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
            <span className="text-neutral-100">{effectiveAccountName}</span>
            {selectedPlan && <> con el plan {selectedPlan.name}</>}, lista para empezar.
          </p>
        </div>
        {resent && <p role="status" className="text-center text-sm text-emerald-400">Correo reenviado.</p>}
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <div className="flex flex-col gap-2">
          <Button variant="secondary" icon={RotateCw} onClick={() => void resend()} disabled={resendLocked}>
            Reenviar el correo
          </Button>
          <Button variant="ghost" onClick={() => setStep('user')}>
            ¿Te equivocaste de correo? Corregirlo
          </Button>
        </div>
        <p className={typography.caption}>Si no aparece en unos minutos, revisa la carpeta de spam.</p>
      </Shell>
    )
  }

  const titles = {
    user: ['Crea tu usuario', 'Con él entrarás a Dark Kitchen.'],
    plan: ['Elige el plan para tu negocio', 'Empieza gratis; puedes cambiar de plan más adelante.'],
    business: ['Tu negocio y tu primera cuenta', 'Con esto preparamos tu organización y su primera cuenta.'],
  }[step]
  const planSummary = selectedPlan && step !== 'plan' ? <PlanSummary plan={selectedPlan} onChange={() => setStep('plan')} /> : null

  return (
    <Shell width={step === 'plan' ? 'xl' : step === 'business' ? 'md' : 'sm'}>
      <div>
        <p className={typography.overline}>Paso {STEP_NUMBER[step]} de 3</p>
        <h1 className={`mt-1 ${typography.h2}`}>{titles[0]}</h1>
        <p className={`mt-1 ${typography.small}`}>{titles[1]}</p>
      </div>

      {planSummary}

      {step === 'user' && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (stepUserValid) afterUser()
          }}
          className="space-y-4"
          noValidate
        >
          <FormField label="Tu nombre" required error={fullName ? stepUserErrors.fullName : null}>
            {(a11y) => <Input {...a11y} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />}
          </FormField>
          <FormField label="Correo" required error={email ? stepUserErrors.email : null}>
            {(a11y) => <Input {...a11y} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </FormField>
          <FormField label="Contraseña" required hint="Mínimo 8 caracteres." error={password ? stepUserErrors.password : null}>
            {(a11y) => <Input {...a11y} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </FormField>
          <Button type="submit" variant="primary" size="lg" iconRight={ArrowRight} className="w-full" disabled={!stepUserValid}>
            Continuar
          </Button>
        </form>
      )}

      {step === 'plan' &&
        (plansLoading ? (
          <div className="grid gap-4 lg:grid-cols-3" aria-busy="true" aria-label="Cargando planes">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-96 animate-pulse rounded-2xl border border-neutral-800/60 bg-neutral-900/40" />
            ))}
          </div>
        ) : plansError || !pricing ? (
          <div className="text-center">
            <p className={typography.small}>No pudimos cargar los planes.</p>
            <Button variant="link" icon={RotateCw} onClick={() => void refetchPlans()}>
              Reintentar
            </Button>
          </div>
        ) : (
          <>
            <PlanPicker plans={pricing.plans} selected={selectedPlan?.key ?? null} onSelect={choosePlan} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep('user')}>
                Atrás
              </Button>
              <Link to="/landing#precios" className="text-sm text-neutral-400 hover:text-neutral-200">
                Comparar planes en detalle
              </Link>
            </div>
          </>
        ))}

      {step === 'business' && (
        <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
          <FormField label="Nombre del negocio" required hint="Así se llamará tu organización. Puedes cambiarlo después.">
            {(a11y) => <Input {...a11y} value={org.name} onChange={(e) => set({ name: e.target.value })} placeholder="Grupo XYZ" maxLength={80} autoFocus />}
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

          <fieldset className="space-y-3 rounded-xl border border-neutral-800/60 p-4">
            <legend className="px-1 text-sm font-medium text-neutral-200">Tu primera cuenta</legend>
            <p className={typography.caption}>Una cuenta es un establecimiento (un local, una cocina). Después puedes crear más según tu plan.</p>
            <FormField label="Nombre de la cuenta" hint={accountName ? undefined : 'Si lo dejas vacío, usa el nombre del negocio.'}>
              {(a11y) => (
                <Input {...a11y} value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder={org.name.trim() || 'Hamburguesería Centro'} maxLength={80} />
              )}
            </FormField>
            <div className="flex items-center gap-3">
              <AccountIcon iconKey={effectiveIcon} size="lg" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-200">Icono de la cuenta</p>
                <button type="button" onClick={() => setPickingIcon((v) => !v)} className="text-xs text-brasa-400 hover:underline" aria-expanded={pickingIcon}>
                  {pickingIcon ? 'Listo' : 'Cambiar icono'}
                </button>
              </div>
            </div>
            {pickingIcon && <AccountIconPicker compact value={effectiveIcon} onChange={setAccountIcon} />}
          </fieldset>

          {!selectedPlan && (
            <p role="alert" className="text-sm text-amber-300">
              Elige un plan para continuar.{' '}
              <button type="button" className="underline" onClick={() => setStep('plan')}>
                Elegir plan
              </button>
            </p>
          )}
          {TURNSTILE_SITE_KEY && <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} onToken={onCaptcha} />}
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep(selectedPlan ? 'user' : 'plan')} disabled={busy}>
              Atrás
            </Button>
            <Button type="submit" variant="primary" size="lg" className="flex-1" loading={busy} disabled={!stepBusinessValid || !selectedPlan}>
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
