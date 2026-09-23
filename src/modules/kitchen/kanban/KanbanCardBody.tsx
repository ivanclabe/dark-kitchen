import { formatMoney } from '@/shared/utils/format'
import clsx from 'clsx'
import { AlertTriangle, Bike, Clock, Flag, MapPin, MessageSquareText, TriangleAlert } from 'lucide-react'
import { useKitchenSlaSettings } from '../hooks/useKitchenSettings'
import {
  alertMinutesFor,
  avatarColorFor,
  CHANNEL_CONFIG,
  DEFAULT_SLA_THRESHOLDS,
  formatElapsed,
  initialsFor,
  minutesAgoSince,
  TIME_TIER_STYLE,
  timeTier,
} from '../lib/ticketVisuals'
import type { KitchenItemStatus, KitchenTicket, OrderChannel } from '../types'

function summarizeItems(items: KitchenTicket['items']): string {
  return items.map((item) => `${item.quantity}× ${item.productName}`).join(', ')
}

/** Avatar circular con iniciales del cliente — mismo color siempre para el mismo nombre. */
function CustomerAvatar({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${avatarColorFor(name)}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      title={name}
    >
      {initialsFor(name)}
    </span>
  )
}

/** Ícono de canal en una placa cuadrada junto al # de pedido. */
function ChannelBadge({ channel }: { channel: OrderChannel }) {
  const config = CHANNEL_CONFIG[channel]
  const Icon = config.icon
  return (
    <span className={`inline-flex size-4 shrink-0 items-center justify-center rounded ${config.badge}`} title={config.label}>
      <Icon size={10} />
    </span>
  )
}

const DOT: Record<KitchenItemStatus, string> = {
  PENDIENTE: 'bg-neutral-600',
  EN_PREPARACION: 'bg-amber-400',
  LISTO: 'bg-emerald-400',
}

/** Un punto por plato con su estado de cocina — lo que antes solo mostraba la vista Grid. */
function ItemProgress({ items }: { items: KitchenTicket['items'] }) {
  if (items.length < 2) return null
  const ready = items.filter((i) => i.kitchenStatus === 'LISTO').length
  return (
    <span className="inline-flex items-center gap-1" title={`${ready} de ${items.length} platos listos`}>
      {items.map((item) => (
        <span key={item.id} className={clsx('size-1.5 rounded-full', DOT[item.kitchenStatus])} aria-hidden />
      ))}
      <span className="ml-0.5 text-[10px] tabular-nums text-neutral-500">
        {ready}/{items.length}
      </span>
    </span>
  )
}

const KITCHEN_STAGES = new Set(['CONFIRMADO', 'EN_PREPARACION', 'LISTO'])

/**
 * Puramente visual — sin hooks de mutación ni drag. La usan la tarjeta
 * interactiva y el DragOverlay (el "clon" que sigue al cursor). El título es
 * lo que hay que cocinar; debajo, lo que la cocina NO puede pasar por alto
 * (observaciones del cliente) y, según la columna, lo que necesita quien
 * despacha (dirección, domiciliario).
 */
export function KanbanCardBody({ ticket, now, density = 'normal' }: { ticket: KitchenTicket; now: number; density?: 'normal' | 'grande' }) {
  const { data: thresholds = DEFAULT_SLA_THRESHOLDS } = useKitchenSlaSettings()
  const big = density === 'grande'
  const observations = ticket.items.filter((i) => i.observation).map((i) => `${i.productName}: ${i.observation}`)

  if (ticket.orderStatus === 'CANCELADO') {
    const cancelledMinutesAgo = minutesAgoSince(ticket.cancelledAt ?? ticket.createdAt, now)
    return (
      <>
        <p className={clsx('line-clamp-2 font-medium text-neutral-500 line-through decoration-neutral-700', big ? 'text-base' : 'text-sm')}>
          {summarizeItems(ticket.items)}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-neutral-600">
            <ChannelBadge channel={ticket.channel} />#{ticket.orderNumber}
          </span>
          <span className="inline-flex items-center gap-2 text-[11px] text-neutral-600">
            cancelado hace {formatElapsed(cancelledMinutesAgo)}
            <CustomerAvatar name={ticket.customerName} size={18} />
          </span>
        </div>
        {ticket.cancelReason && (
          <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-neutral-600">
            <MessageSquareText size={10} className="shrink-0" /> <span className="truncate">{ticket.cancelReason}</span>
          </p>
        )}
      </>
    )
  }

  const inKitchen = KITCHEN_STAGES.has(ticket.orderStatus)
  const isDispatched = ticket.orderStatus === 'DESPACHADO'
  // En ruta el reloj que importa es desde que salió, no desde que se creó.
  const minutesAgo = minutesAgoSince(isDispatched && ticket.dispatchedAt ? ticket.dispatchedAt : ticket.createdAt, now)
  const tier = timeTier(minutesAgo, alertMinutesFor(ticket.orderStatus, thresholds), thresholds.nearThresholdPct)
  const prioritized = ticket.priority > 0

  return (
    <>
      {ticket.items.length > 0 ? (
        <p className={clsx('line-clamp-2 font-medium text-neutral-100', big ? 'text-lg leading-snug' : 'text-sm')}>{summarizeItems(ticket.items)}</p>
      ) : (
        <p className={clsx('inline-flex items-center gap-1.5 font-medium text-amber-400', big ? 'text-base' : 'text-sm')}>
          <TriangleAlert size={13} aria-hidden /> Sin platos todavía
        </p>
      )}

      {observations.length > 0 && inKitchen && (
        <p className={clsx('mt-1.5 flex items-start gap-1 text-amber-300', big ? 'text-sm' : 'text-[11px]')}>
          <AlertTriangle size={big ? 13 : 11} className="mt-px shrink-0" aria-label="Observaciones" />
          <span className="line-clamp-2">{observations.join(' · ')}</span>
        </p>
      )}

      {(ticket.orderStatus === 'LISTO' || isDispatched) && (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-neutral-400">
          <MapPin size={11} className="shrink-0 text-neutral-500" aria-hidden />
          <span className="truncate">{ticket.address ?? 'Sin dirección registrada'}</span>
        </p>
      )}

      {isDispatched && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-violet-300">
          <Bike size={11} className="shrink-0" aria-hidden />
          <span className="truncate">{ticket.riderName ?? 'Sin domiciliario'}</span>
        </p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
          <ChannelBadge channel={ticket.channel} />#{ticket.orderNumber}
          {inKitchen && <ItemProgress items={ticket.items} />}
        </span>
        <div className="flex items-center gap-1.5">
          {ticket.requiresReview && (
            <span className="rounded bg-amber-500/15 px-1 text-[10px] font-medium text-amber-400" title="Tuvo devoluciones de inventario: revisar">
              Revisar
            </span>
          )}
          {prioritized && <Flag size={12} className="shrink-0 text-violet-400" aria-label="Pedido prioritario" />}
          {ticket.orderStatus === 'NUEVO' ? (
            <span className="text-xs font-medium tabular-nums text-neutral-400">{formatMoney(ticket.total)}</span>
          ) : (
            <span className={`inline-flex items-center gap-1 text-xs font-medium tabular-nums ${TIME_TIER_STYLE[tier]}`}>
              {tier === 'retrasado' ? <AlertTriangle size={11} /> : <Clock size={11} />}
              {formatElapsed(minutesAgo)}
            </span>
          )}
          <CustomerAvatar name={ticket.customerName} />
        </div>
      </div>

      {ticket.notes && (
        <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-neutral-500">
          <MessageSquareText size={10} className="shrink-0" /> <span className={big ? '' : 'truncate'}>{ticket.notes}</span>
        </p>
      )}
    </>
  )
}
