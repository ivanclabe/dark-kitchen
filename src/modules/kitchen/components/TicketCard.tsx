import { cardClass, secondaryButtonClass } from '@/shared/ui/formClasses'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { AlertTriangle, Check, CheckCheck, Clock, Flag, MessageSquareText, PlayCircle } from 'lucide-react'
import { useAdvanceKitchenItem, useAdvanceTicketItems, useSetTicketPriority } from '../hooks/useKitchen'
import { useKitchenSlaSettings } from '../hooks/useKitchenSettings'
import {
  alertMinutesFor,
  DEFAULT_SLA_THRESHOLDS,
  formatElapsed,
  ITEM_STATUS_BADGE,
  ITEM_STATUS_LABEL,
  minutesAgoSince,
  ORDER_STATUS_CONFIG,
  TIME_TIER_STYLE,
  timeTier,
} from '../lib/ticketVisuals'
import type { KitchenTicket, KitchenTicketItem } from '../types'

function ItemRow({ item, onInteract }: { item: KitchenTicketItem; onInteract: () => void }) {
  const advance = useAdvanceKitchenItem()
  const { show } = useToast()

  async function handleAdvance() {
    onInteract()
    try {
      await advance.mutateAsync(item.id)
      show(item.kitchenStatus === 'PENDIENTE' ? `${item.productName} en preparación.` : `${item.productName} listo.`)
    } catch (err) {
      show(getErrorMessage(err, 'Error al actualizar el plato'), 'error')
    }
  }

  return (
    <div className="border-b border-neutral-800 py-2 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-neutral-100 2xl:text-base">
            {item.quantity}× {item.productName}
          </p>
          {item.observation && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-neutral-500 2xl:text-sm">
              <MessageSquareText size={11} /> {item.observation}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium 2xl:text-sm ${ITEM_STATUS_BADGE[item.kitchenStatus]}`}>
            {ITEM_STATUS_LABEL[item.kitchenStatus]}
          </span>
          {item.kitchenStatus !== 'LISTO' && (
            <button
              onClick={handleAdvance}
              disabled={advance.isPending}
              className={`${secondaryButtonClass} !px-3.5 !py-3 2xl:!text-base`}
            >
              <PlayCircle size={13} />
              {item.kitchenStatus === 'PENDIENTE' ? 'Iniciar' : 'Marcar listo'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function TicketCard({
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
  const { data: thresholds = DEFAULT_SLA_THRESHOLDS } = useKitchenSlaSettings()
  const minutesAgo = minutesAgoSince(ticket.createdAt, now)
  const tier = timeTier(minutesAgo, alertMinutesFor(ticket.orderStatus, thresholds), thresholds.nearThresholdPct)
  const prioritized = ticket.priority > 0
  const statusConfig = ORDER_STATUS_CONFIG[ticket.orderStatus]
  const StatusIcon = statusConfig.icon
  const pendingCount = ticket.items.filter((item) => item.kitchenStatus === 'PENDIENTE').length
  const notReadyCount = ticket.items.filter((item) => item.kitchenStatus !== 'LISTO').length

  const { advanceTicketItems, isPending: advancingAll } = useAdvanceTicketItems()
  const setPriority = useSetTicketPriority()
  const { show } = useToast()

  async function handleStartAll() {
    onAcknowledge()
    try {
      await advanceTicketItems(ticket.items, 'EN_PREPARACION')
      show('Todos los platos pendientes iniciaron preparación.')
    } catch (err) {
      show(getErrorMessage(err, 'Error al iniciar el ticket'), 'error')
    }
  }

  async function handleMarkAllReady() {
    onAcknowledge()
    try {
      await advanceTicketItems(ticket.items, 'LISTO')
      show('Todos los platos del ticket quedaron listos.')
    } catch (err) {
      show(getErrorMessage(err, 'Error al marcar el ticket como listo'), 'error')
    }
  }

  async function handleTogglePriority() {
    try {
      await setPriority.mutateAsync({ orderId: ticket.orderId, priority: prioritized ? 0 : 1 })
    } catch (err) {
      show(getErrorMessage(err, 'Error al actualizar la prioridad'), 'error')
    }
  }

  return (
    <div
      className={`${cardClass} border-l-4 ${prioritized ? 'border-l-violet-500' : statusConfig.accent} ${
        isNew ? 'shadow-[0_0_0_1px_var(--color-brasa-500),0_0_20px_-4px_var(--color-brasa-500)]' : ''
      }`}
    >
      <div className="mb-2 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-neutral-100 2xl:text-lg">{ticket.customerName}</p>
            {prioritized && (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-400 2xl:text-xs">
                <Flag size={10} /> Prioritario
              </span>
            )}
            {isNew && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brasa-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brasa-400 2xl:text-xs">
                Nuevo
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500 2xl:text-sm">
            <span>#{ticket.orderNumber}</span>
            <span className={`inline-flex items-center gap-1 ${TIME_TIER_STYLE[tier]}`}>
              {tier === 'retrasado' ? <AlertTriangle size={11} /> : <Clock size={11} />}
              hace {formatElapsed(minutesAgo)}{tier === 'atencion' ? ' · atención' : tier === 'retrasado' ? ' · retrasado' : ''}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isNew && (
            <button
              onClick={onAcknowledge}
              title="Marcar como visto"
              className="inline-flex items-center gap-1 rounded-full border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300 hover:bg-neutral-800 2xl:text-xs"
            >
              <Check size={11} /> Visto
            </button>
          )}
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium 2xl:text-sm ${statusConfig.badge}`}>
            <StatusIcon size={11} /> {statusConfig.label}
          </span>
        </div>
      </div>
      {ticket.notes && (
        <p className="mb-2 inline-flex items-center gap-1 text-xs text-neutral-500">
          <MessageSquareText size={11} /> {ticket.notes}
        </p>
      )}
      <div>
        {ticket.items.map((item) => (
          <ItemRow key={item.id} item={item} onInteract={onAcknowledge} />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-neutral-800 pt-3">
        <button
          onClick={handleTogglePriority}
          disabled={setPriority.isPending}
          title={prioritized ? 'Quitar prioridad' : 'Marcar como prioritario'}
          className={`${secondaryButtonClass} !px-3.5 !py-3 2xl:!text-base ${prioritized ? '!border-violet-600/70 !text-violet-400' : ''}`}
        >
          <Flag size={13} /> {prioritized ? 'Quitar prioridad' : 'Prioritario'}
        </button>
        {pendingCount > 0 && (
          <button
            onClick={handleStartAll}
            disabled={advancingAll}
            className={`${secondaryButtonClass} !px-3.5 !py-3 2xl:!text-base`}
          >
            <PlayCircle size={13} /> Iniciar todo
          </button>
        )}
        {notReadyCount > 0 && (
          <button
            onClick={handleMarkAllReady}
            disabled={advancingAll}
            className={`${secondaryButtonClass} !px-3.5 !py-3 2xl:!text-base`}
          >
            <CheckCheck size={13} /> Marcar todo listo
          </button>
        )}
      </div>
    </div>
  )
}
