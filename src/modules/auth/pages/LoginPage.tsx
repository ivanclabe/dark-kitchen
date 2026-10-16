import { INVALID_CREDENTIALS_MESSAGE } from '@/shared/utils/authErrors'
import { Feedback } from '@/shared/ui/Feedback'
import clsx from 'clsx'
import { BrandMark } from '@/shared/brand/BrandMark'
import { useAuth } from '@/shared/hooks/useAuth'
import { normalizeEmail } from '@/shared/utils/email'
import { EmailInput } from '@/shared/ui/EmailInput'
import { APP_ENTRY } from '@/shared/tenant/navigation'
import { helpHref } from '@/shared/help/helpUrl'
import { rootUrl, tenantHostLabel } from '@/shared/tenant/host'
import { useTenant } from '@/shared/tenant/tenantContext'
import { Button } from '@/shared/ui/Button'
import { FormField, Input } from '@/shared/ui/FormField'
import { typography } from '@/shared/ui/typography'
import { ArrowLeft, CircleHelp, Eye, EyeOff, LogIn } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { OwnerMethodButtons, PhoneSignIn } from '@/modules/signup/components/OwnerMethods'
import { enabledOwnerMethods, oauthErrorFromUrl, OWNER_SIGNUP_RETURN } from '@/modules/signup/ownerAuth'
import { hasOwnerSignInMark } from '@/modules/signup/ownerSession'
import { clearAccountChoice, markAccountChoice } from '@/shared/kitchen/accountChoice'

/** The brand panel's scene: the robot of Quanela with the kitchen around it (public/brand). */
const LOGIN_IMAGE = '/brand/login-hero.webp'

function PanelBrand({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-3">
      <BrandMark className="size-12 rounded-[0.9rem] ring-2 ring-white/40 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]" />
      <span className="text-base font-semibold text-white">{name}</span>
    </span>
  )
}

/**
 * Login of Quanela: the brand on one side (only on wide screens) and the form
 * on the other. On an organization's subdomain it shows its name and address
 * (ADR 0021); the identity is the same everywhere. Email + password is for
 * everyone (invited users included, unchanged); below it, whoever created
 * their business with Google, Instagram or phone signs in that way (ADR 0025).
 */
export function LoginPage() {
  const { session, signIn } = useAuth()
  // On an organization's subdomain, its own login (ADR 0021): same identity, its name.
  const tenant = useTenant()
  const orgName = tenant.mode === 'tenant' && tenant.status !== 'not_found' ? tenant.organization?.name : null
  const [searchParams] = useSearchParams()
  // Solo rutas internas (p. ej. volver al enlace de invitación): nunca redirigir fuera de la app.
  const next = searchParams.get('next')
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : APP_ENTRY
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const methods = enabledOwnerMethods()
  const [ownerPhone, setOwnerPhone] = useState(false)
  const notice = (useLocation().state as { notice?: string } | null)?.notice ?? null
  const [ownerError, setOwnerError] = useState<string | null>(() => oauthErrorFromUrl(window.location.href))
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Back from Google, Instagram or the SMS code: the sign-up decides (owner, onboarding or D3 guard).
  if (session) return <Navigate to={hasOwnerSignInMark() ? OWNER_SIGNUP_RETURN : target} replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    // ADR 0043: a plain sign-in (not a link to a page) lets someone with several accounts choose one.
    if (target === APP_ENTRY) markAccountChoice()
    const { error } = await signIn(normalizeEmail(email), password)
    if (error) {
      clearAccountChoice()
      setError(error)
    }
    setSubmitting(false)
  }

  const backLinkClass = 'inline-flex items-center gap-1 text-sm text-neutral-500 transition-colors hover:text-neutral-300'

  return (
    <div className="grid min-h-dvh bg-neutral-950 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Brand panel: wide screens only. The robot of Quanela at work (ADR 0060), with a shade under the text. */}
      <aside className="relative hidden overflow-hidden bg-[#c2410c] lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:justify-between lg:p-12">
        <img
          src={LOGIN_IMAGE}
          alt=""
          aria-hidden
          decoding="async"
          className="pointer-events-none absolute inset-x-0 top-0 h-[84%] w-full object-cover object-[76%_50%] [mask-image:linear-gradient(to_bottom,black_78%,transparent)]"
        />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(60,18,4,0.88)_0%,rgba(60,18,4,0.55)_30%,rgba(60,18,4,0)_58%)]" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[linear-gradient(to_bottom,rgba(60,18,4,0.35),rgba(60,18,4,0))]" aria-hidden />

        <div className="relative">
          <PanelBrand name="Quanela" />
        </div>

        <div className="relative max-w-xl space-y-4">
          <h2 className="text-4xl leading-tight font-semibold tracking-tight text-balance text-white [text-shadow:0_2px_18px_rgba(60,18,4,0.5)]">
            Tu cocina bajo control, del pedido a la entrega.
          </h2>
          <p className="max-w-md text-base leading-relaxed text-white/85">
            Pedidos, cocina, inventario y equipo en un solo lugar. La IA te avisa y recomienda; tú decides.
          </p>
          <p className="pt-6 text-sm text-white/70">Cada cuenta ve solo sus datos. Toda la actividad queda registrada.</p>
        </div>
      </aside>

      {/*
        Form. It mirrors the brand panel: the same top and bottom margins, the help link where the logo is,
        the way back at the foot, and the form centered on its own card.
      */}
      <main className="relative flex min-h-dvh flex-col px-4 py-8 sm:px-8 lg:h-dvh lg:min-h-0 lg:py-20">
        <div className="absolute top-12 right-12 hidden h-[3.25rem] items-center lg:flex">
          <a href={helpHref()} className={backLinkClass}>
            <CircleHelp size={14} aria-hidden /> Centro de ayuda
          </a>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-[28rem] lg:rounded-3xl lg:border lg:border-neutral-800/70 lg:bg-neutral-900/40 lg:px-9 lg:py-7 lg:shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]">
            <div className="mb-6 flex flex-col items-center text-center">
              <BrandMark className="mb-4 size-12 lg:hidden" />
              <h1 className={typography.h1}>Inicia sesión</h1>
              <p className={`mt-1.5 ${typography.small}`}>
                {orgName && tenant.code ? (
                  <>
                    Entra a {orgName} en <span className="font-mono text-neutral-300">{tenantHostLabel(tenant.code)}</span>.
                  </>
                ) : (
                  'Usa el correo y la contraseña de tu cuenta de Quanela.'
                )}
              </p>
            </div>

            {notice && <Feedback tone="warning" role="status" description={notice} className="mb-5" />}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <FormField label="Correo electrónico" required>
                {(a11y) => (
                  <EmailInput
                    {...a11y}
                    required
                    autoComplete="username"
                    placeholder="nombre@negocio.com"
                    value={email}
                    onValueChange={(v) => {
                      setEmail(v)
                      setError(null)
                    }}
                    autoFocus
                  />
                )}
              </FormField>
              <FormField label="Contraseña" required error={error}>
                {(a11y) => (
                  <div className="relative">
                    <Input
                      {...a11y}
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        setError(null)
                      }}
                      className="pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      aria-pressed={showPassword}
                      className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                    >
                      {showPassword ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                    </button>
                  </div>
                )}
              </FormField>
              {error === INVALID_CREDENTIALS_MESSAGE && (
                // There is no self-service reset yet: the guide says how to get a new password.
                <a
                  href={helpHref('/help/getting-started/switch-account#si-olvidaste-tu-contrasena')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="-mt-2 inline-block text-sm text-brasa-400 underline-offset-4 hover:text-brasa-300 hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </a>
              )}
              <Button type="submit" variant="primary" size="lg" icon={LogIn} loading={submitting} className="w-full">
                Iniciar sesión
              </Button>
            </form>

            {methods.length > 0 && (
              <section aria-label="Entrar con el método con el que creaste tu negocio" className="mt-5 space-y-3 border-t border-neutral-800/70 pt-5">
                <p className="text-center text-xs text-neutral-500">
                  ¿Creaste tu negocio con {methods.map((m) => ({ google: 'Google', instagram: 'Instagram', phone: 'tu teléfono' })[m]).join(', ').replace(/, ([^,]*)$/, ' o $1')}?
                </p>
                {ownerPhone ? (
                  <PhoneSignIn create={false} onBack={() => setOwnerPhone(false)} onSignedIn={() => setOwnerError(null)} />
                ) : (
                  <OwnerMethodButtons methods={methods} compact onPhone={() => setOwnerPhone(true)} onError={setOwnerError} />
                )}
                {ownerError && <p role="alert" className="text-sm text-red-400">{ownerError}</p>}
              </section>
            )}

            <p className="mt-5 border-t border-neutral-800/70 pt-4 text-center text-xs leading-relaxed text-neutral-500">
              ¿Eres nuevo en el equipo o no tienes contraseña? Pide a tu administrador una <span className="text-neutral-300">invitación</span>.
            </p>
        </div>
        </div>

        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 pt-6 lg:absolute lg:bottom-12 lg:left-12 lg:pt-0">
          {/* On a subdomain "/" is this same login: the start is quanela.com (ADR 0021). */}
          {orgName && rootUrl('/') ? (
            <a href={rootUrl('/')!} className={backLinkClass}>
              <ArrowLeft size={14} aria-hidden /> Ir a Quanela
            </a>
          ) : (
            <Link to="/" className={backLinkClass}>
              <ArrowLeft size={14} aria-hidden /> Volver al inicio
            </Link>
          )}
          <a href={helpHref()} className={clsx(backLinkClass, 'lg:hidden')}>
            <CircleHelp size={14} aria-hidden /> Centro de ayuda
          </a>
        </div>
      </main>
    </div>
  )
}
