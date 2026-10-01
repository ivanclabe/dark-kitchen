import { useAuth } from '@/shared/hooks/useAuth'
import { appUrl } from '@/shared/lib/appUrl'
import { kitchenPath, MY_KITCHENS_KEY } from '@/shared/kitchen/activeKitchenContext'
import { supabase } from '@/shared/lib/supabase'
import { Button } from '@/shared/ui/Button'
import { FormField, Input } from '@/shared/ui/FormField'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Flame, LogIn, LogOut, Mail, UserCheck } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { acceptActivation, loginNeedsPassword, previewActivation, type ActivationStatus } from '../api'

const STATUS_MESSAGE: Record<Exclude<ActivationStatus, 'valid'>, string> = {
  expired: 'Este enlace venció. Pide a tu administrador uno nuevo.',
  used: 'Este enlace ya se usó. Si es tuyo, solo inicia sesión.',
  revoked: 'Este enlace fue reemplazado por uno más nuevo. Usa el último que te enviaron.',
  organization_inactive: 'Este negocio está desactivado.',
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
 * Activación de un usuario creado por un administrador (/activar/:token,
 * ADR 0008 sección 10). Sin sesión: la persona define su contraseña (o, si
 * ya tiene usuario en la plataforma, inicia sesión). Con sesión: activa con
 * un clic. La base valida que el correo de la sesión sea el del usuario.
 * Si la sesión viene de una invitación por correo (portal Global Admin,
 * ADR 0019) y aún no tiene contraseña, primero la crea.
 */
export function ActivationPage() {
  const { token = '' } = useParams<{ token: string }>()
  const { session, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: preview, isLoading, isError } = useQuery({ queryKey: ['activation', token], queryFn: () => previewActivation(token), retry: false })
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const sessionMatches = Boolean(session && preview && session.user.email?.toLowerCase() === preview.email)
  const { data: needsPassword, isLoading: checkingPassword } = useQuery({
    queryKey: ['activation', token, 'needs-password', session?.user.id],
    queryFn: loginNeedsPassword,
    enabled: sessionMatches && preview?.status === 'valid',
    retry: false,
  })

  async function activate() {
    setBusy(true)
    setError(null)
    try {
      const slug = await acceptActivation(token)
      await refreshProfile()
      await queryClient.invalidateQueries({ queryKey: MY_KITCHENS_KEY })
      navigate(slug ? kitchenPath(slug, '/') : '/cuentas', { replace: true })
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo activar tu usuario'))
      setBusy(false)
    }
  }

  async function createPasswordAndActivate(e: FormEvent) {
    e.preventDefault()
    if (!preview) return
    setBusy(true)
    setError(null)
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: preview.email,
      password,
      options: { data: { full_name: preview.fullName }, emailRedirectTo: appUrl(`/activar/${token}`) },
    })
    if (signUpError) {
      setError(signUpError.message)
      setBusy(false)
      return
    }
    if (!data.session) {
      setInfo(`Te enviamos un correo a ${preview.email}. Confírmalo y vuelve a abrir este mismo enlace para terminar.`)
      setBusy(false)
      return
    }
    await activate()
  }

  async function setPasswordAndActivate(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(updateError.message)
      setBusy(false)
      return
    }
    await activate()
  }

  async function sendAccessLink() {
    if (!preview) return
    setBusy(true)
    setError(null)
    const { error: otpError } = await supabase.auth.signInWithOtp({ email: preview.email, options: { emailRedirectTo: appUrl(`/activar/${token}`), shouldCreateUser: false } })
    setBusy(false)
    if (otpError) setError(otpError.message)
    else setInfo(`Te enviamos un enlace a ${preview.email}. Ábrelo para crear tu contraseña y terminar.`)
  }

  const passwordField = (
    <FormField label="Crea tu contraseña" required hint="Mínimo 8 caracteres." error={error}>
      {(a11y) => <Input {...a11y} type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />}
    </FormField>
  )

  if (isLoading) return <Shell><p className={typography.small}>Cargando…</p></Shell>

  if (isError || !preview) {
    return (
      <Shell>
        <p className="flex items-center gap-2 font-medium text-neutral-100"><AlertTriangle size={16} className="text-amber-400" /> Enlace no válido</p>
        <p className={typography.small}>Revisa que el enlace esté completo o pide uno nuevo a tu administrador.</p>
        <Link to="/login" className="block text-sm text-brasa-400 hover:underline">Ir a iniciar sesión</Link>
      </Shell>
    )
  }

  const header = (
    <div>
      <p className={typography.overline}>Activa tu usuario</p>
      <h1 className={`mt-1 ${typography.h2}`}>{preview.organizationName}</h1>
      <p className={`mt-1 ${typography.small}`}>
        Hola, <span className="text-neutral-100">{preview.fullName}</span> · {preview.email}
      </p>
    </div>
  )

  if (preview.status !== 'valid') {
    return (
      <Shell>
        {header}
        <p role="alert" className="text-sm text-amber-300">{STATUS_MESSAGE[preview.status]}</p>
        <Link to="/login" className="block text-sm text-brasa-400 hover:underline">Ir a iniciar sesión</Link>
      </Shell>
    )
  }

  const loginLink = (
    <Link to={`/login?next=${encodeURIComponent(`/activar/${token}`)}`} className="flex items-center justify-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-200">
      <LogIn size={14} aria-hidden /> Ya tengo usuario: iniciar sesión
    </Link>
  )

  if (session) {
    const sessionEmail = session.user.email?.toLowerCase()
    return (
      <Shell>
        {header}
        {sessionMatches && checkingPassword ? (
          <p className={typography.small}>Cargando…</p>
        ) : sessionMatches && needsPassword ? (
          <form onSubmit={(e) => void setPasswordAndActivate(e)} className="space-y-4" noValidate>
            <p className={typography.small}>Crea tu contraseña para entrar a Quanela de ahora en adelante.</p>
            {passwordField}
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={password.length < 8}>
              Crear contraseña y entrar
            </Button>
          </form>
        ) : sessionEmail === preview.email ? (
          <Button variant="primary" size="lg" icon={UserCheck} className="w-full" loading={busy} onClick={() => void activate()}>
            Activar y entrar a {preview.organizationName}
          </Button>
        ) : (
          <>
            <p role="alert" className="text-sm text-amber-300">
              Entraste como {sessionEmail}, pero este enlace es para {preview.email}. Cierra sesión y entra con ese correo.
            </p>
            <Button variant="secondary" icon={LogOut} className="w-full" onClick={() => void signOut()}>
              Cerrar sesión
            </Button>
          </>
        )}
        {error && !needsPassword && <p role="alert" className="text-sm text-red-400">{error}</p>}
      </Shell>
    )
  }

  if (preview.hasUser) {
    return (
      <Shell>
        {header}
        <p className={typography.small}>Ya tienes usuario en Quanela. Inicia sesión con tu correo para unirte a {preview.organizationName}.</p>
        <Button variant="primary" size="lg" icon={LogIn} className="w-full" onClick={() => navigate(`/login?next=${encodeURIComponent(`/activar/${token}`)}`)}>
          Iniciar sesión
        </Button>
        {info ? (
          <p role="status" className="text-sm text-emerald-400">{info}</p>
        ) : (
          <Button variant="ghost" icon={Mail} className="w-full" loading={busy} onClick={() => void sendAccessLink()}>
            Aún no tengo contraseña: envíame un enlace
          </Button>
        )}
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      </Shell>
    )
  }

  return (
    <Shell>
      {header}
      {info ? (
        <p role="status" className="text-sm text-emerald-400">{info}</p>
      ) : (
        <form onSubmit={(e) => void createPasswordAndActivate(e)} className="space-y-4" noValidate>
          <FormField label="Correo">
            {(a11y) => <Input {...a11y} value={preview.email} readOnly disabled />}
          </FormField>
          {passwordField}
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={password.length < 8}>
            Activar mi usuario
          </Button>
        </form>
      )}
      {loginLink}
    </Shell>
  )
}
