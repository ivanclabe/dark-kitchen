import { useProducts } from '@/modules/products/hooks/useProducts'
import { ConfirmDialog } from '@/shared/ui/Modal'
import {
  cardClass,
  dangerButtonClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  tableWrapperClass,
  tdClass,
  thClass,
} from '@/shared/ui/formClasses'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { AlertTriangle, ArrowLeft, CheckCircle2, Plus, Trash2, XCircle } from 'lucide-react'
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

const STATUS_BADGE: Record<OrderStatus, string> = {
  NUEVO: 'bg-neutral-700 text-neutral-200',
  CONFIRMADO: 'bg-brasa-500/20 text-brasa-400',
  EN_PREPARACION: 'bg-brasa-500/20 text-brasa-400',
  LISTO: 'bg-emerald-500/20 text-emerald-400',
  DESPACHADO: 'bg-emerald-500/20 text-emerald-400',
  ENTREGADO: 'bg-emerald-500/20 text-emerald-500',
  CANCELADO: 'bg-red-500/20 text-red-400',
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const orderId = id ?? ''
  const { show } = useToast()

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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)

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
      setConfirmOpen(false)
      show('Pedido confirmado — inventario reservado y comanda enviada a cocina.')
    } catch (err) {
      setError(getErrorMessage(err, 'Error al confirmar el pedido'))
      show(getErrorMessage(err, 'Error al confirmar el pedido'), 'error')
    }
  }

  async function handleCancel() {
    setError(null)
    try {
      await cancelOrder.mutateAsync(undefined)
      setCancelOpen(false)
      show('Pedido cancelado.', 'info')
    } catch (err) {
      setError(getErrorMessage(err, 'Error al cancelar el pedido'))
      show(getErrorMessage(err, 'Error al cancelar el pedido'), 'error')
    }
  }

  if (isLoading || !order) return <p className="text-neutral-400">Cargando…</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-50">Pedido — {order.customerName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutral-400">
            <span>{new Date(order.createdAt).toLocaleString()}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[order.status]}`}>
              {STATUS_LABEL[order.status]}
            </span>
            {order.requiresReview && (
              <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-400">
                <AlertTriangle size={12} /> revisar devolución
              </span>
            )}
          </div>
        </div>
        <Link to="/orders" className="inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-200">
          <ArrowLeft size={14} /> Volver a pedidos
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
              <Plus size={15} /> Agregar plato
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
                    <button
                      onClick={() => removeItem.mutate(item.id)}
                      className="inline-flex items-center gap-1 text-neutral-400 hover:text-red-400 hover:underline"
                    >
                      <Trash2 size={13} /> Quitar
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
          <button onClick={() => setConfirmOpen(true)} disabled={!items?.length} className={primaryButtonClass}>
            <CheckCircle2 size={15} /> Confirmar pedido
          </button>
        )}
        {canCancel && (
          <button onClick={() => setCancelOpen(true)} className={dangerButtonClass}>
            <XCircle size={15} /> Cancelar pedido
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

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
        title="Confirmar pedido"
        confirmLabel="Sí, confirmar"
        pending={confirmOrder.isPending}
        description={
          <p>
            Esto reserva el inventario necesario para los {items?.length ?? 0} plato(s) del pedido y envía la comanda a
            cocina. Si algún insumo no tiene stock suficiente, la confirmación se rechazará.
          </p>
        }
      />

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={handleCancel}
        title="Cancelar pedido"
        confirmLabel="Sí, cancelar"
        danger
        pending={cancelOrder.isPending}
        description={
          <p>
            Esta acción no se puede deshacer. Si el pedido ya reservó inventario, la reserva se libera; si algún plato ya
            fue preparado (consumo registrado), se generará una devolución que quedará marcada para revisión.
          </p>
        }
      />
    </div>
  )
}
