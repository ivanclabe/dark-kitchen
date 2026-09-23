import { AccountDisabledPage } from '@/modules/auth/pages/AccountDisabledPage'
import { NoProfilePage } from '@/modules/auth/pages/NoProfilePage'
import { LandingPage } from '@/modules/landing/pages/LandingPage'
import { useAuth } from '@/shared/hooks/useAuth'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, profile, loading, profileLoading } = useAuth()
  const { pathname } = useLocation()

  // Solo bloquea toda la pantalla en la carga inicial. Supabase dispara
  // onAuthStateChange (p.ej. TOKEN_REFRESHED) periódicamente en segundo
  // plano; si profileLoading tapara la UI en cada uno de esos eventos, el
  // usuario vería la pantalla completa parpadear a "Cargando…" en medio de
  // su trabajo cada vez que el token se renueva.
  if (loading || (profileLoading && !profile)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-400">
        Cargando…
      </div>
    )
  }

  if (!session) {
    // Sin sesión, la página de inicio es la landing (en la misma URL "/", sin
    // redirigir). Cualquier otra ruta protegida sigue llevando al login:
    // quien entra por un enlace directo viene a usar la app, no a conocerla.
    if (pathname === '/') return <LandingPage />
    return <Navigate to="/login" replace />
  }

  if (!profile) return <NoProfilePage />

  if (!profile.active) return <AccountDisabledPage />

  return children
}
