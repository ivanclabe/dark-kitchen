import { useAuth } from '@/shared/hooks/useAuth'
import { Button } from '@/shared/ui/Button'
import { FormField, Input } from '@/shared/ui/FormField'
import { typography } from '@/shared/ui/typography'
import { ArrowLeft, Flame } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'

export function LoginPage() {
  const { session, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await signIn(email, password)
    if (error) setError(error)
    setSubmitting(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-brasa-500 shadow-[0_8px_24px_-8px_var(--color-brasa-500)]">
            <Flame size={24} className="text-white" strokeWidth={2.5} aria-hidden />
          </span>
          <div>
            <h1 className={typography.h1}>Dark Kitchen</h1>
            <p className={`mt-1 ${typography.small}`}>Inicia sesión para continuar</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-6" noValidate>
          <FormField label="Correo" required>
            {(a11y) => <Input {...a11y} type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />}
          </FormField>
          <FormField label="Contraseña" required error={error}>
            {(a11y) => <Input {...a11y} type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </FormField>
          <Button type="submit" variant="primary" size="lg" loading={submitting} className="w-full">
            Ingresar
          </Button>
        </form>

        <Link to="/signup-staff" className="mt-6 block text-center text-sm text-neutral-400 transition-colors hover:text-neutral-200">
          ¿Eres nuevo en el equipo? <span className="text-brasa-400">Crear cuenta</span>
        </Link>
        <Link to="/" className="mt-3 flex items-center justify-center gap-1 text-sm text-neutral-500 transition-colors hover:text-neutral-300">
          <ArrowLeft size={14} aria-hidden /> Volver al inicio
        </Link>
      </div>
    </div>
  )
}
