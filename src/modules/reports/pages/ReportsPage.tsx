import { cardClass, inputClass, secondaryButtonClass, tableWrapperClass, tdClass, thClass } from '@/shared/ui/formClasses'
import { useState } from 'react'
import {
  usePurchasesBySupplier,
  useProfitability,
  useSalesByDay,
  useTopIngredientsPurchased,
  useTopProducts,
  useWasteReport,
} from '../hooks/useReports'

type ReportKey = 'ventas' | 'productos' | 'compras' | 'insumos' | 'mermas' | 'rentabilidad'

const REPORT_TABS: { key: ReportKey; label: string }[] = [
  { key: 'ventas', label: 'Ventas' },
  { key: 'productos', label: 'Productos más vendidos' },
  { key: 'compras', label: 'Compras por proveedor' },
  { key: 'insumos', label: 'Insumos más comprados' },
  { key: 'mermas', label: 'Mermas' },
  { key: 'rentabilidad', label: 'Rentabilidad' },
]

function money(n: number) {
  return `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`
}

function toDateInput(d: Date) {
  return d.toISOString().slice(0, 10)
}

function SalesChart({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useSalesByDay(from, to)
  if (isLoading) return <p className="text-neutral-400">Cargando…</p>
  if (!data || data.length === 0) return <p className="text-neutral-400">Sin ventas en este rango.</p>

  const max = Math.max(...data.map((d) => d.total), 1)

  return (
    <div className="space-y-4">
      <div className={`${cardClass} flex items-end gap-1 overflow-x-auto`} style={{ height: 180 }}>
        {data.map((d) => (
          <div key={d.day} className="flex flex-col items-center justify-end" style={{ minWidth: 24 }}>
            <div
              className="w-4 rounded-t bg-orange-500"
              style={{ height: `${Math.max(4, (d.total / max) * 140)}px` }}
              title={`${d.day}: ${money(d.total)}`}
            />
          </div>
        ))}
      </div>
      <div className={tableWrapperClass}>
        <table className="min-w-full divide-y divide-neutral-800">
          <thead className="bg-neutral-900">
            <tr>
              <th className={thClass}>Fecha</th>
              <th className={thClass}>Pedidos</th>
              <th className={thClass}>Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {data.map((d) => (
              <tr key={d.day}>
                <td className={tdClass}>{d.day}</td>
                <td className={tdClass}>{d.orderCount}</td>
                <td className={tdClass}>{money(d.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TopProductsTable({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useTopProducts(from, to)
  if (isLoading) return <p className="text-neutral-400">Cargando…</p>
  return (
    <div className={tableWrapperClass}>
      <table className="min-w-full divide-y divide-neutral-800">
        <thead className="bg-neutral-900">
          <tr>
            <th className={thClass}>Plato</th>
            <th className={thClass}>Cantidad vendida</th>
            <th className={thClass}>Ingresos</th>
            <th className={thClass}>Margen estimado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800 bg-neutral-950">
          {data?.length === 0 && (
            <tr>
              <td className={tdClass} colSpan={4}>
                Sin ventas en este rango.
              </td>
            </tr>
          )}
          {data?.map((p) => (
            <tr key={p.productId}>
              <td className={tdClass}>{p.productName}</td>
              <td className={tdClass}>{p.qtySold}</td>
              <td className={tdClass}>{money(p.revenue)}</td>
              <td className={`${tdClass} ${p.margin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{money(p.margin)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PurchasesBySupplierTable({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = usePurchasesBySupplier(from, to)
  if (isLoading) return <p className="text-neutral-400">Cargando…</p>
  return (
    <div className={tableWrapperClass}>
      <table className="min-w-full divide-y divide-neutral-800">
        <thead className="bg-neutral-900">
          <tr>
            <th className={thClass}>Proveedor</th>
            <th className={thClass}>N.º de compras</th>
            <th className={thClass}>Total comprado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800 bg-neutral-950">
          {data?.length === 0 && (
            <tr>
              <td className={tdClass} colSpan={3}>
                Sin compras confirmadas en este rango.
              </td>
            </tr>
          )}
          {data?.map((s) => (
            <tr key={s.supplierId}>
              <td className={tdClass}>{s.supplierName}</td>
              <td className={tdClass}>{s.purchaseCount}</td>
              <td className={tdClass}>{money(s.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TopIngredientsTable({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useTopIngredientsPurchased(from, to)
  if (isLoading) return <p className="text-neutral-400">Cargando…</p>
  return (
    <div className={tableWrapperClass}>
      <table className="min-w-full divide-y divide-neutral-800">
        <thead className="bg-neutral-900">
          <tr>
            <th className={thClass}>Insumo</th>
            <th className={thClass}>Cantidad comprada</th>
            <th className={thClass}>Costo total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800 bg-neutral-950">
          {data?.length === 0 && (
            <tr>
              <td className={tdClass} colSpan={3}>
                Sin compras en este rango.
              </td>
            </tr>
          )}
          {data?.map((i) => (
            <tr key={i.ingredientId}>
              <td className={tdClass}>{i.ingredientName}</td>
              <td className={tdClass}>{i.quantity}</td>
              <td className={tdClass}>{money(i.totalCost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function WasteTable({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useWasteReport(from, to)
  if (isLoading) return <p className="text-neutral-400">Cargando…</p>
  return (
    <div className={tableWrapperClass}>
      <table className="min-w-full divide-y divide-neutral-800">
        <thead className="bg-neutral-900">
          <tr>
            <th className={thClass}>Insumo</th>
            <th className={thClass}>Cantidad</th>
            <th className={thClass}>Valor estimado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800 bg-neutral-950">
          {data?.length === 0 && (
            <tr>
              <td className={tdClass} colSpan={3}>
                Sin mermas registradas en este rango.
              </td>
            </tr>
          )}
          {data?.map((w) => (
            <tr key={w.ingredientId}>
              <td className={tdClass}>{w.ingredientName}</td>
              <td className={tdClass}>{w.quantity}</td>
              <td className={tdClass}>{money(w.estimatedValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ProfitabilitySummary({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useProfitability(from, to)
  if (isLoading) return <p className="text-neutral-400">Cargando…</p>
  if (!data) return null
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className={cardClass}>
        <p className="text-xs uppercase tracking-wide text-neutral-500">Ventas del periodo</p>
        <p className="mt-1 text-2xl font-semibold text-neutral-50">{money(data.revenue)}</p>
      </div>
      <div className={cardClass}>
        <p className="text-xs uppercase tracking-wide text-neutral-500">Costo de insumos consumidos</p>
        <p className="mt-1 text-2xl font-semibold text-neutral-50">{money(data.cogs)}</p>
      </div>
      <div className={cardClass}>
        <p className="text-xs uppercase tracking-wide text-neutral-500">Margen bruto</p>
        <p className={`mt-1 text-2xl font-semibold ${data.grossMargin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {money(data.grossMargin)}
        </p>
      </div>
      <p className="text-xs text-neutral-500 sm:col-span-3">
        Rentabilidad general = ventas del periodo (pedidos no cancelados) − costo real de los insumos consumidos, tomado
        del ledger de inventario (movimientos CONSUMO) al costo promedio vigente en el momento de cada consumo.
      </p>
    </div>
  )
}

export function ReportsPage() {
  const today = new Date()
  const monthAgo = new Date(today)
  monthAgo.setDate(monthAgo.getDate() - 29)

  const [from, setFrom] = useState(toDateInput(monthAgo))
  const [to, setTo] = useState(toDateInput(today))
  const [tab, setTab] = useState<ReportKey>('ventas')

  function applyPreset(preset: 'hoy' | 'semana' | 'mes') {
    const end = new Date()
    const start = new Date()
    if (preset === 'semana') start.setDate(end.getDate() - 6)
    if (preset === 'mes') start.setDate(end.getDate() - 29)
    setFrom(toDateInput(start))
    setTo(toDateInput(end))
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-50">Reportes</h1>

      <div className={`${cardClass} flex flex-wrap items-end gap-3`}>
        <div>
          <label className="block text-sm font-medium text-neutral-300">Desde</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-300">Hasta</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
        </div>
        <button onClick={() => applyPreset('hoy')} className={secondaryButtonClass}>
          Hoy
        </button>
        <button onClick={() => applyPreset('semana')} className={secondaryButtonClass}>
          7 días
        </button>
        <button onClick={() => applyPreset('mes')} className={secondaryButtonClass}>
          30 días
        </button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-neutral-800 pb-2">
        {REPORT_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === t.key ? 'bg-orange-600 text-white' : 'text-neutral-400 hover:bg-neutral-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ventas' && <SalesChart from={from} to={to} />}
      {tab === 'productos' && <TopProductsTable from={from} to={to} />}
      {tab === 'compras' && <PurchasesBySupplierTable from={from} to={to} />}
      {tab === 'insumos' && <TopIngredientsTable from={from} to={to} />}
      {tab === 'mermas' && <WasteTable from={from} to={to} />}
      {tab === 'rentabilidad' && <ProfitabilitySummary from={from} to={to} />}
    </div>
  )
}
