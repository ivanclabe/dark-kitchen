import type { KitchenOrderStatus } from '../types'

// Despachado queda fuera: es dominio del módulo Despachos, no de Cocina.
export const KANBAN_COLUMNS: KitchenOrderStatus[] = ['CONFIRMADO', 'EN_PREPARACION', 'LISTO']

const NEXT_STATUS: Partial<Record<KitchenOrderStatus, Extract<KitchenOrderStatus, 'EN_PREPARACION' | 'LISTO'>>> = {
  CONFIRMADO: 'EN_PREPARACION',
  EN_PREPARACION: 'LISTO',
}

/** Siguiente estado en el flujo de Cocina, o null si ya no hay un paso siguiente (LISTO). */
export function nextStatus(current: KitchenOrderStatus) {
  return NEXT_STATUS[current] ?? null
}

/**
 * Solo se permite avanzar (nunca retroceder) y solo entre las columnas del
 * Kanban. `advanceTicketItems` ya sabe llevar un ticket de CONFIRMADO
 * directo a LISTO en una sola llamada, así que soltar sobre una columna más
 * adelante que la actual (no solo la inmediata siguiente) es una operación
 * válida — soltarlo en la misma columna o en una anterior no lo es.
 */
export function isForwardTransition(from: KitchenOrderStatus, to: KitchenOrderStatus): boolean {
  return KANBAN_COLUMNS.indexOf(to) > KANBAN_COLUMNS.indexOf(from)
}
