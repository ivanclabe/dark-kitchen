import { Tooltip } from '@/shared/ui/Tooltip'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { useDraggable } from '@dnd-kit/core'
import { ChevronRight, Flag } from 'lucide-react'
import { memo } from 'react'
import { useAdvanceTicketItems, useSetTicketPriority } from '../hooks/useKitchen'
import { timeTier, minutesAgoSince } from '../lib/ticketVisuals'
import type { KitchenTicket } from '../types'
import { KanbanCardBody } from './KanbanCardBody'
import { nextStatus } from './transitions'

const NEXT_ACTION_LABEL: Record<'EN_PREPARACION' | 'LISTO', string> = {
  EN_PREPARACION: 'Pasar a preparación',
  LISTO: 'Marcar listo',
}

/**
 * Card compacto del Kanban — deliberadamente NO reutiliza TicketCard
 * (usado por Grid/Lista): acá no hay botones por producto individual, solo
 * una acción de avance por ticket + arrastre. El control fino por plato
 * sigue disponible en Grid/Lista sin cambios. Las mutaciones son las
 * mismas (useAdvanceTicketItems/useSetTicketPriority) que usan los botones
 * de las otras vistas y el motor de voz — ninguna lógica duplicada.
 */
export const KanbanTicketCard = memo(function KanbanTicketCard({
  ticket,
  now,
  isNew,
  onAcknowledge,
}: {
  ticket: KitchenTicket
  now: number
  isNew: boolean
  onAcknowledge: () => void
}) {
  const prioritized = ticket.priority > 0
  const tier = timeTier(minutesAgoSince(ticket.createdAt, now))
  const target = nextStatus(ticket.orderStatus)

  const { advanceTicketItems, isPending: advancing } = useAdvanceTicketItems()
  const setPriority = useSetTicketPriority()
  const { show } = useToast()

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: ticket.orderId,
    data: { status: ticket.orderStatus },
  })

  async function handleAdvance() {
    if (!target) return
    onAcknowledge()
    try {
      await advanceTicketItems(ticket.items, target)
    } catch (err) {
      show(getErrorMessage(err, `No se pudo actualizar el pedido ${ticket.orderNumber}.`), 'error')
    }
  }

  async function handleTogglePriority() {
    try {
      await setPriority.mutateAsync({ orderId: ticket.orderId, priority: prioritized ? 0 : 1 })
    } catch (err) {
      show(getErrorMessage(err, 'Error al actualizar la prioridad'), 'error')
    }
  }

  const accentClass = prioritized
    ? 'border-l-violet-500'
    : tier === 'retrasado'
      ? 'border-l-red-500'
      : tier === 'atencion'
        ? 'border-l-amber-500'
        : 'border-l-neutral-700'

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`touch-none cursor-grab rounded-lg border border-neutral-800 border-l-[3px] ${accentClass} bg-neutral-900 px-3 py-2 shadow-sm select-none active:cursor-grabbing ${
        isDragging ? 'opacity-30' : ''
      } ${isNew ? 'shadow-[0_0_0_1px_var(--color-brasa-500)]' : ''}`}
    >
      <KanbanCardBody ticket={ticket} now={now} />

      <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-neutral-800 pt-1.5">
        <Tooltip label={prioritized ? 'Quitar prioridad' : 'Marcar como prioritario'} side="top">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              void handleTogglePriority()
            }}
            disabled={setPriority.isPending}
            aria-label={prioritized ? 'Quitar prioridad' : 'Marcar como prioritario'}
            className={`rounded p-1 hover:bg-neutral-800 disabled:opacity-50 ${prioritized ? 'text-violet-400' : 'text-neutral-500 hover:text-violet-400'}`}
          >
            <Flag size={13} />
          </button>
        </Tooltip>

        <div className="flex items-center gap-2">
          {isNew && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onAcknowledge()
              }}
              className="rounded px-1.5 py-0.5 text-[11px] text-brasa-400 hover:bg-neutral-800"
            >
              Visto
            </button>
          )}
          {target && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                void handleAdvance()
              }}
              disabled={advancing}
              title={NEXT_ACTION_LABEL[target]}
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-50"
            >
              {NEXT_ACTION_LABEL[target]} <ChevronRight size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
})
