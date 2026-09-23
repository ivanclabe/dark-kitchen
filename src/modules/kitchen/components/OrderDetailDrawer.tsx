import { OrderBuilder } from '@/modules/orders/components/OrderBuilder'
import { useOrder } from '@/modules/orders/hooks/useOrders'
import { orderStatusLabel } from '@/modules/orders/lib/orderStatus'
import { Card } from '@/shared/ui/Card'
import { Drawer } from '@/shared/ui/Drawer'
import { Tooltip } from '@/shared/ui/Tooltip'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import clsx from 'clsx'
import { AlertTriangle, ChefHat, ChevronLeft, ChevronRight, Play } from 'lucide-react'
import { useAdvanceKitchenItem, useRevertKitchenItem } from '../hooks/useKitchen'
import { ACTION_DENIED_REASON, canPerform } from '../lib/permissions'
import { ITEM_STATUS_BADGE, ITEM_STATUS_LABEL, ORDER_STATUS_CONFIG } from '../lib/ticketVisuals'
import type { KitchenTicket, KitchenTicketItem } from '../types'
import type { Role } from '@/shared/rbac/roles'

const KITCHEN_STAGES = new Set(['CONFIRMADO', 'EN_PREPARACION', 'LISTO'])

function ItemRow({ item, orderNumber, role }: { item: KitchenTicketItem; orderNumber: number; role: Role | null }) {
  const advance = useAdvanceKitchenItem()
  const revert = useRevertKitchenItem()
  const { show } = useToast()
  const canAdvance = canPerform(role, 'advance')
  const canRevert = canPerform(role, 'revert')
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
          <span className="tabular-nums text-neutral-400">{item.quantity}×</span> {item.productName}
        </p>
        {item.observation && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-300">
            <AlertTriangle size={11} className="shrink-0" aria-hidden /> {item.observation}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-medium', ITEM_STATUS_BADGE[item.kitchenStatus])}>{ITEM_STATUS_LABEL[item.kitchenStatus]}</span>
        {item.kitchenStatus !== 'PENDIENTE' && (
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
        {forward && (
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

/**
 * Detalle del pedido. Arriba, cuando el pedido está en cocina, el control
 * plato por plato (lo único que antes solo existía en la vista Grid: permite
 * pedidos parcialmente listos, y cada plato consume su inventario en su
 * propio momento). Debajo, el mismo OrderBuilder de siempre: platos con
 * precio, totales, historial, confirmar y cancelar.
 *
 * `ticket` es el ticket vivo del tablero cuando el pedido está en él (así el
 * control por plato se refresca con el tablero); para pedidos que ya no
 * están (entregados, abiertos desde Historial o desde un enlace viejo
 * /orders/:id) basta el `orderId`.
 */
export function OrderDetailDrawer({
  orderId,
  ticket,
  role,
  onClose,
}: {
  orderId: string | null
  ticket?: KitchenTicket
  role: Role | null
  onClose: () => void
}) {
  const { data: order } = useOrder(ticket ? '' : (orderId ?? ''))
  if (!orderId) return null

  const inKitchen = ticket ? KITCHEN_STAGES.has(ticket.orderStatus) : false
  const title = `Pedido #${ticket?.orderNumber ?? order?.orderNumber ?? '…'}`
  const subtitle = ticket ? `${ticket.customerName} · ${ORDER_STATUS_CONFIG[ticket.orderStatus].label}` : order ? `${order.customerName} · ${orderStatusLabel(order.status)}` : undefined

  return (
    <Drawer open onClose={onClose} title={title} subtitle={subtitle}>
      <div className="space-y-5">
        {ticket && inKitchen && ticket.items.length > 0 && (
          <Card title="Cocina" description="Avanza o corrige plato por plato" icon={ChefHat}>
            <ul className="divide-y divide-neutral-800/60">
              {ticket.items.map((item) => (
                <ItemRow key={item.id} item={item} orderNumber={ticket.orderNumber} role={role} />
              ))}
            </ul>
          </Card>
        )}
        <OrderBuilder orderId={orderId} />
      </div>
    </Drawer>
  )
}
