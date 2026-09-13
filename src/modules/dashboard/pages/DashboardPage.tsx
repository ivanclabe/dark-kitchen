import { useSalesByDay } from '@/modules/reports/hooks/useReports'
import { useAuth } from '@/shared/hooks/useAuth'
import { cardClass } from '@/shared/ui/formClasses'
import {
  AlertTriangle,
  Boxes,
  ChefHat,
  CheckCircle2,
  ClipboardList,
  Flame,
  PackageSearch,
  ShoppingCart,
  Trash2,
  TrendingUp,
  Truck,
  Wallet,
} from 'lucide-react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { useDashboardSummary } from '../hooks/useDashboard'

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string
  value: string
  hint?: string
  icon: typeof Wallet
  tone?: 'neutral' | 'good' | 'warn'
}) {
  const toneClass = tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-red-400' : 'text-brasa-500'
  return (
    <div className={`${cardClass} flex items-start gap-3`}>
      <div className={`rounded-lg bg-neutral-800/80 p-2 ${toneClass}`}>
        <Icon size={18} strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold text-neutral-50">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>}
      </div>
    </div>
  )
}

function money(n: number) {
  return `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`
}

function toDateInput(d: Date) {
  return d.toISOString().slice(0, 10)
}

function SalesTrend() {
  const today = new Date()
  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 6)
  const { data } = useSalesByDay(toDateInput(weekAgo), toDateInput(today))

  const chartData = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(weekAgo)
    d.setDate(weekAgo.getDate() + i)
    const key = toDateInput(d)
    const match = data?.find((row) => row.day === key)
    return { day: d.toLocaleDateString('es-CO', { weekday: 'short' }), total: match?.total ?? 0 }
  })

  return (
    <div className={cardClass}>
      <div className="mb-3 flex items-center gap-2">
        <TrendingUp size={16} className="text-brasa-500" />
        <h3 className="text-sm font-medium text-neutral-200">Ventas — últimos 7 días</h3>
      </div>
      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#737373', fontSize: 11 }}
              interval={0}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              contentStyle={{
                background: '#171717',
                border: '1px solid #262626',
                borderRadius: 8,
                fontSize: 12,
                color: '#e5e5e5',
              }}
              formatter={(value) => [money(Number(value)), 'Ventas']}
              labelFormatter={() => ''}
            />
            <Bar dataKey="total" radius={[6, 6, 0, 0]} fill="#f97316" maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
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
              <KpiCard
                label="Ventas de hoy"
                value={money(data.salesToday)}
                hint={`${data.ordersToday} pedidos`}
                icon={Flame}
              />
              <KpiCard
                label="Ventas de la semana"
                value={money(data.salesWeek)}
                hint={`${data.ordersWeek} pedidos`}
                icon={TrendingUp}
              />
              <KpiCard
                label="Ventas del mes"
                value={money(data.salesMonth)}
                hint={`${data.ordersMonth} pedidos`}
                icon={Wallet}
              />
              <KpiCard label="Ticket promedio (mes)" value={money(data.avgTicketMonth)} icon={ClipboardList} />
            </div>
          </section>

          <SalesTrend />

          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">Operación</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <KpiCard label="Nuevos" value={String(data.ordersNuevo)} icon={ClipboardList} />
              <KpiCard label="Confirmados" value={String(data.ordersConfirmado)} icon={CheckCircle2} />
              <KpiCard label="En preparación" value={String(data.ordersEnPreparacion)} icon={ChefHat} />
              <KpiCard label="Listos" value={String(data.ordersListo)} icon={PackageSearch} tone="good" />
              <KpiCard label="Despachados" value={String(data.ordersDespachado)} icon={Truck} />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">Inventario y compras</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard label="Valor del inventario" value={money(data.inventoryValue)} icon={Boxes} />
              <KpiCard
                label="Insumos con stock bajo"
                value={String(data.lowStockCount)}
                hint={data.lowStockCount > 0 ? 'Revisar en Inventario' : 'Todo en orden'}
                icon={data.lowStockCount > 0 ? AlertTriangle : CheckCircle2}
                tone={data.lowStockCount > 0 ? 'warn' : 'good'}
              />
              <KpiCard label="Mermas del mes" value={money(data.wasteValueMonth)} icon={Trash2} />
              <KpiCard label="Compras del mes" value={money(data.purchasesMonth)} icon={ShoppingCart} />
            </div>
          </section>
        </>
      )}
    </div>
  )
}
