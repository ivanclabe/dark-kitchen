import { useCustomers } from '@/modules/customers/hooks/useCustomers'
import {
  cardClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  tableWrapperClass,
  tdClass,
  thClass,
} from '@/shared/ui/formClasses'
import { getErrorMessage } from '@/shared/utils/errors'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateOrder, useOrders } from '../hooks/useOrders'
import type { OrderStatus } from '../types'

const STATUS_LABEL: Record<OrderStatus, string> = {
  NUEVO: 'Nuevo',
  CONFIRMADO: 'Confirmado',
  EN_PREPARACION: 'En preparación',
  LISTO: 'Listo',
  DESPACHADO: 'Despachado',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
}

const STATUS_COLOR: Record<OrderStatus, string> = {
  NUEVO: 'text-neutral-300',
  CONFIRMADO: 'text-orange-400',
  EN_PREPARACION: 'text-orange-400',
  LISTO: 'text-emerald-400',
  DESPACHADO: 'text-emerald-400',
  ENTREGADO: 'text-emerald-500',
  CANCELADO: 'text-red-400',
}

export function OrdersPage() {
  const { data: orders, isLoading } = useOrders()
  const { data: customers } = useCustomers()
  const createOrder = useCreateOrder()
  const navigate = useNavigate()

  const [customerId, setCustomerId] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const order = await createOrder.mutateAsync({ customerId })
      navigate(`/orders/${order.id}`)
    } catch (err) {
      setError(getErrorMessage(err, 'Error al crear el pedido'))
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-50">Pedidos</h1>

      <form onSubmit={handleCreate} className={`${cardClass} grid grid-cols-1 gap-4 sm:grid-cols-3`}>
        <div className="sm:col-span-2">
          <label className={labelClass}>Cliente *</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputClass} required>
            <option value="">Selecciona…</option>
            {customers?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName} {c.phone ? `— ${c.phone}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button type="submit" disabled={createOrder.isPending} className={primaryButtonClass}>
            Nuevo pedido
          </button>
        </div>
        {error && <p className="text-sm text-red-400 sm:col-span-3">{error}</p>}
      </form>

      <div className={tableWrapperClass}>
        <table className="min-w-full divide-y divide-neutral-800">
          <thead className="bg-neutral-900">
            <tr>
              <th className={thClass}>Cliente</th>
              <th className={thClass}>Fecha</th>
              <th className={thClass}>Total</th>
              <th className={thClass}>Estado</th>
              <th className={thClass}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {isLoading && (
              <tr>
                <td className={tdClass} colSpan={5}>
                  Cargando…
                </td>
              </tr>
            )}
            {orders?.map((order) => (
              <tr key={order.id}>
                <td className={tdClass}>{order.customerName}</td>
                <td className={tdClass}>{new Date(order.createdAt).toLocaleString()}</td>
                <td className={tdClass}>${order.total.toFixed(2)}</td>
                <td className={`${tdClass} ${STATUS_COLOR[order.status]}`}>
                  {STATUS_LABEL[order.status]}
                  {order.requiresReview && (
                    <span className="ml-2 rounded bg-yellow-500/20 px-1.5 py-0.5 text-xs text-yellow-400">revisar</span>
                  )}
                </td>
                <td className={`${tdClass} text-right`}>
                  <button onClick={() => navigate(`/orders/${order.id}`)} className="text-orange-500 hover:underline">
                    Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
