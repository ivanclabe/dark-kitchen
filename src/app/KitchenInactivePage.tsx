import { buttonClass } from '@/shared/ui/Button'
import { typography } from '@/shared/ui/typography'
import { ArrowLeftRight, PauseCircle } from 'lucide-react'
import { Link } from 'react-router-dom'

/** Cocina desactivada por el superusuario: sus miembros no pueden operarla (la RLS falla cerrado). */
export function KitchenInactivePage({ name }: { name: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-6 text-center">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400">
          <PauseCircle size={22} aria-hidden />
        </span>
        <h1 className={typography.h2}>Cuenta desactivada</h1>
        <p className={`mt-2 ${typography.small}`}>
          <span className="text-neutral-200">{name}</span> está desactivada. Si crees que es un error, contacta al administrador de la plataforma.
        </p>
        <Link to="/cuentas" className={`${buttonClass({ variant: 'secondary' })} mt-6 w-full`}>
          <ArrowLeftRight aria-hidden /> Ver mis cuentas
        </Link>
      </div>
    </div>
  )
}
