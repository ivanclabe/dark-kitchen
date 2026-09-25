import { useAuth } from '@/shared/hooks/useAuth'
import { Button } from '@/shared/ui/Button'
import { typography } from '@/shared/ui/typography'
import { pendingOrganizationOf } from '@/modules/signup/api'
import { LogOut, UserX } from 'lucide-react'
import { Navigate } from 'react-router-dom'

export function NoProfilePage() {
  const { user, signOut } = useAuth()
  // Se registró, confirmó y entró por /login antes de que se creara su negocio: se termina aquí.
  if (pendingOrganizationOf(user?.user_metadata)) return <Navigate to="/registro/confirmado" replace />

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-6 text-center">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900 text-neutral-400">
          <UserX size={22} aria-hidden />
        </span>
        <h1 className={typography.h2}>Tu usuario aún no tiene acceso</h1>
        <p className={`mt-2 ${typography.small}`}>
          <span className="text-neutral-200">{user?.email}</span> inició sesión correctamente, pero todavía no pertenece a ningún negocio en Dark
          Kitchen. Pide al administrador de tu negocio que te agregue, o abre el enlace de activación que te envió.
        </p>
        <Button variant="secondary" icon={LogOut} onClick={() => void signOut()} className="mt-6 w-full">
          Cerrar sesión
        </Button>
      </div>
    </div>
  )
}
