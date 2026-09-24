import { EmptyState } from '@/shared/ui/EmptyState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core'
import clsx from 'clsx'
import { ChefHat } from 'lucide-react'
import { useMemo } from 'react'
import { useBoardActions } from '../kanban/boardActions'
import { KanbanCardBody } from '../kanban/KanbanCardBody'
import { KanbanTicketCard } from '../kanban/KanbanTicketCard'
import { canTransition, KANBAN_COLUMNS } from '../kanban/transitions'
import { useKanbanDragDrop } from '../kanban/useKanbanDragDrop'
import { ORDER_STATUS_CONFIG } from '../lib/ticketVisuals'
import type { KitchenOrderStatus, KitchenTicket } from '../types'

/** Etiqueta de columna — "Listo" en singular como en el resto del flujo. */
const COLUMN_TONE: Partial<Record<KitchenOrderStatus, string>> = {
  NUEVO: 'text-neutral-400',
  CONFIRMADO: 'text-blue-400',
  EN_PREPARACION: 'text-amber-400',
  LISTO: 'text-emerald-400',
  DESPACHADO: 'text-violet-400',
}

function KanbanColumn({
  status,
  tickets,
  now,
  newIds,
  onAcknowledge,
  dropState,
  stalledByOrder,
}: {
  status: KitchenOrderStatus
  tickets: KitchenTicket[]
  now: number
  newIds: Set<string>
  onAcknowledge: (orderId: string) => void
  stalledByOrder?: Map<string, string[]>
  /** Durante un arrastre: si esta columna acepta la tarjeta (flujo + rol). null = no hay arrastre. */
  dropState: 'valid' | 'invalid' | null
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: dropState === 'invalid' })
  const config = ORDER_STATUS_CONFIG[status]
  const Icon = config.icon

  return (
    <div className={clsx('flex min-h-0 min-w-56 flex-1 flex-col rounded-xl border border-neutral-800/60 transition-opacity', dropState === 'invalid' && 'opacity-35')}>
      <p className="flex shrink-0 items-center gap-1.5 px-3 py-2 text-[11px] font-semibold tracking-wide text-neutral-300 uppercase">
        <Icon size={12} className={COLUMN_TONE[status]} aria-hidden />
        {config.label}
      </p>
      <div
        ref={setNodeRef}
        className={clsx(
          'flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto rounded-b-xl p-1.5 transition-colors',
          isOver ? 'bg-brasa-500/10 ring-1 ring-brasa-500/40 ring-inset' : dropState === 'valid' ? 'bg-brasa-500/[0.04]' : 'bg-neutral-900/40',
        )}
      >
        {tickets.map((ticket) => (
          <KanbanTicketCard
            key={ticket.orderId}
            ticket={ticket}
            now={now}
            isNew={newIds.has(ticket.orderId)}
            onAcknowledge={() => onAcknowledge(ticket.orderId)}
            stalledNotes={stalledByOrder?.get(ticket.orderId)}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Tablero de Cocina: el flujo del pedido en cinco columnas — Por confirmar →
 * En cola → Preparando → Listo → En ruta. Se avanza con el botón de cada
 * tarjeta o arrastrando; el resto de acciones, en el detalle del pedido.
 */
export function KanbanView({
  tickets,
  isLoading,
  now,
  newIds,
  onAcknowledge,
  search = '',
  stalledByOrder,
}: {
  tickets: KitchenTicket[] | undefined
  isLoading: boolean
  now: number
  newIds: Set<string>
  onAcknowledge: (orderId: string) => void
  /** Filtra por # de pedido o cliente (la búsqueda vive en el header de la página). */
  search?: string
  /** Pedidos/platos detenidos, para marcar su tarjeta. */
  stalledByOrder?: Map<string, string[]>
}) {
  const board = useBoardActions()
  const { sensors, activeTicket, handleDragStart, handleDragEnd } = useKanbanDragDrop(tickets, board)

  const grouped = useMemo(() => {
    const term = search.trim().toLowerCase()
    const map: Record<KitchenOrderStatus, KitchenTicket[]> = { NUEVO: [], CONFIRMADO: [], EN_PREPARACION: [], LISTO: [], DESPACHADO: [], CANCELADO: [] }
    for (const ticket of tickets ?? []) {
      if (term && !String(ticket.orderNumber).includes(term) && !ticket.customerName.toLowerCase().includes(term)) continue
      map[ticket.orderStatus].push(ticket)
    }
    return map
  }, [tickets, search])

  if (isLoading) return <LoadingState variant="cards" rows={4} cols={5} />

  if ((tickets?.length ?? 0) === 0) {
    return <EmptyState icon={ChefHat} title="Cocina al día" description="No hay pedidos abiertos. Los que lleguen por WhatsApp aparecen aquí solos." />
  }

  const visibleCount = KANBAN_COLUMNS.reduce((sum, s) => sum + grouped[s].length, 0)

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={(e) => void handleDragEnd(e)}>
        <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto pb-1">
          {KANBAN_COLUMNS.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tickets={grouped[status]}
              now={now}
              newIds={newIds}
              onAcknowledge={onAcknowledge}
              stalledByOrder={stalledByOrder}
              dropState={!activeTicket || status === activeTicket.orderStatus ? null : canTransition(activeTicket.orderStatus, status, board.role) ? 'valid' : 'invalid'}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTicket && (
            <div className="shadow-float w-64 rounded-lg border border-brasa-500/60 bg-neutral-900 px-3 py-2">
              <KanbanCardBody ticket={activeTicket} now={now} density={board.density} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {visibleCount === 0 && <p className="px-1 text-sm text-neutral-500">Ningún pedido coincide con «{search}».</p>}
    </div>
  )
}
