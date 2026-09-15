import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { useState } from 'react'
import { useAdvanceTicketItems } from '../hooks/useKitchen'
import type { KitchenOrderStatus, KitchenTicket } from '../types'
import { isForwardTransition } from './transitions'

/**
 * Encapsula drag & drop del Kanban. Al soltar, valida la transición
 * (transitions.ts) y — si es válida — llama exactamente a
 * advanceTicketItems, la MISMA función que usan los botones manuales y el
 * motor de voz. No hay estado optimista propio que revertir a mano: si la
 * mutación falla se muestra el error y el ticket vuelve a su columna real
 * en el próximo refetch (useAdvanceKitchenItem ya invalida 'kitchen-queue').
 */
export function useKanbanDragDrop(tickets: KitchenTicket[] | undefined) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const { advanceTicketItems } = useAdvanceTicketItems()
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
    if (!fromStatus || !isForwardTransition(fromStatus, toStatus)) return

    const ticket = tickets?.find((t) => t.orderId === active.id)
    if (!ticket) return

    try {
      await advanceTicketItems(ticket.items, toStatus as Extract<KitchenOrderStatus, 'EN_PREPARACION' | 'LISTO'>)
    } catch (err) {
      show(getErrorMessage(err, `No se pudo mover el pedido ${ticket.orderNumber}.`), 'error')
    }
  }

  return { sensors, activeTicket, handleDragStart, handleDragEnd }
}
