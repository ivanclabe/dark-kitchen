import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { useState } from 'react'
import { useAdvanceTicketItems, useCancelKitchenOrder, useRevertTicketItems } from '../hooks/useKitchen'
import type { KitchenOrderStatus, KitchenTicket } from '../types'
import { canTransition, isForward } from './transitions'

// Retroceder un pedido a estado X significa llevar sus items al kitchen_status
// correspondiente: "CONFIRMADO" = todos PENDIENTE, "EN_PREPARACION" = ya no LISTO.
const REVERT_ITEM_TARGET: Record<'CONFIRMADO' | 'EN_PREPARACION', 'PENDIENTE' | 'EN_PREPARACION'> = {
  CONFIRMADO: 'PENDIENTE',
  EN_PREPARACION: 'EN_PREPARACION',
}

/**
 * Encapsula drag & drop del Kanban. Al soltar, valida la transición
 * (transitions.ts) y — si es válida — llama exactamente a la misma función
 * que usan los botones manuales y el motor de voz: advanceTicketItems para
 * avanzar, revertTicketItems para retroceder, cancelKitchenOrder para
 * mover a CANCELADO. No hay estado optimista propio que revertir a mano:
 * si la mutación falla se muestra el error y el ticket vuelve a su columna
 * real en el próximo refetch.
 */
export function useKanbanDragDrop(tickets: KitchenTicket[] | undefined) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const { advanceTicketItems } = useAdvanceTicketItems()
  const { revertTicketItems } = useRevertTicketItems()
  const cancelOrder = useCancelKitchenOrder()
  const { show } = useToast()

  // distance:6 evita que un simple click/tap sobre el card (o sus botones)
  // se interprete como el inicio de un arrastre.
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
    if (!fromStatus || !canTransition(fromStatus, toStatus)) return

    const ticket = tickets?.find((t) => t.orderId === active.id)
    if (!ticket) return

    try {
      if (toStatus === 'CANCELADO') {
        await cancelOrder.mutateAsync({ orderId: ticket.orderId })
      } else if (isForward(fromStatus, toStatus)) {
        await advanceTicketItems(ticket.items, toStatus as Extract<KitchenOrderStatus, 'EN_PREPARACION' | 'LISTO'>)
      } else {
        await revertTicketItems(ticket.items, REVERT_ITEM_TARGET[toStatus as 'CONFIRMADO' | 'EN_PREPARACION'])
      }
    } catch (err) {
      show(getErrorMessage(err, `No se pudo mover el pedido ${ticket.orderNumber}.`), 'error')
    }
  }

  return { sensors, activeTicket, handleDragStart, handleDragEnd }
}
