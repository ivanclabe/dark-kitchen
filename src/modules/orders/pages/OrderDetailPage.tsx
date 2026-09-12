import { useProducts } from '@/modules/products/hooks/useProducts'
import {
  cardClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  tableWrapperClass,
  tdClass,
  thClass,
} from '@/shared/ui/formClasses'
import { getErrorMessage } from '@/shared/utils/errors'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  useAddOrderItem,
  useCancelOrder,
  useConfirmOrder,
  useOrder,
  useOrderItems,
  useOrderStatusHistory,
  useRemoveOrderItem,
} from '../hooks/useOrders'
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

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const orderId = id ?? ''

  const { data: order, isLoading } = useOrder(orderId)
  const { data: items } = useOrderItems(orderId)
  const { data: history } = useOrderStatusHistory(orderId)
  const { data: products } = useProducts()

  const addItem = useAddOrderItem(orderId)
  const removeItem = useRemoveOrderItem(orderId)
  const confirmOrder = useConfirmOrder(orderId)
  const cancelOrder = useCancelOrder(orderId)

  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitPrice, setUnitPrice] = useState('')
  const [observation, setObservation] = useState('')
  const [error, setError] = useState<string | null>(null)

  const isNuevo = order?.status === 'NUEVO'
  const canCancel = order && !['CANCELADO', 'ENTREGADO'].includes(order.status)

  function handleProductChange(id: string) {
    setProductId(id)
    const product = products?.find((p) => p.id === id)
    if (product) setUnitPrice(String(product.price))
  }

  async function handleAddItem(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await addItem.mutateAsync({
        productId,
        quantity: Number(quantity),
        unitPrice: Number(unitPrice),
        observation: observation || undefined,
      })
      setProductId('')
      setQuantity('1')
      setUnitPrice('')
      setObservation('')
    } catch (err) {
      setError(getErrorMessage(err, 'Error al agregar el plato'))
    }
  }

  async function handleConfirm() {
    setError(null)
    try {
      await confirmOrder.mutateAsync()
    } catch (err) {
      setError(getErrorMessage(err, 'Error al confirmar el pedido'))
    }
  }

  async function handleCancel() {
    setError(null)
    try {
      await cancelOrder.mutateAsync(undefined)
    } catch (err) {
      setError(getErrorMessage(err, 'Error al cancelar el pedido'))
    }
  }

  if (isLoading || !order) return <p className="text-neutral-400">Cargando…</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-50">Pedido — {order.customerName}</h1>
          <p className="text-sm text-neutral-400">
            {new Date(order.createdAt).toLocaleString()} · {STATUS_LABEL[order.status]}
            {order.requiresReview && (
              <span className="ml-2 rounded bg-yellow-500/20 px-1.5 py-0.5 text-xs text-yellow-400">
                revisar devolución
              </span>
            )}
          </p>
        </div>
        <Link to="/orders" className="text-sm text-neutral-400 hover:text-neutral-200">
          ← Volver a pedidos
        </Link>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {isNuevo && (
        <form onSubmit={handleAddItem} className={`${cardClass} grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5`}>
          <div className="lg:col-span-2">
            <label className={labelClass}>Plato</label>
            <select value={productId} onChange={(e) => handleProductChange(e.target.value)} className={inputClass} required>
              <option value="">Selecciona…</option>
              {products?.filter((p) => p.active).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (${p.price.toFixed(2)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Cantidad</label>
            <input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} required />
          </div>
          <div>
            <label className={labelClass}>Precio unitario</label>
            <input type="number" step="any" min="0" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className={inputClass} required />
          </div>
          <div>
            <label className={labelClass}>Observación</label>
            <input value={observation} onChange={(e) => setObservation(e.target.value)} className={inputClass} placeholder="Ej. sin tomate" />
          </div>
          <div className="flex items-end lg:col-span-5">
            <button type="submit" disabled={addItem.isPending} className={primaryButtonClass}>
              Agregar plato
            </button>
          </div>
        </form>
      )}

      <div className={tableWrapperClass}>
        <table className="min-w-full divide-y divide-neutral-800">
          <thead className="bg-neutral-900">
            <tr>
              <th className={thClass}>Plato</th>
              <th className={thClass}>Cantidad</th>
              <th className={thClass}>Precio unit.</th>
              <th className={thClass}>Total</th>
              <th className={thClass}>Observación</th>
              {isNuevo && <th className={thClass}></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {items?.map((item) => (
              <tr key={item.id}>
                <td className={tdClass}>{item.productName}</td>
                <td className={tdClass}>{item.quantity}</td>
                <td className={tdClass}>${item.unitPrice.toFixed(2)}</td>
                <td className={tdClass}>${item.lineTotal.toFixed(2)}</td>
                <td className={tdClass}>{item.observation ?? '—'}</td>
                {isNuevo && (
                  <td className={`${tdClass} text-right`}>
                    <button onClick={() => removeItem.mutate(item.id)} className="text-neutral-400 hover:underline">
                      Quitar
                    </button>
                  </td>
                )}
              </tr>
            ))}
            <tr>
              <td className={tdClass}>Subtotal</td>
              <td className={tdClass} colSpan={3}>
                ${order.subtotal.toFixed(2)}
              </td>
              <td className={tdClass}></td>
              {isNuevo && <td className={tdClass}></td>}
            </tr>
            <tr>
              <td className={tdClass}>Descuento</td>
              <td className={tdClass} colSpan={3}>
                -${order.discount.toFixed(2)}
              </td>
              <td className={tdClass}></td>
              {isNuevo && <td className={tdClass}></td>}
            </tr>
            <tr>
              <td className={tdClass}>Domicilio</td>
              <td className={tdClass} colSpan={3}>
                +${order.deliveryFee.toFixed(2)}
              </td>
              <td className={tdClass}></td>
              {isNuevo && <td className={tdClass}></td>}
            </tr>
            <tr>
              <td className={`${tdClass} font-medium`}>Total</td>
              <td className={`${tdClass} font-medium`} colSpan={3}>
                ${order.total.toFixed(2)}
              </td>
              <td className={tdClass}></td>
              {isNuevo && <td className={tdClass}></td>}
            </tr>
          </tbody>
        </table>
      </div>

      <div className={`${cardClass} flex flex-wrap gap-3`}>
        {isNuevo && (
          <button onClick={handleConfirm} disabled={confirmOrder.isPending || !items?.length} className={primaryButtonClass}>
            Confirmar pedido (reserva inventario y genera comanda)
          </button>
        )}
        {canCancel && (
          <button onClick={handleCancel} disabled={cancelOrder.isPending} className={secondaryButtonClass}>
            Cancelar pedido
          </button>
        )}
      </div>

      {history && history.length > 0 && (
        <div className={cardClass}>
          <h2 className="mb-3 font-medium text-neutral-100">Historial de estados</h2>
          <ul className="space-y-1 text-sm text-neutral-400">
            {history.map((h) => (
              <li key={h.id}>
                {new Date(h.changedAt).toLocaleString()} — {h.fromStatus ? `${STATUS_LABEL[h.fromStatus]} → ` : ''}
                {STATUS_LABEL[h.toStatus]}
                {h.note ? ` (${h.note})` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
