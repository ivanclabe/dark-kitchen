import { EmptyState } from '@/shared/ui/EmptyState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { DndContext, DragOverlay, useDroppable, type Announcements, type ScreenReaderInstructions, type UniqueIdentifier } from '@dnd-kit/core'
import clsx from 'clsx'
import { ClipboardList, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { ORDER_STATUS_CONFIG } from '../lib/orderVisuals'
import { KANBAN_COLUMNS, transitionAction } from '../lib/transitions'
import type { Order, OrderStatus } from '../types'
import { allows, useBoardActions } from './boardActions'
import { OrderCard } from './OrderCard'
import { OrderCardBody } from './OrderCardBody'
import { useBoardDragDrop } from './useBoardDragDrop'

/** Etiqueta de columna — "Listo" en singular como en el resto del flujo. */
const COLUMN_TONE: Partial<Record<OrderStatus, string>> = {
  NUEVO: 'text-neutral-400',
  CONFIRMADO: 'text-blue-400',
  EN_PREPARACION: 'text-amber-400',
  LISTO: 'text-emerald-400',
  DESPACHADO: 'text-violet-400',
}

const INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    'Para mover un pedido, arrástralo a otra columna; en pantallas táctiles, mantenlo presionado y arrástralo. Enter abre el detalle del pedido, con todas sus acciones.',
}

/** dnd-kit says what happens during a drag — in Spanish and with the order number (it was in English). */
function announcements(tickets: Order[] | undefined): Announcements {
  const order = (id: UniqueIdentifier) => {
    const ticket = tickets?.find((t) => t.id === id)
    return ticket ? `pedido #${ticket.orderNumber}` : 'pedido'
  }
  const column = (id: UniqueIdentifier) => ORDER_STATUS_CONFIG[id as OrderStatus]?.label ?? String(id)
  return {
    onDragStart: ({ active }) => `Moviendo el ${order(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `El ${order(active.id)} está sobre ${column(over.id)}.` : `El ${order(active.id)} no está sobre ninguna columna.`),
    onDragEnd: ({ active, over }) => (over ? `El ${order(active.id)} se soltó en ${column(over.id)}.` : `El ${order(active.id)} volvió a su columna.`),
    onDragCancel: ({ active }) => `Se canceló el movimiento del ${order(active.id)}.`,
  }
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
  status: OrderStatus
  tickets: Order[]
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
    // Phone (ADR 0065): one column at a time with a peek of the next, snapping — it used to cut them in half.
    <div
      className={clsx(
        'flex min-h-0 w-[85%] shrink-0 snap-start flex-col rounded-xl border border-neutral-800/60 transition-opacity sm:w-auto sm:min-w-52 sm:flex-1 sm:shrink',
        dropState === 'invalid' && 'opacity-35',
      )}
    >
      <p className="flex shrink-0 items-center gap-1.5 px-3 py-2 text-2xs font-semibold tracking-wide text-neutral-300 uppercase">
        <Icon size={12} className={COLUMN_TONE[status]} aria-hidden />
        {config.label}
      </p>
      <div
        ref={setNodeRef}
        className={clsx(
          'flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto rounded-b-xl p-1.5 transition-colors',
          isOver ? 'bg-neutral-50/10 ring-1 ring-neutral-50/40 ring-inset' : dropState === 'valid' ? 'bg-neutral-50/[0.04]' : 'bg-neutral-900/40',
        )}
      >
        {tickets.map((ticket) => (
          <OrderCard
            key={ticket.id}
            ticket={ticket}
            now={now}
            isNew={newIds.has(ticket.id)}
            onAcknowledge={() => onAcknowledge(ticket.id)}
            stalledNotes={stalledByOrder?.get(ticket.id)}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * The order board (ADR 0020). Pedidos shows the whole flow in five columns
 * (Por confirmar → En cola → Preparando → Listo → En ruta); Cocina shows the
 * same orders in its three columns. Cards move with their button or by
 * dragging; everything else lives in the order detail.
 */
export function OrderBoard({
  columns = KANBAN_COLUMNS,
  emptyTitle = 'Sin pedidos abiertos',
  emptyDescription = 'Los pedidos nuevos, también los de WhatsApp, aparecen aquí solos.',
  emptyIcon = ClipboardList,
  tickets,
  isLoading,
  now,
  newIds,
  onAcknowledge,
  search = '',
  stalledByOrder,
}: {
  columns?: OrderStatus[]
  emptyTitle?: string
  emptyDescription?: string
  emptyIcon?: LucideIcon
  tickets: Order[] | undefined
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
  const { sensors, activeTicket, handleDragStart, handleDragEnd } = useBoardDragDrop(tickets, board)
  const dropAllowed = (from: OrderStatus, to: OrderStatus) => {
    const action = transitionAction(from, to)
    return action !== null && allows(board, action)
  }

  const grouped = useMemo(() => {
    const term = search.trim().toLowerCase()
    const map: Record<OrderStatus, Order[]> = { NUEVO: [], CONFIRMADO: [], EN_PREPARACION: [], LISTO: [], DESPACHADO: [], ENTREGADO: [], CANCELADO: [] }
    for (const ticket of tickets ?? []) {
      if (term && !String(ticket.orderNumber).includes(term) && !ticket.customerName.toLowerCase().includes(term)) continue
      map[ticket.status].push(ticket)
    }
    return map
  }, [tickets, search])

  if (isLoading) return <LoadingState variant="cards" rows={4} cols={columns.length} />

  const total = columns.reduce((sum, s) => sum + grouped[s].length, 0)
  if (total === 0 && !search.trim()) {
    return <EmptyState icon={emptyIcon} mood="idle" title={emptyTitle} description={emptyDescription} />
  }

  const visibleCount = total

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <DndContext
        sensors={sensors}
        accessibility={{ announcements: announcements(tickets), screenReaderInstructions: INSTRUCTIONS }}
        onDragStart={handleDragStart}
        onDragEnd={(e) => void handleDragEnd(e)}
      >
        <div className={clsx('flex min-h-0 flex-1 gap-2 overflow-x-auto overscroll-x-contain pb-1 sm:snap-none', activeTicket ? 'snap-none' : 'snap-x snap-mandatory')}>
          {columns.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tickets={grouped[status]}
              now={now}
              newIds={newIds}
              onAcknowledge={onAcknowledge}
              stalledByOrder={stalledByOrder}
              dropState={!activeTicket || status === activeTicket.status ? null : dropAllowed(activeTicket.status, status) ? 'valid' : 'invalid'}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTicket && (
            <div className="shadow-float w-64 rounded-lg border border-neutral-50/60 bg-neutral-900 px-3 py-2">
              <OrderCardBody ticket={activeTicket} now={now} density={board.density} kitchen={board.kitchen} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {visibleCount === 0 && <p className="px-1 text-sm text-neutral-500">Ningún pedido coincide con «{search}».</p>}
    </div>
  )
}
