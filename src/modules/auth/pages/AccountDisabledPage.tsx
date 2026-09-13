import { useAuth } from '@/shared/hooks/useAuth'
import { ShieldOff } from 'lucide-react'

export function AccountDisabledPage() {
  const { profile, signOut } = useAuth()

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-center">
      <div className="max-w-sm">
        <ShieldOff size={28} className="mx-auto mb-3 text-red-400" />
        <h1 className="text-lg font-semibold text-neutral-50">Cuenta desactivada</h1>
        <p className="mt-2 text-sm text-neutral-400">
          {profile?.fullName}, tu cuenta fue desactivada por un administrador. Contacta a tu administrador si crees
          que esto es un error.
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
