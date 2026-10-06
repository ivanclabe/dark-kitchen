import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { Bike, CheckCircle2, ChevronRight, PackageCheck, Play, type LucideIcon } from 'lucide-react'
import { useMarkDelivered } from '../hooks/useDispatch'
import { useAdvanceOrderItems, useRevertOrderItems, useSetOrderPriority } from '../hooks/useOrders'
import type { FlowAction } from '../lib/permissions'
import { isKitchenStage, prevStatus } from '../lib/transitions'
import type { Order, OrderStatus } from '../types'
import { inScope, useBoardActions } from './boardActions'

/** La acción principal de cada columna — el siguiente paso natural del pedido. */
export const PRIMARY_ACTION: Partial<Record<OrderStatus, { action: FlowAction; label: string; icon: LucideIcon }>> = {
  NUEVO: { action: 'confirm', label: 'Confirmar', icon: CheckCircle2 },
  CONFIRMADO: { action: 'advance', label: 'Iniciar', icon: Play },
  EN_PREPARACION: { action: 'advance', label: 'Marcar listo', icon: ChevronRight },
  LISTO: { action: 'dispatch', label: 'Despachar', icon: Bike },
  DESPACHADO: { action: 'deliver', label: 'Entregar', icon: PackageCheck },
}

export const REVERT_LABEL: Partial<Record<OrderStatus, string>> = {
  EN_PREPARACION: 'Retroceder a la cola',
  LISTO: 'Retroceder a preparación',
}

/**
 * Las acciones de un pedido del tablero, compartidas por la tarjeta (solo la
 * principal) y el detalle del pedido (todas). Mismas mutaciones que la voz y
 * el drag & drop — ninguna lógica duplicada. Lo que necesita un diálogo
 * (confirmar, despachar, cancelar) se pide al tablero (boardActions).
 */
export function useOrderActions(ticket: Order) {
  const board = useBoardActions()
  const { advanceOrderItems, isPending: advancing } = useAdvanceOrderItems()
  const { revertOrderItems, isPending: reverting } = useRevertOrderItems()
  const setPriority = useSetOrderPriority()
  const markDelivered = useMarkDelivered()
  const { show } = useToast()

  const prioritized = ticket.priority > 0
  const primaryDef = PRIMARY_ACTION[ticket.status]
  const primaryInScope = primaryDef && inScope(board, primaryDef.action) ? primaryDef : undefined
  const backTarget = prevStatus(ticket.status)

  async function run(fn: () => Promise<unknown>, fallback: string) {
    try {
      await fn()
    } catch (err) {
      show(getErrorMessage(err, fallback), 'error')
    }
  }

  function primary() {
    switch (ticket.status) {
      case 'NUEVO':
        board.requestConfirm(ticket)
        return
      case 'CONFIRMADO':
        void run(() => advanceOrderItems(ticket.items, 'EN_PREPARACION'), `No se pudo iniciar el pedido ${ticket.orderNumber}.`)
        return
      case 'EN_PREPARACION':
        void run(() => advanceOrderItems(ticket.items, 'LISTO'), `No se pudo marcar listo el pedido ${ticket.orderNumber}.`)
        return
      case 'LISTO':
        board.requestDispatch(ticket)
        return
      case 'DESPACHADO':
        void run(async () => {
          await markDelivered.mutateAsync(ticket.id)
          show(`Pedido #${ticket.orderNumber} entregado.`)
        }, `No se pudo marcar como entregado el pedido ${ticket.orderNumber}.`)
        return
    }
  }

  function revert() {
    if (!backTarget) return
    void run(() => revertOrderItems(ticket.items, backTarget === 'CONFIRMADO' ? 'PENDIENTE' : 'EN_PREPARACION'), `No se pudo retroceder el pedido ${ticket.orderNumber}.`)
  }

  function togglePriority() {
    void run(() => setPriority.mutateAsync({ orderId: ticket.id, priority: prioritized ? 0 : 1 }), 'Error al actualizar la prioridad')
  }

  return {
    /** The next step, if this board offers it (Cocina does not confirm or dispatch). */
    primaryAction: primaryInScope,
    /** Confirmar un borrador sin platos lo rechaza la base: se deshabilita antes. */
    primaryDisabled: ticket.status === 'NUEVO' && ticket.items.length === 0,
    primary,
    revertLabel: backTarget ? REVERT_LABEL[ticket.status] : undefined,
    revert,
    canPrioritize: isKitchenStage(ticket.status),
    prioritized,
    togglePriority,
    priorityPending: setPriority.isPending,
    cancel: () => board.requestCancel(ticket),
    busy: advancing || reverting || markDelivered.isPending,
  }
}
