import { useAuth } from '@/shared/hooks/useAuth'
import { cardClass } from '@/shared/ui/formClasses'
import { useDashboardSummary } from '../hooks/useDashboard'

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={cardClass}>
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-neutral-50">{value}</p>
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  )
}

function money(n: number) {
  return `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`
}

export function DashboardPage() {
  const { profile } = useAuth()
  const { data, isLoading } = useDashboardSummary()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-50">Hola, {profile?.fullName ?? 'usuario'}</h1>
        <p className="mt-1 text-sm text-neutral-400">Rol: {profile?.role}</p>
      </div>

      {isLoading && <p className="text-neutral-400">Cargando…</p>}

      {data && (
        <>
          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">Ventas</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard label="Ventas de hoy" value={money(data.salesToday)} hint={`${data.ordersToday} pedidos`} />
              <KpiCard label="Ventas de la semana" value={money(data.salesWeek)} hint={`${data.ordersWeek} pedidos`} />
              <KpiCard label="Ventas del mes" value={money(data.salesMonth)} hint={`${data.ordersMonth} pedidos`} />
              <KpiCard label="Ticket promedio (mes)" value={money(data.avgTicketMonth)} />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">Operación</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <KpiCard label="Nuevos" value={String(data.ordersNuevo)} />
              <KpiCard label="Confirmados" value={String(data.ordersConfirmado)} />
              <KpiCard label="En preparación" value={String(data.ordersEnPreparacion)} />
              <KpiCard label="Listos" value={String(data.ordersListo)} />
              <KpiCard label="Despachados" value={String(data.ordersDespachado)} />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">Inventario y compras</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard label="Valor del inventario" value={money(data.inventoryValue)} />
              <KpiCard
                label="Insumos con stock bajo"
                value={String(data.lowStockCount)}
                hint={data.lowStockCount > 0 ? 'Revisar en Inventario' : 'Todo en orden'}
              />
              <KpiCard label="Mermas del mes" value={money(data.wasteValueMonth)} />
              <KpiCard label="Compras del mes" value={money(data.purchasesMonth)} />
            </div>
          </section>
        </>
      )}
    </div>
  )
}
