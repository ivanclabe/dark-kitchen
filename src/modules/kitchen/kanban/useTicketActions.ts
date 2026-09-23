import { useMarkDelivered } from '@/modules/delivery/hooks/useDelivery'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { Bike, CheckCircle2, ChevronRight, PackageCheck, Play, type LucideIcon } from 'lucide-react'
import { useAdvanceTicketItems, useRevertTicketItems, useSetTicketPriority } from '../hooks/useKitchen'
import type { FlowAction } from '../lib/permissions'
import type { KitchenOrderStatus, KitchenTicket } from '../types'
import { useBoardActions } from './boardActions'
import { prevStatus } from './transitions'

/** La acción principal de cada columna — el siguiente paso natural del pedido. */
export const PRIMARY_ACTION: Partial<Record<KitchenOrderStatus, { action: FlowAction; label: string; icon: LucideIcon }>> = {
  NUEVO: { action: 'confirm', label: 'Confirmar', icon: CheckCircle2 },
  CONFIRMADO: { action: 'advance', label: 'Iniciar', icon: Play },
  EN_PREPARACION: { action: 'advance', label: 'Marcar listo', icon: ChevronRight },
  LISTO: { action: 'dispatch', label: 'Despachar', icon: Bike },
  DESPACHADO: { action: 'deliver', label: 'Entregar', icon: PackageCheck },
}

export const REVERT_LABEL: Partial<Record<KitchenOrderStatus, string>> = {
  EN_PREPARACION: 'Retroceder a la cola',
  LISTO: 'Retroceder a preparación',
}

export const KITCHEN_STAGES = new Set<KitchenOrderStatus>(['CONFIRMADO', 'EN_PREPARACION', 'LISTO'])

/**
 * Las acciones de un pedido del tablero, compartidas por la tarjeta (solo la
 * principal) y el detalle del pedido (todas). Mismas mutaciones que la voz y
 * el drag & drop — ninguna lógica duplicada. Lo que necesita un diálogo
 * (confirmar, despachar, cancelar) se pide al tablero (boardActions).
 */
export function useTicketActions(ticket: KitchenTicket) {
  const board = useBoardActions()
  const { advanceTicketItems, isPending: advancing } = useAdvanceTicketItems()
  const { revertTicketItems, isPending: reverting } = useRevertTicketItems()
  const setPriority = useSetTicketPriority()
  const markDelivered = useMarkDelivered()
  const { show } = useToast()

  const prioritized = ticket.priority > 0
  const backTarget = prevStatus(ticket.orderStatus)

  async function run(fn: () => Promise<unknown>, fallback: string) {
    try {
      await fn()
    } catch (err) {
      show(getErrorMessage(err, fallback), 'error')
    }
  }

  function primary() {
    switch (ticket.orderStatus) {
      case 'NUEVO':
        board.requestConfirm(ticket)
        return
      case 'CONFIRMADO':
        void run(() => advanceTicketItems(ticket.items, 'EN_PREPARACION'), `No se pudo iniciar el pedido ${ticket.orderNumber}.`)
        return
      case 'EN_PREPARACION':
        void run(() => advanceTicketItems(ticket.items, 'LISTO'), `No se pudo marcar listo el pedido ${ticket.orderNumber}.`)
        return
      case 'LISTO':
        board.requestDispatch(ticket)
        return
      case 'DESPACHADO':
        void run(async () => {
          await markDelivered.mutateAsync(ticket.orderId)
          show(`Pedido #${ticket.orderNumber} entregado.`)
        }, `No se pudo marcar como entregado el pedido ${ticket.orderNumber}.`)
        return
    }
  }

  function revert() {
    if (!backTarget) return
    void run(() => revertTicketItems(ticket.items, backTarget === 'CONFIRMADO' ? 'PENDIENTE' : 'EN_PREPARACION'), `No se pudo retroceder el pedido ${ticket.orderNumber}.`)
  }

  function togglePriority() {
    void run(() => setPriority.mutateAsync({ orderId: ticket.orderId, priority: prioritized ? 0 : 1 }), 'Error al actualizar la prioridad')
  }

  return {
    primaryAction: PRIMARY_ACTION[ticket.orderStatus],
    /** Confirmar un borrador sin platos lo rechaza la base: se deshabilita antes. */
    primaryDisabled: ticket.orderStatus === 'NUEVO' && ticket.items.length === 0,
    primary,
    revertLabel: backTarget ? REVERT_LABEL[ticket.orderStatus] : undefined,
    revert,
    canPrioritize: KITCHEN_STAGES.has(ticket.orderStatus),
    prioritized,
    togglePriority,
    priorityPending: setPriority.isPending,
    cancel: () => board.requestCancel(ticket),
    busy: advancing || reverting || markDelivered.isPending,
  }
}
