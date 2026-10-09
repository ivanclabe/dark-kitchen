import { CustomerMarks } from '@/modules/customers/components/CustomerIdentity'
import { useHere } from '@/shared/hooks/useBackTarget'
import { formatPhone } from '@/shared/utils/phone'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { KitchenLink } from '@/shared/kitchen/KitchenLink'
import { Button, type ButtonProps } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { Drawer } from '@/shared/ui/Drawer'
import { LoadingState } from '@/shared/ui/LoadingState'
import { Tooltip } from '@/shared/ui/Tooltip'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDateTime, formatMoney } from '@/shared/utils/format'
import { Badge } from '@/shared/ui/Badge'
import clsx from 'clsx'
import { AlertTriangle, Bike, Boxes, ChefHat, ChevronLeft, ChevronRight, ExternalLink, Flag, MapPin, Phone, Play, UserRound, XCircle } from 'lucide-react'
import { allows, inScope, useBoardActions } from '../board/boardActions'
import { useOrderActions } from '../board/useOrderActions'
import { useAdvanceKitchenItem, useOrder, useOrderReservations, useRevertKitchenItem } from '../hooks/useOrders'
import { ACTION_DENIED_REASON, type FlowAction } from '../lib/permissions'
import { OrderStatusBadge } from '../lib/orderStatus'
import { ITEM_STATUS_BADGE, ITEM_STATUS_LABEL } from '../lib/orderVisuals'
import type { Order, OrderItem } from '../types'
import { isKitchenStage } from '../lib/transitions'
import { OrderBuilder } from './OrderBuilder'
import { PaymentBadge, PaymentCard } from './PaymentCard'

const OPEN = new Set(['NUEVO', 'CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'DESPACHADO'])

/** A button gated by the board's scope and the role: hidden if this board does not offer it, disabled (with the reason) if the role cannot. */
function GatedButton({ action, label, ...props }: { action: FlowAction; label: string } & Omit<ButtonProps, 'children' | 'role'>) {
  const board = useBoardActions()
  if (!inScope(board, action)) return null
  const allowed = allows(board, action)
  return (
    <Tooltip label={allowed ? label : ACTION_DENIED_REASON[action]} side="top">
      <Button {...props} disabled={props.disabled || !allowed}>
        {label}
      </Button>
    </Tooltip>
  )
}

/** Every action of an open order: the next step, back, priority and cancel. */
function ActionBar({ order }: { order: Order }) {
  const actions = useOrderActions(order)
  const primary = actions.primaryAction
  return (
    <div className="flex flex-wrap items-center gap-2">
      {primary && (
        <GatedButton action={primary.action} label={primary.label} variant="primary" icon={primary.icon} onClick={actions.primary} loading={actions.busy} disabled={actions.primaryDisabled} />
      )}
      {actions.revertLabel && <GatedButton action="revert" label={actions.revertLabel} variant="secondary" icon={ChevronLeft} onClick={actions.revert} disabled={actions.busy} />}
      {actions.canPrioritize && (
        <GatedButton
          action="priority"
          label={actions.prioritized ? 'Quitar prioridad' : 'Prioritario'}
          variant="secondary"
          icon={Flag}
          onClick={actions.togglePriority}
          loading={actions.priorityPending}
        />
      )}
      <div className="ml-auto">
        <GatedButton action="cancel" label="Cancelar pedido" variant="danger" icon={XCircle} onClick={actions.cancel} />
      </div>
    </div>
  )
}

function ItemRow({ item, orderNumber }: { item: OrderItem; orderNumber: number }) {
  const here = useHere()
  const board = useBoardActions()
  const { can } = useActiveKitchen()
  const advance = useAdvanceKitchenItem()
  const revert = useRevertKitchenItem()
  const { show } = useToast()
  const canAdvance = allows(board, 'advance')
  const canRevert = allows(board, 'revert')
  const pending = advance.isPending || revert.isPending

  async function run(fn: () => Promise<unknown>, label: string) {
    try {
      await fn()
    } catch (err) {
      show(getErrorMessage(err, `No se pudo ${label} "${item.productName}" del pedido ${orderNumber}.`), 'error')
    }
  }

  const forward = item.kitchenStatus === 'PENDIENTE' ? { label: 'Iniciar', icon: Play } : item.kitchenStatus === 'EN_PREPARACION' ? { label: 'Listo', icon: ChevronRight } : null

  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-100">
          <span className="tabular-nums text-neutral-400">{item.quantity}×</span>{' '}
          {can('recipes.view') ? (
            <KitchenLink to={`/recipes/${item.productId}`} state={{ from: here }} className="hover:text-brasa-300 hover:underline" title="Ver la receta">
              {item.productName}
            </KitchenLink>
          ) : (
            item.productName
          )}
        </p>
        {item.observation && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-300">
            <AlertTriangle size={11} className="shrink-0" aria-hidden /> {item.observation}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-medium', ITEM_STATUS_BADGE[item.kitchenStatus])}>{ITEM_STATUS_LABEL[item.kitchenStatus]}</span>
        {item.kitchenStatus !== 'PENDIENTE' && inScope(board, 'revert') && (
          <Tooltip label={canRevert ? 'Retroceder este plato un paso' : ACTION_DENIED_REASON.revert} side="top">
            <button
              type="button"
              onClick={() => void run(() => revert.mutateAsync(item.id), 'retroceder')}
              disabled={pending || !canRevert}
              aria-label={`Retroceder ${item.productName}`}
              className="rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={14} />
            </button>
          </Tooltip>
        )}
        {forward && inScope(board, 'advance') && (
          <Tooltip label={canAdvance ? `${forward.label} este plato` : ACTION_DENIED_REASON.advance} side="top">
            <button
              type="button"
              onClick={() => void run(() => advance.mutateAsync(item.id), 'avanzar')}
              disabled={pending || !canAdvance}
              className="inline-flex items-center gap-1 rounded-lg bg-neutral-800 px-2 py-1 text-xs font-medium text-neutral-100 hover:bg-brasa-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <forward.icon size={12} aria-hidden /> {forward.label}
            </button>
          </Tooltip>
        )}
      </div>
    </li>
  )
}

function CustomerCard({ order }: { order: Order }) {
  const here = useHere()
  const { can } = useActiveKitchen()
  return (
    <Card title="Cliente" icon={UserRound}>
      <div className="space-y-1.5 text-sm">
        <p className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium text-neutral-100">{order.customerName}</span>
            <CustomerMarks customer={{ type: order.customerType, preferred: order.customerPreferred, preferredNote: order.customerPreferredNote }} />
          </span>
          {can('customers.view') && (
            <KitchenLink to={`/customers/${order.customerId}`} state={{ from: here }} className="inline-flex items-center gap-1 text-xs text-brasa-400 hover:underline">
              Saldo e historial <ExternalLink size={11} aria-hidden />
            </KitchenLink>
          )}
        </p>
        {order.customerPhone && (
          <p className="flex items-center gap-1.5 text-neutral-400">
            <Phone size={13} aria-hidden /> {formatPhone(order.customerPhone)}
          </p>
        )}
        {order.customerAddress && (
          <p className="flex items-center gap-1.5 text-neutral-400">
            <MapPin size={13} aria-hidden /> {order.customerAddress}
          </p>
        )}
      </div>
    </Card>
  )
}

function DeliveryCard({ order }: { order: Order }) {
  const d = order.delivery
  if (!d) return null
  return (
    <Card title="Entrega" icon={Bike}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-neutral-500">Domiciliario</dt>
        <dd className="text-right text-neutral-200">{d.riderName ?? '—'}</dd>
        <dt className="text-neutral-500">Salió</dt>
        <dd className="text-right text-neutral-200">{d.dispatchedAt ? formatDateTime(d.dispatchedAt) : '—'}</dd>
        <dt className="text-neutral-500">Entregado</dt>
        <dd className="text-right text-neutral-200">{d.deliveredAt ? formatDateTime(d.deliveredAt) : d.status === 'FALLIDO' ? 'Fallido' : '—'}</dd>
      </dl>
    </Card>
  )
}

const RESERVATION_LABEL = { ACTIVE: 'Reservado', CONSUMED: 'Consumido', RELEASED: 'Liberado' } as const

/** Plato → receta → insumos: what the order took from the stock (read-only; Abastecimiento owns it). */
function StockCard({ order }: { order: Order }) {
  const { can } = useActiveKitchen()
  const visible = order.status !== 'NUEVO' && (can('inventory.view') || can('orders.view'))
  const { data: reservations, isLoading } = useOrderReservations(order.id, visible)
  if (!visible || (!isLoading && !reservations?.length)) return null
  return (
    <Card title="Insumos" description="Lo que este pedido reservó o consumió del stock" icon={Boxes}>
      {isLoading ? (
        <LoadingState variant="inline" />
      ) : (
        <ul className="divide-y divide-neutral-800/60 text-sm">
          {reservations!.map((r, i) => (
            <li key={`${r.ingredientId}-${i}`} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate">
                {can('inventory.view') ? (
                  <KitchenLink to={`/supply/stock/${r.ingredientId}`} className="text-neutral-200 hover:text-brasa-300 hover:underline">
                    {r.ingredientName}
                  </KitchenLink>
                ) : (
                  <span className="text-neutral-200">{r.ingredientName}</span>
                )}
                <span className="ml-1.5 text-[11px] text-neutral-500">· {r.productName}</span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                {r.quantity.toLocaleString('es-CO', { maximumFractionDigits: 2 })} {r.unit} · {RESERVATION_LABEL[r.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/**
 * The order detail (ADR 0020): the point that ties everything together —
 * customer, dishes (→ recipe), stock taken, kitchen item by item, delivery,
 * totals and the status timeline. Opened from Pedidos, Cocina, Despacho,
 * Clientes or Copilot; actions follow the board's scope and the role.
 * It must live inside an order board (BoardActionsContext).
 */
export function OrderDetailDrawer({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const { can } = useActiveKitchen()
  const { data: order, isLoading } = useOrder(orderId)
  if (!orderId) return null

  const isOpen = order ? OPEN.has(order.status) : false
  const inKitchen = order ? isKitchenStage(order.status) : false
  const title = `Pedido #${order?.orderNumber ?? '…'}`
  const subtitle = order?.customerName

  return (
    <Drawer open onClose={onClose} title={title} subtitle={subtitle}>
      {isLoading || !order ? (
        <LoadingState variant="block" />
      ) : (
        <div className="space-y-5">
          {/* ADR 0031: two dimensions, never mixed — where the order is, and whether it is paid. */}
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            {can('receivables.view') && <PaymentBadge order={order} />}
            {order.requiresReview && (
              <Badge tone="warning" icon={AlertTriangle}>
                revisar devolución
              </Badge>
            )}
            <span className="ml-auto text-lg font-semibold tabular-nums text-neutral-50">{formatMoney(order.total)}</span>
          </div>
          {isOpen && <ActionBar order={order} />}
          <PaymentCard order={order} />
          {inKitchen && order.items.length > 0 && (
            <Card title="Cocina" description="Avanza o corrige plato por plato" icon={ChefHat}>
              <ul className="divide-y divide-neutral-800/60">
                {order.items.map((item) => (
                  <ItemRow key={item.id} item={item} orderNumber={order.orderNumber} />
                ))}
              </ul>
            </Card>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <CustomerCard order={order} />
            <DeliveryCard order={order} />
          </div>
          {/* A draft is edited here; confirming and cancelling it are the action bar's (ADR 0031: one place for each). */}
          <OrderBuilder orderId={order.id} />
          <StockCard order={order} />
        </div>
      )}
    </Drawer>
  )
}
