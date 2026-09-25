import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { useState } from 'react'
import { useAdvanceTicketItems, useRevertTicketItems } from '../hooks/useKitchen'
import { ACTION_DENIED_REASON, canPerform } from '../lib/permissions'
import type { KitchenOrderStatus, KitchenTicket } from '../types'
import type { BoardActions } from './boardActions'
import { transitionAction } from './transitions'

// Retroceder un pedido a estado X significa llevar sus platos al kitchen_status
// correspondiente: "CONFIRMADO" = todos PENDIENTE, "EN_PREPARACION" = ya no LISTO.
const REVERT_ITEM_TARGET: Partial<Record<KitchenOrderStatus, 'PENDIENTE' | 'EN_PREPARACION'>> = {
  CONFIRMADO: 'PENDIENTE',
  EN_PREPARACION: 'EN_PREPARACION',
}

/**
 * Drag & drop del tablero. Al soltar, transitionAction dice qué RPC implica
 * el movimiento y canPerform si tu rol puede ejecutarlo. Avanzar y
 * retroceder en cocina se ejecutan directo (mismas funciones que los botones
 * y la voz); confirmar, despachar y cancelar abren el diálogo correspondiente
 * del tablero, porque piden un dato (domiciliario, motivo) o son
 * irreversibles. Sin estado optimista propio: si algo falla, la tarjeta
 * vuelve a su columna real en el próximo refetch.
 */
export function useKanbanDragDrop(tickets: KitchenTicket[] | undefined, board: Pick<BoardActions, 'can' | 'requestConfirm' | 'requestDispatch' | 'requestCancel'>) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const { advanceTicketItems } = useAdvanceTicketItems()
  const { revertTicketItems } = useRevertTicketItems()
  const { show } = useToast()

  // distance:6 evita que un click/tap sobre el card (o sus botones) se tome como arrastre.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const activeTicket = activeId ? tickets?.find((t) => t.orderId === activeId) : undefined

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const fromStatus = active.data.current?.status as KitchenOrderStatus | undefined
    const toStatus = over.id as KitchenOrderStatus
    if (!fromStatus) return

    const action = transitionAction(fromStatus, toStatus)
    if (!action) return

    const ticket = tickets?.find((t) => t.orderId === active.id)
    if (!ticket) return

    if (!canPerform(board.can, action)) {
      show(ACTION_DENIED_REASON[action], 'error')
      return
    }

    switch (action) {
      case 'confirm':
        board.requestConfirm(ticket)
        return
      case 'dispatch':
        board.requestDispatch(ticket)
        return
      case 'cancel':
        board.requestCancel(ticket)
        return
    }

    try {
      if (action === 'advance') {
        await advanceTicketItems(ticket.items, toStatus as Extract<KitchenOrderStatus, 'EN_PREPARACION' | 'LISTO'>)
      } else {
        const target = REVERT_ITEM_TARGET[toStatus]
        if (target) await revertTicketItems(ticket.items, target)
      }
    } catch (err) {
      show(getErrorMessage(err, `No se pudo mover el pedido ${ticket.orderNumber}.`), 'error')
    }
  }

  return { sensors, activeTicket, handleDragStart, handleDragEnd }
}
