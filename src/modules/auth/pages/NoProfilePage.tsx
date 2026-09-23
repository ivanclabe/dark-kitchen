import { useAuth } from '@/shared/hooks/useAuth'
import { Button } from '@/shared/ui/Button'
import { typography } from '@/shared/ui/typography'
import { LogOut, UserX } from 'lucide-react'

export function NoProfilePage() {
  const { user, signOut } = useAuth()

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-6 text-center">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900 text-neutral-400">
          <UserX size={22} aria-hidden />
        </span>
        <h1 className={typography.h2}>Cuenta sin perfil asignado</h1>
        <p className={`mt-2 ${typography.small}`}>
          <span className="text-neutral-200">{user?.email}</span> inició sesión correctamente, pero no tiene un perfil en Dark Kitchen. Pide a un
          administrador que te cree una cuenta desde el módulo de Usuarios.
        </p>
        <Button variant="secondary" icon={LogOut} onClick={() => void signOut()} className="mt-6 w-full">
          Cerrar sesión
        </Button>
      </div>
    </div>
  )
}
