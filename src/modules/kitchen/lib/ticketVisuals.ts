import { CheckCircle2, Clock, Flame, XCircle } from 'lucide-react'
import type { ComponentType } from 'react'
import type { KitchenItemStatus, KitchenOrderStatus } from '../types'

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
  CONFIRMADO: { label: 'Confirmado', badge: 'bg-blue-500/20 text-blue-400', accent: 'border-l-blue-500', icon: Clock },
  EN_PREPARACION: { label: 'En preparación', badge: 'bg-amber-500/20 text-amber-400', accent: 'border-l-amber-500', icon: Flame },
  LISTO: { label: 'Listo', badge: 'bg-emerald-500/20 text-emerald-400', accent: 'border-l-emerald-500', icon: CheckCircle2 },
  CANCELADO: { label: 'Cancelado', badge: 'bg-red-500/20 text-red-400', accent: 'border-l-red-500', icon: XCircle },
}

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

/** CANCELADO no tiene umbral: un pedido cancelado no debe seguir generando alertas operativas. */
export function alertMinutesFor(status: KitchenOrderStatus, thresholds: SlaThresholds): number | null {
  switch (status) {
    case 'CONFIRMADO':
      return thresholds.confirmadoAlertMin
    case 'EN_PREPARACION':
      return thresholds.enPreparacionAlertMin
    case 'LISTO':
      return thresholds.listoAlertMin
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
