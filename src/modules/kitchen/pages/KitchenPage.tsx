import { useNow } from '@/shared/hooks/useNow'
import { cardClass, secondaryButtonClass } from '@/shared/ui/formClasses'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import {
  Bell,
  ChefHat,
  Check,
  CheckCheck,
  Clock,
  Flag,
  MessageSquareText,
  PlayCircle,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useMemo } from 'react'
import { useAdvanceKitchenItem, useKitchenQueue, useSetTicketPriority } from '../hooks/useKitchen'
import { useNewTicketAlert } from '../hooks/useNewTicketAlert'
import type { KitchenItemStatus, KitchenTicket, KitchenTicketItem } from '../types'

const STATUS_BADGE: Record<KitchenItemStatus, string> = {
  PENDIENTE: 'bg-neutral-700 text-neutral-200',
  EN_PREPARACION: 'bg-brasa-500/20 text-brasa-400',
  LISTO: 'bg-emerald-500/20 text-emerald-400',
}

const STATUS_LABEL: Record<KitchenItemStatus, string> = {
  PENDIENTE: 'Pendiente',
  EN_PREPARACION: 'En preparación',
  LISTO: 'Listo',
}

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
          <p className="text-sm font-medium text-neutral-100">
            {item.quantity}× {item.productName}
          </p>
          {item.observation && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-neutral-500">
              <MessageSquareText size={11} /> {item.observation}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[item.kitchenStatus]}`}>
            {STATUS_LABEL[item.kitchenStatus]}
          </span>
          {item.kitchenStatus !== 'LISTO' && (
            <button
              onClick={handleAdvance}
              disabled={advance.isPending}
              className={`${secondaryButtonClass} !px-3 !py-1.5`}
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

function TicketCard({
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
  const minutesAgo = Math.max(0, Math.round((now - new Date(ticket.createdAt).getTime()) / 60000))
  const urgent = minutesAgo >= 15
  const prioritized = ticket.priority > 0
  const pendingItems = ticket.items.filter((item) => item.kitchenStatus !== 'LISTO')

  const advanceAll = useAdvanceKitchenItem()
  const setPriority = useSetTicketPriority()
  const { show } = useToast()

  async function handleMarkAllReady() {
    onAcknowledge()
    try {
      for (const item of pendingItems) {
        if (item.kitchenStatus === 'PENDIENTE') await advanceAll.mutateAsync(item.id)
        await advanceAll.mutateAsync(item.id)
      }
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
      className={`${cardClass} ${urgent ? 'border-red-900/60' : ''} ${prioritized ? 'border-amber-600/70' : ''} ${
        isNew ? 'border-brasa-500 shadow-[0_0_0_1px_var(--color-brasa-500),0_0_20px_-4px_var(--color-brasa-500)]' : ''
      }`}
    >
      <div className="mb-2 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-neutral-100">{ticket.customerName}</p>
            {prioritized && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                <Flag size={10} /> Prioritario
              </span>
            )}
            {isNew && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brasa-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brasa-400">
                Nuevo
              </span>
            )}
          </div>
          <p className={`inline-flex items-center gap-1 text-xs ${urgent ? 'text-red-400' : 'text-neutral-500'}`}>
            <Clock size={11} />
            #{ticket.orderId.slice(0, 8)} · hace {minutesAgo} min
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isNew && (
            <button
              onClick={onAcknowledge}
              title="Marcar como visto"
              className="inline-flex items-center gap-1 rounded-full border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300 hover:bg-neutral-800"
            >
              <Check size={11} /> Visto
            </button>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              ticket.orderStatus === 'EN_PREPARACION' ? 'bg-brasa-500/20 text-brasa-400' : 'bg-neutral-700 text-neutral-200'
            }`}
          >
            {ticket.orderStatus === 'EN_PREPARACION' ? 'En preparación' : 'Confirmado'}
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
          className={`${secondaryButtonClass} !px-3 !py-1.5 ${prioritized ? '!border-amber-600/70 !text-amber-400' : ''}`}
        >
          <Flag size={13} /> {prioritized ? 'Quitar prioridad' : 'Prioritario'}
        </button>
        {pendingItems.length > 0 && (
          <button
            onClick={handleMarkAllReady}
            disabled={advanceAll.isPending}
            className={`${secondaryButtonClass} !px-3 !py-1.5`}
          >
            <CheckCheck size={13} /> Marcar todo listo
          </button>
        )}
      </div>
    </div>
  )
}

export function KitchenPage() {
  const { data: tickets, isLoading } = useKitchenQueue()
  const now = useNow()
  const { newIds, acknowledge, soundEnabled, toggleSound } = useNewTicketAlert(tickets)

  const sortedTickets = useMemo(
    () =>
      tickets
        ? [...tickets].sort((a, b) => {
            if (a.priority !== b.priority) return b.priority - a.priority
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          })
        : undefined,
    [tickets],
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChefHat size={22} className="text-brasa-500" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-neutral-50">Cocina</h1>
              {newIds.size > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brasa-600 px-2 py-0.5 text-xs font-semibold text-white">
                  <Bell size={12} /> {newIds.size} {newIds.size === 1 ? 'nuevo' : 'nuevos'}
                </span>
              )}
            </div>
            <p className="text-sm text-neutral-400">Pedidos confirmados en cola. Se actualiza automáticamente.</p>
          </div>
        </div>
        <button
          onClick={toggleSound}
          title={soundEnabled ? 'Silenciar alerta de pedidos nuevos' : 'Activar alerta de pedidos nuevos'}
          className="rounded-md border border-neutral-700 p-2 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
      </div>

      {isLoading && <p className="text-neutral-400">Cargando…</p>}
      {!isLoading && sortedTickets?.length === 0 && (
        <p className={`${cardClass} text-neutral-400`}>No hay pedidos pendientes en cocina.</p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sortedTickets?.map((ticket) => (
          <TicketCard
            key={ticket.orderId}
            ticket={ticket}
            now={now}
            isNew={newIds.has(ticket.orderId)}
            onAcknowledge={() => acknowledge(ticket.orderId)}
          />
        ))}
      </div>
    </div>
  )
}
