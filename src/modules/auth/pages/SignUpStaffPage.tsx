import { supabase } from '@/shared/lib/supabase'
import { Button } from '@/shared/ui/Button'
import { FormField, Input } from '@/shared/ui/FormField'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { Flame } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export function SignUpStaffPage() {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setInfo(null)

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password })

    if (signUpError) {
      setError(signUpError.message)
      setSubmitting(false)
      return
    }

    if (!data.session) {
      setInfo('Revisa tu correo para confirmar la cuenta y luego inicia sesión para completar tu perfil.')
      setSubmitting(false)
      return
    }

    const { error: profileError } = await supabase
      .from('dk_users')
      .insert({ auth_user_id: data.session.user.id, full_name: fullName, role: 'CASHIER', active: true })

    if (profileError) {
      setError(getErrorMessage(profileError, 'No se pudo crear tu perfil. Contacta a un administrador.'))
      setSubmitting(false)
      return
    }

    navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-brasa-500 shadow-[0_8px_24px_-8px_var(--color-brasa-500)]">
            <Flame size={24} className="text-white" strokeWidth={2.5} aria-hidden />
          </span>
          <div>
            <h1 className={typography.h1}>Crear cuenta de personal</h1>
            <p className={`mt-1 ${typography.small}`}>
              Tu cuenta se crea con permisos básicos (caja). Un administrador debe asignarte el rol correcto desde "Usuarios" antes de que puedas usar el
              resto de módulos.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-6" noValidate>
          <FormField label="Nombre completo" required>
            {(a11y) => <Input {...a11y} required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />}
          </FormField>
          <FormField label="Correo" required>
            {(a11y) => <Input {...a11y} type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </FormField>
          <FormField label="Contraseña" required hint="Mínimo 6 caracteres.">
            {(a11y) => (
              <Input {...a11y} type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            )}
          </FormField>

          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          {info && (
            <p role="status" className="text-sm text-emerald-400">
              {info}
            </p>
          )}

          <Button type="submit" variant="primary" size="lg" loading={submitting} className="w-full">
            Crear cuenta
          </Button>
        </form>

        <Link to="/login" className="mt-6 block text-center text-sm text-neutral-400 transition-colors hover:text-neutral-200">
          ¿Ya tienes cuenta? <span className="text-brasa-400">Iniciar sesión</span>
        </Link>
      </div>
    </div>
  )
}
