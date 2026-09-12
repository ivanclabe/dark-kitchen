import { useAuth } from '@/shared/hooks/useAuth'

export function DashboardPage() {
  const { profile } = useAuth()

  return (
    <div>
      <h1 className="text-2xl font-semibold text-neutral-50">
        Hola, {profile?.fullName ?? 'usuario'}
      </h1>
      <p className="mt-2 text-sm text-neutral-400">
        Rol: {profile?.role}. Los KPIs de operación, ventas e inventario llegan en la Fase 8.
      </p>
    </div>
  )
}
