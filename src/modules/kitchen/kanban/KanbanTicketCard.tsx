import { ConfirmDialog } from '@/shared/ui/Modal'
import { Tooltip } from '@/shared/ui/Tooltip'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { useDraggable } from '@dnd-kit/core'
import { ChevronLeft, ChevronRight, Flag, XCircle } from 'lucide-react'
import { memo, useState } from 'react'
import { useAdvanceTicketItems, useCancelKitchenOrder, useRevertTicketItems, useSetTicketPriority } from '../hooks/useKitchen'
import { timeTier, minutesAgoSince, alertMinutesFor, DEFAULT_SLA_THRESHOLDS } from '../lib/ticketVisuals'
import { useKitchenSlaSettings } from '../hooks/useKitchenSettings'
import type { KitchenTicket } from '../types'
import { KanbanCardBody } from './KanbanCardBody'
import { nextStatus, prevStatus } from './transitions'

const NEXT_ACTION_LABEL: Record<'EN_PREPARACION' | 'LISTO', string> = {
  EN_PREPARACION: 'Pasar a preparación',
  LISTO: 'Marcar listo',
}

const PREV_ITEM_TARGET: Record<'CONFIRMADO' | 'EN_PREPARACION', 'PENDIENTE' | 'EN_PREPARACION'> = {
  CONFIRMADO: 'PENDIENTE',
  EN_PREPARACION: 'EN_PREPARACION',
}

const PREV_ACTION_LABEL: Record<'CONFIRMADO' | 'EN_PREPARACION', string> = {
  CONFIRMADO: 'Retroceder a confirmado',
  EN_PREPARACION: 'Retroceder a preparación',
}

/**
 * Card compacto del Kanban — deliberadamente NO reutiliza TicketCard
 * (usado por Grid/Lista): acá no hay botones por producto individual, solo
 * acciones de estado por ticket + arrastre. El control fino por plato
 * sigue disponible en Grid/Lista sin cambios. Las mutaciones son las
 * mismas (useAdvanceTicketItems/useRevertTicketItems/useCancelKitchenOrder/
 * useSetTicketPriority) que usan los botones de las otras vistas y el
 * motor de voz — ninguna lógica duplicada.
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
  const isCancelled = ticket.orderStatus === 'CANCELADO'
  const prioritized = ticket.priority > 0
  const { data: thresholds = DEFAULT_SLA_THRESHOLDS } = useKitchenSlaSettings()
  const tier = isCancelled ? 'normal' : timeTier(minutesAgoSince(ticket.createdAt, now), alertMinutesFor(ticket.orderStatus, thresholds), thresholds.nearThresholdPct)
  const target = isCancelled ? null : nextStatus(ticket.orderStatus)
  const backTarget = isCancelled ? null : prevStatus(ticket.orderStatus)

  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false)

  const { advanceTicketItems, isPending: advancing } = useAdvanceTicketItems()
  const { revertTicketItems, isPending: reverting } = useRevertTicketItems()
  const cancelOrder = useCancelKitchenOrder()
  const setPriority = useSetTicketPriority()
  const { show } = useToast()

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: ticket.orderId,
    data: { status: ticket.orderStatus },
    disabled: isCancelled,
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

  async function handleRevert() {
    if (!backTarget) return
    try {
      await revertTicketItems(ticket.items, PREV_ITEM_TARGET[backTarget])
    } catch (err) {
      show(getErrorMessage(err, `No se pudo retroceder el pedido ${ticket.orderNumber}.`), 'error')
    }
  }

  async function handleConfirmCancel() {
    try {
      await cancelOrder.mutateAsync({ orderId: ticket.orderId })
      setConfirmCancelOpen(false)
    } catch (err) {
      show(getErrorMessage(err, `No se pudo cancelar el pedido ${ticket.orderNumber}.`), 'error')
    }
  }

  async function handleTogglePriority() {
    try {
      await setPriority.mutateAsync({ orderId: ticket.orderId, priority: prioritized ? 0 : 1 })
    } catch (err) {
      show(getErrorMessage(err, 'Error al actualizar la prioridad'), 'error')
    }
  }

  const accentClass = isCancelled
    ? 'border-l-red-500/60'
    : prioritized
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
      className={`rounded-lg border border-neutral-800 border-l-[3px] ${accentClass} bg-neutral-900 px-3 py-2 shadow-sm select-none ${
        isCancelled ? 'opacity-70' : 'touch-none cursor-grab active:cursor-grabbing'
      } ${isDragging ? 'opacity-30' : ''} ${isNew ? 'shadow-[0_0_0_1px_var(--color-brasa-500)]' : ''}`}
    >
      <KanbanCardBody ticket={ticket} now={now} />

      {!isCancelled && (
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

          <div className="flex items-center gap-1">
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

            <Tooltip label="Cancelar pedido" side="top">
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirmCancelOpen(true)
                }}
                aria-label="Cancelar pedido"
                className="rounded p-1 text-neutral-600 hover:bg-red-500/10 hover:text-red-400"
              >
                <XCircle size={13} />
              </button>
            </Tooltip>

            {backTarget && (
              <Tooltip label={PREV_ACTION_LABEL[backTarget]} side="top">
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleRevert()
                  }}
                  disabled={reverting}
                  aria-label={PREV_ACTION_LABEL[backTarget]}
                  className="rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-50"
                >
                  <ChevronLeft size={13} />
                </button>
              </Tooltip>
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
      )}

      {/* onPointerDownCapture: el Modal se renderiza en un portal a document.body,
          pero React sigue burbujeando sus eventos por el árbol de componentes — sin
          esto, un click dentro del diálogo llegaría al onPointerDown de arrastre del card. */}
      <div onPointerDownCapture={(e) => e.stopPropagation()}>
        <ConfirmDialog
          open={confirmCancelOpen}
          onClose={() => setConfirmCancelOpen(false)}
          onConfirm={() => void handleConfirmCancel()}
          title="Cancelar pedido"
          description={`¿Cancelar el pedido #${ticket.orderNumber} de ${ticket.customerName}? Esta acción no se puede deshacer.`}
          confirmLabel="Sí, cancelar"
          danger
          pending={cancelOrder.isPending}
        />
      </div>
    </div>
  )
})
