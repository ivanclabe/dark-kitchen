import type { Can } from '@/shared/rbac/roles'
import { canPerform, type FlowAction } from '../lib/permissions'
import type { KitchenOrderStatus, KitchenPrepStatus } from '../types'

/**
 * Columnas del tablero, en orden: el flujo activo del pedido. ENTREGADO y
 * CANCELADO no son columna: salen del tablero y se consultan en Historial.
 * Cancelar sigue siendo una transición válida (desde el detalle del pedido).
 */
export const KANBAN_COLUMNS: KitchenOrderStatus[] = ['NUEVO', 'CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'DESPACHADO']

/** Tramo de cocina: dentro de él se avanza y retrocede libremente (corregir errores sin un "deshacer" especial). */
const KITCHEN_SEQUENCE: KitchenOrderStatus[] = ['CONFIRMADO', 'EN_PREPARACION', 'LISTO']

/** Orden lineal del flujo completo, para saber qué es "hacia adelante". */
const FLOW_SEQUENCE: KitchenOrderStatus[] = ['NUEVO', ...KITCHEN_SEQUENCE, 'DESPACHADO']

const NEXT_STATUS: Partial<Record<KitchenOrderStatus, KitchenOrderStatus>> = {
  NUEVO: 'CONFIRMADO',
  CONFIRMADO: 'EN_PREPARACION',
  EN_PREPARACION: 'LISTO',
  LISTO: 'DESPACHADO',
}

const PREV_STATUS: Partial<Record<KitchenOrderStatus, KitchenPrepStatus>> = {
  EN_PREPARACION: 'CONFIRMADO',
  LISTO: 'EN_PREPARACION',
}

/** Siguiente columna, o null si no hay (DESPACHADO sale del tablero con "Entregar"; CANCELADO es terminal). */
export function nextStatus(current: KitchenOrderStatus) {
  return NEXT_STATUS[current] ?? null
}

/**
 * Columna anterior, o null. Solo existe dentro del tramo de cocina: no hay
 * RPC para "desconfirmar" un pedido ni para "desdespacharlo".
 */
export function prevStatus(current: KitchenOrderStatus) {
  return PREV_STATUS[current] ?? null
}

/** true si `to` está más adelante que `from` en el flujo (false si alguno es CANCELADO). */
export function isForward(from: KitchenOrderStatus, to: KitchenOrderStatus): boolean {
  const a = FLOW_SEQUENCE.indexOf(from)
  const b = FLOW_SEQUENCE.indexOf(to)
  return a !== -1 && b !== -1 && b > a
}

/**
 * Qué acción real (qué RPC) implica mover un pedido de `from` a `to`, o null
 * si no existe forma de hacerlo. Única fuente de verdad para drag & drop,
 * botones del card y voz:
 *   - cualquier estado activo → CANCELADO: cancelar
 *   - NUEVO → CONFIRMADO: confirmar (no se salta: confirmar reserva inventario)
 *   - LISTO → DESPACHADO: despachar (pide domiciliario)
 *   - dentro de Confirmado/Preparación/Listo: avanzar o retroceder, con saltos
 *   - nada sale de CANCELADO ni de DESPACHADO, y nada vuelve a NUEVO
 */
export function transitionAction(from: KitchenOrderStatus, to: KitchenOrderStatus): FlowAction | null {
  if (from === to || from === 'CANCELADO') return null
  if (to === 'CANCELADO') return 'cancel'
  if (from === 'NUEVO') return to === 'CONFIRMADO' ? 'confirm' : null
  if (to === 'DESPACHADO') return from === 'LISTO' ? 'dispatch' : null
  if (KITCHEN_SEQUENCE.includes(from) && KITCHEN_SEQUENCE.includes(to)) return isForward(from, to) ? 'advance' : 'revert'
  return null
}

/**
 * ¿Se puede mover? Sin `can` responde solo si la transición existe; con
 * `can` (permisos de la Cocina activa) además exige poder ejecutar la acción.
 */
export function canTransition(from: KitchenOrderStatus, to: KitchenOrderStatus, can?: Can | null): boolean {
  const action = transitionAction(from, to)
  if (!action) return false
  return can === undefined ? true : canPerform(can, action)
}
