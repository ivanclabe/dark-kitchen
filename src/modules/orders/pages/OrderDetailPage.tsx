import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { OrderBuilder } from '../components/OrderBuilder'
import { useOrder } from '../hooks/useOrders'

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const orderId = id ?? ''

  const { data: order, isLoading } = useOrder(orderId)

  if (isLoading || !order) return <p className="text-neutral-400">Cargando…</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-50">Pedido — {order.customerName}</h1>
          <p className="mt-1 text-sm text-neutral-400">{new Date(order.createdAt).toLocaleString()}</p>
        </div>
        <Link to="/orders" className="inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-200">
          <ArrowLeft size={14} /> Volver a pedidos
        </Link>
      </div>

      <OrderBuilder orderId={orderId} />
    </div>
  )
}
