import type { KitchenOrderStatus } from '../types'

// Columnas visibles en el Kanban. CANCELADO se muestra aparte — es terminal,
// no participa de la secuencia activa de preparación.
export const KANBAN_COLUMNS: KitchenOrderStatus[] = ['CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'CANCELADO']

// Secuencia lineal de estados activos. Drag & drop y voz pueden moverse
// libremente hacia adelante o hacia atrás dentro de ella (corregir errores
// operativos sin un flujo especial de "deshacer").
const SEQUENCE: KitchenOrderStatus[] = ['CONFIRMADO', 'EN_PREPARACION', 'LISTO']

const NEXT_STATUS: Partial<Record<KitchenOrderStatus, Extract<KitchenOrderStatus, 'EN_PREPARACION' | 'LISTO'>>> = {
  CONFIRMADO: 'EN_PREPARACION',
  EN_PREPARACION: 'LISTO',
}

const PREV_STATUS: Partial<Record<KitchenOrderStatus, Extract<KitchenOrderStatus, 'CONFIRMADO' | 'EN_PREPARACION'>>> = {
  EN_PREPARACION: 'CONFIRMADO',
  LISTO: 'EN_PREPARACION',
}

/** Siguiente estado, o null si no hay paso siguiente (LISTO, CANCELADO). */
export function nextStatus(current: KitchenOrderStatus) {
  return NEXT_STATUS[current] ?? null
}

/** Paso anterior, o null si ya está al principio (CONFIRMADO) o es terminal (CANCELADO). */
export function prevStatus(current: KitchenOrderStatus) {
  return PREV_STATUS[current] ?? null
}

/**
 * Única fuente de verdad de qué transiciones son válidas — la usan drag &
 * drop, voz y los botones manuales del card. CANCELADO es terminal: no se
 * puede salir de él (no existe "descancelar", igual que dk_cancel_order ya
 * rechaza cancelar dos veces), pero se puede cancelar cualquier pedido
 * activo. Entre los 3 estados activos se permite avanzar y retroceder
 * libremente, incluyendo saltos de más de un paso (p. ej. LISTO ->
 * CONFIRMADO directo).
 */
export function canTransition(from: KitchenOrderStatus, to: KitchenOrderStatus): boolean {
  if (from === to) return false
  if (from === 'CANCELADO') return false
  if (to === 'CANCELADO') return true
  return SEQUENCE.includes(from) && SEQUENCE.includes(to)
}

/** true si `to` está más adelante que `from` en la secuencia activa (false para CANCELADO en cualquiera de los dos lados). */
export function isForward(from: KitchenOrderStatus, to: KitchenOrderStatus): boolean {
  return SEQUENCE.indexOf(to) > SEQUENCE.indexOf(from)
}
