import { useAuth } from '@/shared/hooks/useAuth'

export function NoProfilePage() {
  const { user, signOut } = useAuth()

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-center">
      <div className="max-w-sm">
        <h1 className="text-lg font-semibold text-neutral-50">Cuenta sin perfil asignado</h1>
        <p className="mt-2 text-sm text-neutral-400">
          {user?.email} inició sesión correctamente, pero no tiene un perfil en Dark Kitchen. Pide a un
          administrador que te cree una cuenta desde el módulo de Usuarios.
        </p>
        <button
          onClick={() => void signOut()}
          className="mt-4 rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
