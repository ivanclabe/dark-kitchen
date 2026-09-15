import { Clock, Flame } from 'lucide-react'
import type { ComponentType } from 'react'
import type { KitchenItemStatus, KitchenTicket } from '../types'

/**
 * Paleta semántica compartida por las 4 vistas de Cocina (Kanban, Lista,
 * Grid, SLA) — un solo lugar para no reinventar los colores/umbrales en
 * cada vista. CONFIRMADO (azul, "esperando") y EN_PREPARACION (ámbar, "en
 * marcha") a nivel de pedido y de plato; PRIORITARIO usa violeta (ver
 * TicketCard) para no colisionar con ningún estado.
 */
export const ITEM_STATUS_BADGE: Record<KitchenItemStatus, string> = {
  PENDIENTE: 'bg-neutral-700 text-neutral-200',
  EN_PREPARACION: 'bg-amber-500/20 text-amber-400',
  LISTO: 'bg-emerald-500/20 text-emerald-400',
}

export const ITEM_STATUS_LABEL: Record<KitchenItemStatus, string> = {
  PENDIENTE: 'Pendiente',
  EN_PREPARACION: 'En preparación',
  LISTO: 'Listo',
}

export const ORDER_STATUS_CONFIG: Record<
  KitchenTicket['orderStatus'],
  { label: string; badge: string; accent: string; icon: ComponentType<{ size?: number }> }
> = {
  CONFIRMADO: { label: 'Confirmado', badge: 'bg-blue-500/20 text-blue-400', accent: 'border-l-blue-500', icon: Clock },
  EN_PREPARACION: { label: 'En preparación', badge: 'bg-amber-500/20 text-amber-400', accent: 'border-l-amber-500', icon: Flame },
}

// Umbrales de urgencia por tiempo — configurables acá, sin necesidad de una
// tabla en base de datos para esto. El indicador queda contenido a su
// propio badge (no tiñe la tarjeta completa) para no competir visualmente
// con el color de estado o de prioridad. La vista SLA reutiliza estos
// mismos umbrales (en particular TIME_LATE_MIN) para "pedidos atrasados" —
// no inventa un número nuevo.
export const TIME_WARN_MIN = 10
export const TIME_LATE_MIN = 20

export type TimeTier = 'normal' | 'atencion' | 'retrasado'

export function timeTier(minutesAgo: number): TimeTier {
  if (minutesAgo >= TIME_LATE_MIN) return 'retrasado'
  if (minutesAgo >= TIME_WARN_MIN) return 'atencion'
  return 'normal'
}

export const TIME_TIER_STYLE: Record<TimeTier, string> = {
  normal: 'text-neutral-500',
  atencion: 'text-amber-400',
  retrasado: 'text-red-400',
}

export function minutesAgoSince(iso: string, now: number): number {
  return Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000))
}
