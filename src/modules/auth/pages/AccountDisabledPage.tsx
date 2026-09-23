import { useAuth } from '@/shared/hooks/useAuth'
import { Button } from '@/shared/ui/Button'
import { typography } from '@/shared/ui/typography'
import { LogOut, ShieldOff } from 'lucide-react'

export function AccountDisabledPage() {
  const { profile, signOut } = useAuth()

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-6 text-center">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
          <ShieldOff size={22} aria-hidden />
        </span>
        <h1 className={typography.h2}>Cuenta desactivada</h1>
        <p className={`mt-2 ${typography.small}`}>
          <span className="text-neutral-200">{profile?.fullName}</span>, tu cuenta fue desactivada por un administrador. Contacta a tu administrador si
          crees que esto es un error.
        </p>
        <Button variant="secondary" icon={LogOut} onClick={() => void signOut()} className="mt-6 w-full">
          Cerrar sesión
        </Button>
      </div>
    </div>
  )
}
