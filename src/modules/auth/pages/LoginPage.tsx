import { useAuth } from '@/shared/hooks/useAuth'
import { rootUrl, tenantHostLabel } from '@/shared/tenant/host'
import { useTenant } from '@/shared/tenant/tenantContext'
import { Button } from '@/shared/ui/Button'
import { FormField, Input } from '@/shared/ui/FormField'
import { typography } from '@/shared/ui/typography'
import { ArrowLeft, Eye, EyeOff, Flame, LogIn } from 'lucide-react'
import { useState, type CSSProperties, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { OwnerMethodButtons, PhoneSignIn } from '@/modules/signup/components/OwnerMethods'
import { enabledOwnerMethods, oauthErrorFromUrl, OWNER_SIGNUP_RETURN } from '@/modules/signup/ownerAuth'
import { hasOwnerSignInMark } from '@/modules/signup/ownerSession'

/** A thin grid over the brand panel (white lines, so it reads the same in both themes). */
const GRID: CSSProperties = {
  backgroundImage:
    'linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)',
  backgroundSize: '40px 40px',
}

function BrandMark({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-3">
      <span className="flex size-11 items-center justify-center rounded-xl border border-white/20 bg-white/15 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]">
        <Flame size={20} className="text-white" strokeWidth={2.5} aria-hidden />
      </span>
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
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
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
    const { error } = await signIn(email, password)
    if (error) setError(error)
    setSubmitting(false)
  }

  const backLinkClass = 'inline-flex items-center gap-1 text-sm text-neutral-500 transition-colors hover:text-neutral-300'

  return (
    <div className="grid min-h-screen bg-neutral-950 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Brand panel: wide screens only. */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brasa-700 via-brasa-800 to-[#5a1f0a] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0" style={GRID} aria-hidden />
        <div className="pointer-events-none absolute -top-32 -left-32 size-[28rem] rounded-full bg-brasa-500/30 blur-3xl" aria-hidden />

        <div className="relative">
          <BrandMark name="Quanela" />
        </div>

        <div className="relative max-w-xl space-y-4">
          <h2 className="text-4xl leading-tight font-semibold tracking-tight text-balance text-white">Tu cocina bajo control, del pedido a la entrega.</h2>
          <p className="max-w-md text-base leading-relaxed text-white/80">
            Pedidos, cocina, inventario y equipo en un solo lugar. La IA te avisa y recomienda; tú decides.
          </p>
        </div>

        <p className="relative text-sm text-white/65">Cada cuenta ve solo sus datos. Toda la actividad queda registrada.</p>
      </aside>

      {/* Form. */}
      <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          {/* The brand, on phones and tablets (the side panel is hidden). */}
          <div className="mb-10 flex justify-center lg:hidden">
            <span className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-xl bg-brasa-500 shadow-[0_8px_24px_-8px_var(--color-brasa-500)]">
                <Flame size={20} className="text-white" strokeWidth={2.5} aria-hidden />
              </span>
              <span className="text-base font-semibold text-neutral-50">Quanela</span>
            </span>
          </div>

          <div className="mb-8">
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

          {notice && (
            <p role="status" className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3.5 py-2.5 text-sm text-amber-200">
              {notice}
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <FormField label="Correo electrónico" required>
              {(a11y) => (
                <Input
                  {...a11y}
                  type="email"
                  required
                  autoComplete="username"
                  placeholder="nombre@negocio.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-pressed={showPassword}
                    className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200 focus-visible:ring-2 focus-visible:ring-brasa-500 focus-visible:outline-none"
                  >
                    {showPassword ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                  </button>
                </div>
              )}
            </FormField>
            <Button type="submit" variant="primary" size="lg" icon={LogIn} loading={submitting} className="w-full">
              Iniciar sesión
            </Button>
          </form>

          {methods.length > 0 && (
            <section aria-label="Entrar con el método con el que creaste tu negocio" className="mt-8 space-y-3">
              <div className="flex items-center gap-3 text-xs text-neutral-500">
                <span className="h-px flex-1 bg-neutral-800" aria-hidden />
                ¿Creaste tu negocio con {methods.map((m) => ({ google: 'Google', instagram: 'Instagram', phone: 'tu teléfono' })[m]).join(', ').replace(/, ([^,]*)$/, ' o $1')}?
                <span className="h-px flex-1 bg-neutral-800" aria-hidden />
              </div>
              {ownerPhone ? (
                <PhoneSignIn create={false} onBack={() => setOwnerPhone(false)} onSignedIn={() => setOwnerError(null)} />
              ) : (
                <OwnerMethodButtons methods={methods} onPhone={() => setOwnerPhone(true)} onError={setOwnerError} />
              )}
              {ownerError && <p role="alert" className="text-sm text-red-400">{ownerError}</p>}
            </section>
          )}

          <p className="mt-8 text-center text-sm text-neutral-500">
            ¿Eres nuevo en el equipo o no tienes contraseña? Pide a tu administrador una <span className="text-neutral-300">invitación</span>.
          </p>
          <div className="mt-3 flex justify-center">
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
          </div>
        </div>
      </main>
    </div>
  )
}
