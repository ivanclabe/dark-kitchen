import { Bike, CheckCircle2, Clock, FilePen, Flame, MessageCircle, Phone, Store, XCircle } from 'lucide-react'
import type { ComponentType } from 'react'
import type { KitchenItemStatus, KitchenOrderStatus, OrderChannel } from '../types'

/**
 * Paleta semántica compartida por las 4 vistas de Cocina (Kanban, Lista,
 * Grid, SLA) — un solo lugar para no reinventar los colores/umbrales en
 * cada vista. CONFIRMADO (azul, "esperando"), EN_PREPARACION (ámbar, "en
 * marcha"), LISTO (verde) y CANCELADO (rojo, mismo tono que ya usa el
 * módulo Pedidos para este estado) a nivel de pedido y de plato;
 * PRIORITARIO usa violeta (ver TicketCard) para no colisionar con ningún
 * estado.
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
  KitchenOrderStatus,
  { label: string; badge: string; accent: string; icon: ComponentType<{ size?: number; className?: string }> }
> = {
  NUEVO: { label: 'Por confirmar', badge: 'bg-neutral-700/60 text-neutral-300', accent: 'border-l-neutral-500', icon: FilePen },
  CONFIRMADO: { label: 'En cola', badge: 'bg-blue-500/20 text-blue-400', accent: 'border-l-blue-500', icon: Clock },
  EN_PREPARACION: { label: 'Preparando', badge: 'bg-amber-500/20 text-amber-400', accent: 'border-l-amber-500', icon: Flame },
  LISTO: { label: 'Listo', badge: 'bg-emerald-500/20 text-emerald-400', accent: 'border-l-emerald-500', icon: CheckCircle2 },
  DESPACHADO: { label: 'En ruta', badge: 'bg-violet-500/20 text-violet-400', accent: 'border-l-violet-500', icon: Bike },
  CANCELADO: { label: 'Cancelado', badge: 'bg-red-500/20 text-red-400', accent: 'border-l-red-500', icon: XCircle },
}

/**
 * Etiqueta de canal del pedido (pill pequeño en el card del Kanban,
 * inspirado en las etiquetas de Epic de Jira) — da contexto inmediato de
 * dónde vino el pedido sin ocupar una columna propia.
 */
export const CHANNEL_CONFIG: Record<
  OrderChannel,
  { label: string; badge: string; icon: ComponentType<{ size?: number; className?: string }> }
> = {
  MANUAL: { label: 'Mostrador', badge: 'bg-neutral-700/60 text-neutral-300', icon: Store },
  WHATSAPP: { label: 'WhatsApp', badge: 'bg-emerald-500/20 text-emerald-400', icon: MessageCircle },
  PHONE: { label: 'Teléfono', badge: 'bg-sky-500/20 text-sky-400', icon: Phone },
}

/** Paleta rotativa para el avatar de iniciales del cliente — mismo color siempre para el mismo nombre. */
const AVATAR_PALETTE = [
  'bg-rose-500/25 text-rose-300',
  'bg-amber-500/25 text-amber-300',
  'bg-emerald-500/25 text-emerald-300',
  'bg-sky-500/25 text-sky-300',
  'bg-violet-500/25 text-violet-300',
  'bg-pink-500/25 text-pink-300',
  'bg-teal-500/25 text-teal-300',
  'bg-indigo-500/25 text-indigo-300',
]

export function avatarColorFor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}

export { initials as initialsFor } from '@/shared/utils/format'

/**
 * Umbrales de alerta por estado — antes fijos (TIME_WARN_MIN/TIME_LATE_MIN
 * globales), ahora configurables desde dk_kitchen_sla_settings (ver
 * useKitchenSettings). Estos valores son solo el fallback mientras carga la
 * configuración real o si nunca se guardó una fila (no debería pasar, la
 * migración siembra una por defecto).
 */
export interface SlaThresholds {
  confirmadoAlertMin: number
  enPreparacionAlertMin: number
  listoAlertMin: number
  nearThresholdPct: number
}

export const DEFAULT_SLA_THRESHOLDS: SlaThresholds = {
  confirmadoAlertMin: 10,
  enPreparacionAlertMin: 20,
  listoAlertMin: 15,
  nearThresholdPct: 80,
}

/**
 * Solo los estados de cocina tienen umbral configurado en
 * dk_kitchen_sla_settings. NUEVO (borrador de caja), DESPACHADO (en manos
 * del domiciliario) y CANCELADO no generan alerta de SLA: no hay un umbral
 * acordado para ellos y no se inventa uno.
 */
export function alertMinutesFor(status: KitchenOrderStatus, thresholds: SlaThresholds): number | null {
  switch (status) {
    case 'CONFIRMADO':
      return thresholds.confirmadoAlertMin
    case 'EN_PREPARACION':
      return thresholds.enPreparacionAlertMin
    case 'LISTO':
      return thresholds.listoAlertMin
    case 'NUEVO':
    case 'DESPACHADO':
    case 'CANCELADO':
      return null
  }
}

export type TimeTier = 'normal' | 'atencion' | 'retrasado'

/**
 * `alertMin: null` (pedido CANCELADO) siempre da 'normal' — sin esa señal
 * no hay "tiempo transcurrido" operativo que alertar.
 */
export function timeTier(minutesAgo: number, alertMin: number | null, nearThresholdPct: number): TimeTier {
  if (alertMin === null) return 'normal'
  if (minutesAgo >= alertMin) return 'retrasado'
  if (minutesAgo >= alertMin * (nearThresholdPct / 100)) return 'atencion'
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

/**
 * < 1h: "08 min" / "37 min". >= 1h: "1h 04m" / "2h 10m" — nunca "125 min".
 */
export function formatElapsed(minutesAgo: number): string {
  if (minutesAgo < 60) return `${String(minutesAgo).padStart(2, '0')} min`
  const hours = Math.floor(minutesAgo / 60)
  const mins = minutesAgo % 60
  return `${hours}h ${String(mins).padStart(2, '0')}m`
}
