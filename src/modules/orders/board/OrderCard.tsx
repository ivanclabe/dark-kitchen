import { Tooltip } from '@/shared/ui/Tooltip'
import { useDraggable } from '@dnd-kit/core'
import clsx from 'clsx'
import { memo, type KeyboardEvent } from 'react'
import { useSlaSettings } from '../hooks/useSlaSettings'
import { ACTION_DENIED_REASON } from '../lib/permissions'
import { alertMinutesFor, DEFAULT_SLA_THRESHOLDS, minutesAgoSince, timeTier } from '../lib/orderVisuals'
import type { Order } from '../types'
import { allows, useBoardActions } from './boardActions'
import { OrderCardBody } from './OrderCardBody'
import { useOrderActions } from './useOrderActions'

/**
 * Tarjeta del tablero: el contenido mínimo y UNA acción — el siguiente paso
 * del pedido — como botón de ícono. Prioridad, retroceder y cancelar se
 * hacen desde el detalle (tocar la tarjeta) o arrastrando entre columnas.
 */
export const OrderCard = memo(function OrderCard({
  ticket,
  now,
  isNew,
  onAcknowledge,
  stalledNotes,
}: {
  ticket: Order
  now: number
  isNew: boolean
  onAcknowledge: () => void
  stalledNotes?: string[]
}) {
  const board = useBoardActions()
  const actions = useOrderActions(ticket)
  const { data: thresholds = DEFAULT_SLA_THRESHOLDS } = useSlaSettings()
  const tier = timeTier(minutesAgoSince(ticket.createdAt, now), alertMinutesFor(ticket.status, thresholds), thresholds.nearThresholdPct)
  const primary = actions.primaryAction
  const allowed = primary ? allows(board, primary.action) : false

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: ticket.id, data: { status: ticket.status } })

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

  const actionButton = primary && (
    <button
      type="button"
      aria-label={`${primary.label} pedido #${ticket.orderNumber}`}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onAcknowledge()
        if (allowed) actions.primary()
      }}
      disabled={!allowed || actions.busy || actions.primaryDisabled}
      // ADR 0065: the next step with its word, not a 24 px grey icon whose meaning changed per column.
      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-neutral-700 px-2.5 text-xs font-medium whitespace-nowrap text-neutral-200 transition-colors hover:border-transparent hover:bg-primary hover:text-on-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-700 disabled:hover:bg-transparent disabled:hover:text-neutral-200 pointer-coarse:h-9 pointer-coarse:px-3"
    >
      <primary.icon size={13} aria-hidden />
      {primary.label}
    </button>
  )

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={openDetail}
      onKeyDown={handleCardKeyDown}
      className={clsx(
        // Hover lightens the other three sides only: the left one is the time/priority stripe (it used to vanish).
        'cursor-grab touch-manipulation rounded-lg border border-l-2 border-neutral-800 bg-neutral-900 transition-colors select-none [-webkit-touch-callout:none] hover:border-y-neutral-700 hover:border-r-neutral-700 active:cursor-grabbing',
        board.density === 'grande' ? 'px-4 py-3' : 'px-3 py-2',
        accentClass,
        isDragging && 'opacity-30',
        isNew && 'shadow-[0_0_0_1px_var(--color-brasa-500)]',
      )}
    >
      <OrderCardBody
        ticket={ticket}
        now={now}
        density={board.density}
        kitchen={board.kitchen}
        stalledNotes={stalledNotes}
        trailing={
          primary &&
          // The word is on the button; the tooltip only explains why it is grey.
          (allowed ? (
            actionButton
          ) : (
            <Tooltip label={ACTION_DENIED_REASON[primary.action]} side="top-end">
              {actionButton}
            </Tooltip>
          ))
        }
      />
    </div>
  )
})
