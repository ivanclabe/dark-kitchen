import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { useProducts } from '@/modules/products/hooks/useProducts'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { Chip } from '@/shared/ui/Chip'
import { Combobox } from '@/shared/ui/Combobox'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { EmptyState } from '@/shared/ui/EmptyState'
import { FormField, FormGrid, Input } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { ConfirmDialog } from '@/shared/ui/Modal'
import { NumberStepper } from '@/shared/ui/NumberStepper'
import { cardClass, tdClass } from '@/shared/ui/formClasses'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDateTime, formatMoney } from '@/shared/utils/format'
import { AlertTriangle, CheckCircle2, History, Plus, Trash2, UtensilsCrossed, XCircle } from 'lucide-react'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  useAddOrderItem,
  useCancelOrder,
  useConfirmOrder,
  useOrder,
  useOrderItems,
  useOrderStatusHistory,
  useRemoveOrderItem,
} from '../hooks/useOrders'
import { OrderStatusBadge, orderStatusLabel } from '../lib/orderStatus'
import type { OrderItem } from '../types'

const OBSERVATION_SUGGESTIONS = ['Sin cebolla', 'Sin tomate', 'Sin picante', 'Extra queso', 'Para llevar']

/** Fila del pie de la tabla de platos: etiqueta a la izquierda, importe bajo la columna "Total". */
function TotalRow({ label, value, trailingCols, emphasis = false }: { label: string; value: ReactNode; trailingCols: number; emphasis?: boolean }) {
  return (
    <tr>
      <td colSpan={3} className={`${tdClass} text-right ${emphasis ? 'font-semibold text-neutral-100' : 'text-neutral-400'}`}>
        {label}
      </td>
      <td className={`${tdClass} text-right tabular-nums ${emphasis ? 'font-semibold text-neutral-50' : ''}`}>{value}</td>
      <td colSpan={trailingCols} className={tdClass} />
    </tr>
  )
}

export function OrderBuilder({ orderId, statusActions = true }: { orderId: string; /** false cuando quien lo aloja ya ofrece confirmar/cancelar (tablero de Cocina). */ statusActions?: boolean }) {
  const { can } = useActiveKitchen()
  const { show } = useToast()

  const { data: order, isLoading } = useOrder(orderId)
  const { data: items, isLoading: itemsLoading } = useOrderItems(orderId)
  const { data: history } = useOrderStatusHistory(orderId)
  const { data: products } = useProducts()

  const addItem = useAddOrderItem(orderId)
  const removeItem = useRemoveOrderItem(orderId)
  const confirmOrder = useConfirmOrder(orderId)
  const cancelOrder = useCancelOrder(orderId)

  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [unitPrice, setUnitPrice] = useState('')
  const [observation, setObservation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)

  const isNuevo = order?.status === 'NUEVO'
  // Permisos del rol activo (la base los exige igual): editar el borrador, confirmarlo y cancelarlo son acciones distintas.
  const canEditItems = isNuevo && can('orders.edit')
  const canConfirm = isNuevo && can('orders.confirm')
  const canCancel = order && !['CANCELADO', 'ENTREGADO'].includes(order.status) && can('orders.cancel')

  const productOptions = useMemo(
    () =>
      products
        ?.filter((p) => p.active)
        .map((p) => ({ value: p.id, label: p.name, sublabel: formatMoney(p.price) })) ?? [],
    [products],
  )

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
        quantity,
        unitPrice: Number(unitPrice),
        observation: observation || undefined,
      })
      setProductId('')
      setQuantity(1)
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

  if (isLoading || !order) return <LoadingState variant="block" />

  const columns: DataTableColumn<OrderItem>[] = [
    { key: 'product', header: 'Plato', cell: (item) => <span className="font-medium text-neutral-100">{item.productName}</span> },
    { key: 'qty', header: 'Cantidad', cell: (item) => <span className="tabular-nums">{item.quantity}</span>, align: 'right' },
    { key: 'unit', header: 'Precio unit.', cell: (item) => <span className="tabular-nums text-neutral-400">{formatMoney(item.unitPrice)}</span>, align: 'right' },
    { key: 'total', header: 'Total', cell: (item) => <span className="tabular-nums">{formatMoney(item.lineTotal)}</span>, align: 'right' },
    { key: 'obs', header: 'Observación', cell: (item) => <span className="text-neutral-400">{item.observation ?? <span className="text-neutral-600">—</span>}</span> },
    ...(canEditItems
      ? [
          {
            key: 'actions',
            header: <span className="sr-only">Acciones</span>,
            cell: (item: OrderItem) => (
              <Button variant="link" size="sm" icon={Trash2} onClick={() => removeItem.mutate(item.id)} disabled={removeItem.isPending} className="!text-neutral-400 hover:!text-red-400">
                Quitar
              </Button>
            ),
            align: 'right' as const,
          },
        ]
      : []),
  ]
  // Columnas que quedan a la derecha de "Total" (Observación + Acciones si aplica).
  const trailingCols = canEditItems ? 2 : 1

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <OrderStatusBadge status={order.status} />
        {order.requiresReview && (
          <Badge tone="warning" icon={AlertTriangle}>
            revisar devolución
          </Badge>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      {canEditItems && (
        <form onSubmit={handleAddItem} className={`${cardClass} space-y-4`}>
          <FormGrid cols={4}>
            <FormField label="Plato" required className="sm:col-span-2">
              {() => (
                <Combobox
                  value={productId}
                  onChange={handleProductChange}
                  options={productOptions}
                  placeholder="Buscar plato…"
                  emptyMessage="Sin platos activos con ese nombre"
                  required
                />
              )}
            </FormField>
            <FormField label="Cantidad" required>
              {() => <NumberStepper value={quantity} onChange={setQuantity} min={1} step={1} required />}
            </FormField>
            <FormField label="Precio unitario" required>
              {(a11y) => <Input {...a11y} type="number" step="any" min="0" inputMode="decimal" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} required />}
            </FormField>
            <FormField label="Observación" className="sm:col-span-2 lg:col-span-4">
              {(a11y) => (
                <>
                  <Input {...a11y} value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="Ej. sin tomate" />
                  <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Sugerencias de observación">
                    {OBSERVATION_SUGGESTIONS.map((s) => (
                      <Chip key={s} label={s} active={observation === s} onClick={() => setObservation(observation === s ? '' : s)} />
                    ))}
                  </div>
                </>
              )}
            </FormField>
          </FormGrid>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" icon={Plus} loading={addItem.isPending}>
              Agregar plato
            </Button>
          </div>
        </form>
      )}

      <DataTable
        columns={columns}
        rows={items}
        getRowId={(item) => item.id}
        isLoading={itemsLoading}
        emptyState={
          <EmptyState
            icon={UtensilsCrossed}
            title="Sin platos todavía"
            description={isNuevo ? 'Agrega el primer plato con el formulario de arriba.' : 'Este pedido no tiene platos registrados.'}
            compact
          />
        }
        footer={
          <>
            <TotalRow label="Subtotal" value={formatMoney(order.subtotal)} trailingCols={trailingCols} />
            <TotalRow label="Descuento" value={`-${formatMoney(order.discount)}`} trailingCols={trailingCols} />
            <TotalRow label="Domicilio" value={`+${formatMoney(order.deliveryFee)}`} trailingCols={trailingCols} />
            <TotalRow label="Total" value={formatMoney(order.total)} trailingCols={trailingCols} emphasis />
          </>
        }
      />

      {statusActions && (canConfirm || canCancel) && (
        <div className="flex flex-wrap justify-end gap-2">
          {canCancel && (
            <Button variant="danger" icon={XCircle} onClick={() => setCancelOpen(true)}>
              Cancelar pedido
            </Button>
          )}
          {canConfirm && (
            <Button variant="primary" icon={CheckCircle2} onClick={() => setConfirmOpen(true)} disabled={!items?.length}>
              Confirmar pedido
            </Button>
          )}
        </div>
      )}

      {history && history.length > 0 && (
        <Card title="Historial de estados" icon={History}>
          <ul className="divide-y divide-neutral-800/60 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 first:pt-0 last:pb-0">
                <span className="tabular-nums text-neutral-500">{formatDateTime(h.changedAt)}</span>
                <span className="text-neutral-200">
                  {h.fromStatus ? `${orderStatusLabel(h.fromStatus)} → ` : ''}
                  {orderStatusLabel(h.toStatus)}
                </span>
                {h.note && <span className="text-neutral-500">({h.note})</span>}
              </li>
            ))}
          </ul>
        </Card>
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
