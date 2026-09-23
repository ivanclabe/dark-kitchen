import type { SupplySuggestion } from '../types'

/**
 * Umbral de "se acaba pronto", en días. Vive acá (no en SQL) a propósito: la
 * vista dk_supply_suggestions solo expone hechos, y la política de cuándo
 * alarmarse es de la aplicación. Una semana es el horizonte típico de compra
 * de una cocina; si mañana se vuelve configurable, se cambia solo acá.
 */
export const SHORT_COVERAGE_DAYS = 7

export type SupplyUrgency = 'bajo_minimo' | 'cobertura_corta' | 'sin_meta' | 'ok'

/**
 * Por qué un insumo pide atención, en orden de gravedad:
 *   bajo_minimo      — ya está en/por debajo del mínimo configurado
 *   cobertura_corta  — todavía alcanza, pero al ritmo actual se acaba en <7 días
 *   sin_meta         — está en cero y sin mín/máx configurado: no se puede sugerir cuánto pedir
 */
export function urgencyOf(s: SupplySuggestion): SupplyUrgency {
  if (s.belowMin) return s.suggestedQuantity > 0 ? 'bajo_minimo' : 'sin_meta'
  if (s.coverageDays !== null && s.coverageDays < SHORT_COVERAGE_DAYS) return 'cobertura_corta'
  return 'ok'
}

export function needsAttention(s: SupplySuggestion): boolean {
  return urgencyOf(s) !== 'ok'
}

/** Cuánto pedir: la meta configurada o, si no hay meta pero sí ritmo, dos semanas de consumo. */
export function orderQuantity(s: SupplySuggestion): number {
  if (s.suggestedQuantity > 0) return s.suggestedQuantity
  if (s.dailyBurn > 0) return Math.ceil(s.dailyBurn * 14)
  return 0
}

export function formatCoverage(s: SupplySuggestion): string {
  if (s.coverageDays === null) return 'Sin consumo registrado'
  if (s.coverageDays < 1) return 'Menos de 1 día'
  return `~${s.coverageDays} día${s.coverageDays >= 2 ? 's' : ''}`
}
