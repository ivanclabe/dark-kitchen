import { NoProfilePage } from '@/modules/auth/pages/NoProfilePage'
import { useAuth } from '@/shared/hooks/useAuth'
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, profile, loading, profileLoading } = useAuth()

  if (loading || profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-400">
        Cargando…
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  if (!profile) return <NoProfilePage />

  return children
}
