import { supabase } from '@/shared/lib/supabase'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export function SignUpAdminPage() {
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
      .insert({ auth_user_id: data.session.user.id, full_name: fullName, role: 'ADMIN' })

    if (profileError) {
      setError(
        'Ya existe un administrador registrado. Pide a un administrador que te cree una cuenta desde el módulo de Usuarios.',
      )
      setSubmitting(false)
      return
    }

    navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-8 shadow-xl">
        <h1 className="text-xl font-semibold text-neutral-50">Crear cuenta de administrador</h1>
        <p className="mt-1 text-sm text-neutral-400">Solo funciona si todavía no existe ningún usuario.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-neutral-300">
              Nombre completo
            </label>
            <input
              id="fullName"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-50 outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-neutral-300">
              Correo
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-50 outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-neutral-300">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-50 outline-none focus:border-orange-500"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          {info && <p className="text-sm text-emerald-400">{info}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-orange-600 px-3 py-2 font-medium text-white transition hover:bg-orange-500 disabled:opacity-60"
          >
            {submitting ? 'Creando…' : 'Crear cuenta'}
          </button>
        </form>

        <Link to="/login" className="mt-4 block text-center text-sm text-neutral-400 hover:text-neutral-200">
          Ya tengo cuenta
        </Link>
      </div>
    </div>
  )
}
