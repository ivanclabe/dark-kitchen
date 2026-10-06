import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { useProducts } from '@/modules/products/hooks/useProducts'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { Chip } from '@/shared/ui/Chip'
import { ProductThumb } from '@/modules/products/components/ProductImage'
import { Combobox } from '@/shared/ui/Combobox'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { EmptyState } from '@/shared/ui/EmptyState'
import { FormField, FormGrid, Input } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { NumberStepper } from '@/shared/ui/NumberStepper'
import { cardClass, tdClass } from '@/shared/ui/formClasses'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDateTime, formatMoney } from '@/shared/utils/format'
import { CheckCircle2, History, Plus, Trash2, UtensilsCrossed, XCircle } from 'lucide-react'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useAddOrderItem, useOrder, useOrderStatusHistory, useRemoveOrderItem } from '../hooks/useOrders'
import { orderStatusLabel } from '../lib/orderStatus'
import type { Order, OrderItem } from '../types'

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

/**
 * The dishes and totals of an order (and, while it is a draft, adding and
 * removing them) plus its status timeline. Confirming and cancelling are the
 * board's dialogs (ADR 0031: one confirm, one cancel with its reason); the
 * host passes them when it offers them here.
 */
export function OrderBuilder({ orderId, onConfirm, onCancel }: { orderId: string; onConfirm?: (order: Order) => void; onCancel?: (order: Order) => void }) {
  const { can } = useActiveKitchen()

  const { data: order, isLoading } = useOrder(orderId)
  const items = order?.items
  const itemsLoading = isLoading
  const { data: history } = useOrderStatusHistory(orderId)

  const addItem = useAddOrderItem(orderId)
  const removeItem = useRemoveOrderItem()

  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [unitPrice, setUnitPrice] = useState('')
  const [observation, setObservation] = useState('')
  const [error, setError] = useState<string | null>(null)

  const isNuevo = order?.status === 'NUEVO'
  // Permisos del rol activo (la base los exige igual): editar el borrador, confirmarlo y cancelarlo son acciones distintas.
  const canEditItems = isNuevo && can('orders.edit')
  // The dish picker needs the products; only a draft being edited loads them (ADR 0031).
  const { data: products } = useProducts(canEditItems)
  const canConfirm = isNuevo && can('orders.confirm') && !!onConfirm
  const canCancel = order && !['CANCELADO', 'ENTREGADO'].includes(order.status) && can('orders.cancel') && !!onCancel

  const productOptions = useMemo(
    () =>
      products
        ?.filter((p) => p.active)
        .map((p) => ({
          value: p.id,
          label: p.name,
          sublabel: formatMoney(p.price),
          leading: <ProductThumb name={p.name} path={p.imagePath} toneSeed={p.categoryName} size="sm" />,
        })) ?? [],
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

      {(canConfirm || canCancel) && (
        <div className="flex flex-wrap justify-end gap-2">
          {canCancel && (
            <Button variant="danger" icon={XCircle} onClick={() => onCancel?.(order)}>
              Cancelar pedido
            </Button>
          )}
          {canConfirm && (
            <Button variant="primary" icon={CheckCircle2} onClick={() => onConfirm?.(order)} disabled={!items?.length}>
              Confirmar pedido
            </Button>
          )}
        </div>
      )}

      {history && history.length > 0 && (
        <Card title="Línea de tiempo" icon={History}>
          <ul className="divide-y divide-neutral-800/60 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 first:pt-0 last:pb-0">
                <span className="tabular-nums text-neutral-500">{formatDateTime(h.changedAt)}</span>
                <span className="text-neutral-200">
                  {h.fromStatus ? `${orderStatusLabel(h.fromStatus)} → ` : ''}
                  {orderStatusLabel(h.toStatus)}
                </span>
                {h.note && <span className="text-neutral-500">({h.note})</span>}
                {h.changedBy && <span className="text-neutral-500">· {h.changedBy}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

    </div>
  )
}
