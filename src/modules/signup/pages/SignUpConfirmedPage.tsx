import { FullScreenLoading } from '@/app/FullScreenLoading'
import { useAuth } from '@/shared/hooks/useAuth'
import { kitchenPath, MY_KITCHENS_KEY } from '@/shared/kitchen/activeKitchenContext'
import { Button } from '@/shared/ui/Button'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, RotateCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { createOrganization, pendingOrganizationOf } from '../api'

/**
 * Vuelta del enlace de confirmación (y "termina de crear tu negocio" si la
 * persona entró por /login): crea la organización y su primera Cuenta con
 * los datos del registro y entra directo, con una bienvenida. Idempotente:
 * abrir el enlace dos veces lleva a la misma Cuenta.
 */
export function SignUpConfirmedPage() {
  const { session, loading, refreshProfile } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const started = useRef(-1)
  const pending = pendingOrganizationOf(session?.user.user_metadata)
  const fullName = session?.user.user_metadata?.full_name as string | undefined

  useEffect(() => {
    if (!session || !pending || started.current === attempt) return
    started.current = attempt
    createOrganization(pending, fullName)
      .then(async (slug) => {
        await refreshProfile()
        await queryClient.invalidateQueries({ queryKey: MY_KITCHENS_KEY })
        navigate(`${kitchenPath(slug, '/')}?bienvenida=1`, { replace: true })
      })
      .catch((err) => setError(getErrorMessage(err, 'No se pudo preparar tu negocio')))
  }, [session, pending, fullName, attempt, refreshProfile, queryClient, navigate])

  if (loading) return <FullScreenLoading />
  // Sin sesión (enlace vencido o abierto en otro navegador): iniciar sesión termina el proceso.
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent('/registro/confirmado')}`} replace />
  if (!pending) return <Navigate to="/" replace />

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-neutral-100">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-6 text-center">
        {error ? (
          <>
            <p className="flex items-center justify-center gap-2 font-medium">
              <AlertTriangle size={16} className="text-amber-400" aria-hidden /> No pudimos terminar
            </p>
            <p className={typography.small}>{error}</p>
            <Button variant="primary" icon={RotateCw} className="w-full" onClick={() => { setError(null); setAttempt((a) => a + 1) }}>
              Intentar de nuevo
            </Button>
            <Link to="/login" className="block text-sm text-neutral-400 hover:text-neutral-200">
              Volver a iniciar sesión
            </Link>
          </>
        ) : (
          <>
            <Loader2 size={24} className="mx-auto animate-spin text-brasa-400" aria-hidden />
            <p className="font-medium">Preparando {pending.name}…</p>
            <p className={typography.small}>Estamos creando tu organización y tu primera cuenta.</p>
          </>
        )}
      </div>
    </div>
  )
}
