import { Tooltip } from '@/shared/ui/Tooltip'
import { useDraggable } from '@dnd-kit/core'
import clsx from 'clsx'
import { memo, type KeyboardEvent } from 'react'
import { useKitchenSlaSettings } from '../hooks/useKitchenSettings'
import { ACTION_DENIED_REASON, canPerform } from '../lib/permissions'
import { alertMinutesFor, DEFAULT_SLA_THRESHOLDS, minutesAgoSince, timeTier } from '../lib/ticketVisuals'
import type { KitchenTicket } from '../types'
import { useBoardActions } from './boardActions'
import { KanbanCardBody } from './KanbanCardBody'
import { useTicketActions } from './useTicketActions'

/**
 * Tarjeta del tablero: el contenido mínimo y UNA acción — el siguiente paso
 * del pedido — como botón de ícono. Prioridad, retroceder y cancelar se
 * hacen desde el detalle (tocar la tarjeta) o arrastrando entre columnas.
 */
export const KanbanTicketCard = memo(function KanbanTicketCard({
  ticket,
  now,
  isNew,
  onAcknowledge,
  stalledNotes,
}: {
  ticket: KitchenTicket
  now: number
  isNew: boolean
  onAcknowledge: () => void
  stalledNotes?: string[]
}) {
  const board = useBoardActions()
  const actions = useTicketActions(ticket)
  const { data: thresholds = DEFAULT_SLA_THRESHOLDS } = useKitchenSlaSettings()
  const tier = timeTier(minutesAgoSince(ticket.createdAt, now), alertMinutesFor(ticket.orderStatus, thresholds), thresholds.nearThresholdPct)
  const primary = actions.primaryAction
  const allowed = primary ? canPerform(board.role, primary.action) : false

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: ticket.orderId, data: { status: ticket.orderStatus } })

  function openDetail() {
    onAcknowledge()
    board.openDetail(ticket)
  }

  function handleCardKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // El arrastre solo se activa con puntero, así que Enter/Space abren el detalle.
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openDetail()
    }
  }

  const accentClass =
    ticket.priority > 0 ? 'border-l-violet-500' : tier === 'retrasado' ? 'border-l-red-500' : tier === 'atencion' ? 'border-l-amber-500' : 'border-l-neutral-700'

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={openDetail}
      onKeyDown={handleCardKeyDown}
      className={clsx(
        'cursor-grab touch-none rounded-lg border border-l-2 border-neutral-800 bg-neutral-900 transition-colors select-none hover:border-neutral-700 active:cursor-grabbing',
        board.density === 'grande' ? 'px-4 py-3' : 'px-3 py-2',
        accentClass,
        isDragging && 'opacity-30',
        isNew && 'shadow-[0_0_0_1px_var(--color-brasa-500)]',
      )}
    >
      <KanbanCardBody
        ticket={ticket}
        now={now}
        density={board.density}
        stalledNotes={stalledNotes}
        trailing={
          primary && (
            <Tooltip label={allowed ? primary.label : ACTION_DENIED_REASON[primary.action]} side="top">
              <button
                type="button"
                aria-label={`${primary.label} pedido #${ticket.orderNumber}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onAcknowledge()
                  if (allowed) actions.primary()
                }}
                disabled={!allowed || actions.busy || actions.primaryDisabled}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-brasa-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-500"
              >
                <primary.icon size={14} aria-hidden />
              </button>
            </Tooltip>
          )
        }
      />
    </div>
  )
})
