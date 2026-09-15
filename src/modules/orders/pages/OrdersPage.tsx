import { CreateCustomerModal } from '@/modules/customers/components/CreateCustomerModal'
import { useCustomers } from '@/modules/customers/hooks/useCustomers'
import type { Customer } from '@/modules/customers/types'
import { Chip } from '@/shared/ui/Chip'
import { Combobox } from '@/shared/ui/Combobox'
import { cardClass, labelClass, primaryButtonClass, tableWrapperClass, tdClass, thClass } from '@/shared/ui/formClasses'
import { getErrorMessage } from '@/shared/utils/errors'
import { AlertTriangle, ArrowRight, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
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

const STATUS_BADGE: Record<OrderStatus, string> = {
  NUEVO: 'bg-neutral-700 text-neutral-200',
  CONFIRMADO: 'bg-brasa-500/20 text-brasa-400',
  EN_PREPARACION: 'bg-brasa-500/20 text-brasa-400',
  LISTO: 'bg-emerald-500/20 text-emerald-400',
  DESPACHADO: 'bg-emerald-500/20 text-emerald-400',
  ENTREGADO: 'bg-emerald-500/20 text-emerald-500',
  CANCELADO: 'bg-red-500/20 text-red-400',
}

const FILTERS: { key: OrderStatus | 'TODOS'; label: string }[] = [
  { key: 'TODOS', label: 'Todos' },
  { key: 'NUEVO', label: 'Nuevo' },
  { key: 'CONFIRMADO', label: 'Confirmado' },
  { key: 'EN_PREPARACION', label: 'En preparación' },
  { key: 'LISTO', label: 'Listo' },
  { key: 'DESPACHADO', label: 'Despachado' },
  { key: 'ENTREGADO', label: 'Entregado' },
  { key: 'CANCELADO', label: 'Cancelado' },
]

export function OrdersPage() {
  const { data: orders, isLoading } = useOrders()
  const { data: customers } = useCustomers()
  const createOrder = useCreateOrder()
  const navigate = useNavigate()

  const [customerId, setCustomerId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<OrderStatus | 'TODOS'>('TODOS')
  const [createCustomerQuery, setCreateCustomerQuery] = useState<string | null>(null)

  const counts = useMemo(() => {
    const map = new Map<OrderStatus | 'TODOS', number>()
    map.set('TODOS', orders?.length ?? 0)
    for (const o of orders ?? []) map.set(o.status, (map.get(o.status) ?? 0) + 1)
    return map
  }, [orders])

  const filteredOrders = orders?.filter((o) => filter === 'TODOS' || o.status === filter)

  const customerOptions = useMemo(
    () => customers?.map((c) => ({ value: c.id, label: c.fullName, sublabel: c.phone ?? undefined })) ?? [],
    [customers],
  )

  async function startOrder(forCustomerId: string) {
    setError(null)
    try {
      const order = await createOrder.mutateAsync({ customerId: forCustomerId })
      navigate(`/orders/${order.id}`)
    } catch (err) {
      setError(getErrorMessage(err, 'Error al crear el pedido'))
    }
  }

  function handleCustomerCreated(customer: Customer) {
    setCreateCustomerQuery(null)
    setCustomerId(customer.id)
    void startOrder(customer.id)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-50">Pedidos</h1>

      <div className={`${cardClass} grid grid-cols-1 gap-4 sm:grid-cols-3`}>
        <div className="sm:col-span-2">
          <label className={labelClass}>Cliente *</label>
          <Combobox
            value={customerId}
            onChange={setCustomerId}
            options={customerOptions}
            placeholder="Nombre o teléfono…"
            emptyMessage="Sin clientes con ese nombre o teléfono"
            onCreateNew={(query) => setCreateCustomerQuery(query)}
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={() => customerId && startOrder(customerId)}
            disabled={createOrder.isPending || !customerId}
            className={primaryButtonClass}
          >
            <Plus size={15} /> Nuevo pedido
          </button>
        </div>
        {error && <p className="text-sm text-red-400 sm:col-span-3">{error}</p>}
      </div>

      <CreateCustomerModal
        open={createCustomerQuery !== null}
        onClose={() => setCreateCustomerQuery(null)}
        initialQuery={createCustomerQuery ?? ''}
        onCreated={handleCustomerCreated}
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} count={counts.get(f.key) ?? 0} active={filter === f.key} onClick={() => setFilter(f.key)} />
        ))}
      </div>

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
            {!isLoading && filteredOrders?.length === 0 && (
              <tr>
                <td className={tdClass} colSpan={5}>
                  No hay pedidos en este estado.
                </td>
              </tr>
            )}
            {filteredOrders?.map((order) => (
              <tr
                key={order.id}
                onClick={() => navigate(`/orders/${order.id}`)}
                className="cursor-pointer transition-colors hover:bg-neutral-900"
              >
                <td className={tdClass}>{order.customerName}</td>
                <td className={tdClass}>{new Date(order.createdAt).toLocaleString()}</td>
                <td className={tdClass}>${order.total.toFixed(2)}</td>
                <td className={tdClass}>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[order.status]}`}>
                    {STATUS_LABEL[order.status]}
                  </span>
                  {order.requiresReview && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-yellow-500/20 px-1.5 py-0.5 text-xs text-yellow-400">
                      <AlertTriangle size={11} /> revisar
                    </span>
                  )}
                </td>
                <td className={`${tdClass} text-right`}>
                  <span className="inline-flex items-center gap-1 text-brasa-500 hover:underline">
                    Ver <ArrowRight size={13} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
