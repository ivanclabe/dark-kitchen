import { useMarkDelivered } from '@/modules/delivery/hooks/useDelivery'
import { Tooltip } from '@/shared/ui/Tooltip'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { useDraggable } from '@dnd-kit/core'
import clsx from 'clsx'
import { Bike, CheckCircle2, ChevronLeft, ChevronRight, Flag, PackageCheck, Play, XCircle, type LucideIcon } from 'lucide-react'
import { memo, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { useAdvanceTicketItems, useRevertTicketItems, useSetTicketPriority } from '../hooks/useKitchen'
import { useKitchenSlaSettings } from '../hooks/useKitchenSettings'
import { ACTION_DENIED_REASON, canPerform, type FlowAction } from '../lib/permissions'
import { alertMinutesFor, DEFAULT_SLA_THRESHOLDS, minutesAgoSince, timeTier } from '../lib/ticketVisuals'
import type { KitchenOrderStatus, KitchenTicket } from '../types'
import { useBoardActions } from './boardActions'
import { KanbanCardBody } from './KanbanCardBody'
import { prevStatus } from './transitions'

/** La acción principal de cada columna — el siguiente paso natural del pedido. */
const PRIMARY: Partial<Record<KitchenOrderStatus, { action: FlowAction; label: string; icon: LucideIcon }>> = {
  NUEVO: { action: 'confirm', label: 'Confirmar', icon: CheckCircle2 },
  CONFIRMADO: { action: 'advance', label: 'Iniciar', icon: Play },
  EN_PREPARACION: { action: 'advance', label: 'Marcar listo', icon: ChevronRight },
  LISTO: { action: 'dispatch', label: 'Despachar', icon: Bike },
  DESPACHADO: { action: 'deliver', label: 'Entregar', icon: PackageCheck },
}

const REVERT_LABEL: Partial<Record<KitchenOrderStatus, string>> = {
  EN_PREPARACION: 'Retroceder a la cola',
  LISTO: 'Retroceder a preparación',
}

const KITCHEN_STAGES = new Set<KitchenOrderStatus>(['CONFIRMADO', 'EN_PREPARACION', 'LISTO'])

/** Los botones del card no deben iniciar un arrastre ni abrir el detalle. */
function stop(e: PointerEvent | MouseEvent) {
  e.stopPropagation()
}

/**
 * Botón de acción que se respeta por rol: si tu rol no puede ejecutarla se
 * ve deshabilitado y el tooltip explica por qué (en vez de dejarte intentar
 * y devolver "No autorizado" desde la base).
 */
function ActionButton({
  action,
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  action: FlowAction
  label: string
  onClick: () => void
  disabled?: boolean
  className: string
  children: ReactNode
}) {
  const { role } = useBoardActions()
  const allowed = canPerform(role, action)
  return (
    <Tooltip label={allowed ? label : ACTION_DENIED_REASON[action]} side="top">
      <button
        type="button"
        onPointerDown={stop}
        onClick={(e) => {
          stop(e)
          if (allowed) onClick()
        }}
        disabled={disabled || !allowed}
        aria-label={label}
        className={clsx(className, 'disabled:cursor-not-allowed disabled:opacity-40')}
      >
        {children}
      </button>
    </Tooltip>
  )
}

/**
 * Tarjeta del tablero de Cocina. Todas las mutaciones son las mismas que ya
 * usaban los botones de las vistas anteriores, Pedidos, Despacho y el motor
 * de voz — ninguna lógica duplicada. Lo que necesita un diálogo (confirmar,
 * despachar, cancelar) o el detalle se pide al tablero (boardActions).
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
  const board = useBoardActions()
  const isCancelled = ticket.orderStatus === 'CANCELADO'
  const prioritized = ticket.priority > 0
  const { data: thresholds = DEFAULT_SLA_THRESHOLDS } = useKitchenSlaSettings()
  const tier = isCancelled ? 'normal' : timeTier(minutesAgoSince(ticket.createdAt, now), alertMinutesFor(ticket.orderStatus, thresholds), thresholds.nearThresholdPct)
  const primary = PRIMARY[ticket.orderStatus]
  const backTarget = prevStatus(ticket.orderStatus)

  const { advanceTicketItems, isPending: advancing } = useAdvanceTicketItems()
  const { revertTicketItems, isPending: reverting } = useRevertTicketItems()
  const setPriority = useSetTicketPriority()
  const markDelivered = useMarkDelivered()
  const { show } = useToast()

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: ticket.orderId,
    data: { status: ticket.orderStatus },
    disabled: isCancelled,
  })

  async function run(fn: () => Promise<unknown>, fallback: string) {
    try {
      await fn()
    } catch (err) {
      show(getErrorMessage(err, fallback), 'error')
    }
  }

  function handlePrimary() {
    onAcknowledge()
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

  function handleRevert() {
    if (!backTarget) return
    void run(() => revertTicketItems(ticket.items, backTarget === 'CONFIRMADO' ? 'PENDIENTE' : 'EN_PREPARACION'), `No se pudo retroceder el pedido ${ticket.orderNumber}.`)
  }

  function handleTogglePriority() {
    void run(() => setPriority.mutateAsync({ orderId: ticket.orderId, priority: prioritized ? 0 : 1 }), 'Error al actualizar la prioridad')
  }

  function handleCardKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // El div ya es focuseable (role=button) vía dnd-kit; el arrastre solo se
    // activa con puntero, así que Enter/Space abren el detalle.
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      board.openDetail(ticket)
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

  const busy = advancing || reverting || markDelivered.isPending

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => board.openDetail(ticket)}
      onKeyDown={handleCardKeyDown}
      className={clsx(
        'rounded-xl border border-l-[3px] border-neutral-800/60 bg-neutral-900 shadow-sm transition-shadow select-none hover:border-neutral-700/80',
        board.density === 'grande' ? 'px-4 py-3.5' : 'px-3 py-2.5',
        accentClass,
        isCancelled ? 'opacity-70' : 'cursor-grab touch-none active:cursor-grabbing',
        isDragging && 'opacity-30',
        isNew && 'shadow-[0_0_0_1px_var(--color-brasa-500)]',
      )}
    >
      <KanbanCardBody ticket={ticket} now={now} density={board.density} />

      {!isCancelled && (
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-neutral-800 pt-2">
          <div className="flex items-center gap-0.5">
            {KITCHEN_STAGES.has(ticket.orderStatus) && (
              <ActionButton
                action="priority"
                label={prioritized ? 'Quitar prioridad' : 'Marcar como prioritario'}
                onClick={handleTogglePriority}
                disabled={setPriority.isPending}
                className={clsx('rounded p-1 hover:bg-neutral-800', prioritized ? 'text-violet-400' : 'text-neutral-500 hover:text-violet-400')}
              >
                <Flag size={13} />
              </ActionButton>
            )}
            <ActionButton
              action="cancel"
              label="Cancelar pedido"
              onClick={() => board.requestCancel(ticket)}
              className="rounded p-1 text-neutral-600 hover:bg-red-500/10 hover:text-red-400"
            >
              <XCircle size={13} />
            </ActionButton>
            {isNew && (
              <button
                type="button"
                onPointerDown={stop}
                onClick={(e) => {
                  stop(e)
                  onAcknowledge()
                }}
                className="rounded px-1.5 py-0.5 text-[11px] text-brasa-400 hover:bg-neutral-800"
              >
                Visto
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            {backTarget && REVERT_LABEL[ticket.orderStatus] && (
              <ActionButton
                action="revert"
                label={REVERT_LABEL[ticket.orderStatus] ?? 'Retroceder'}
                onClick={handleRevert}
                disabled={busy}
                className="rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
              >
                <ChevronLeft size={13} />
              </ActionButton>
            )}
            {primary && (
              <ActionButton
                action={primary.action}
                label={primary.label}
                onClick={handlePrimary}
                disabled={busy || (ticket.orderStatus === 'NUEVO' && ticket.items.length === 0)}
                className="inline-flex items-center gap-1 rounded-lg bg-neutral-800/70 px-2 py-1 text-xs font-medium text-neutral-100 hover:bg-brasa-500 hover:text-white"
              >
                <primary.icon size={12} aria-hidden />
                {primary.label}
              </ActionButton>
            )}
          </div>
        </div>
      )}
    </div>
  )
})
