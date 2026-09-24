import type { SupplySuggestion } from '../types'

/**
 * Umbral por defecto de "se acaba pronto", en días. Configurable en
 * Configuración → IA → Sugerencias de compra (coverage_days); este valor
 * aplica mientras no se haya cargado la configuración. La misma regla la usa
 * dk_inventory_signals (needs_reorder) para la IA.
 */
export const SHORT_COVERAGE_DAYS = 7

export type SupplyUrgency = 'bajo_minimo' | 'cobertura_corta' | 'sin_meta' | 'ok'

/**
 * Por qué un insumo pide atención, en orden de gravedad:
 *   bajo_minimo      — ya está en/por debajo del mínimo configurado
 *   cobertura_corta  — todavía alcanza, pero al ritmo actual se acaba antes del umbral (7 días por defecto)
 *   sin_meta         — está en cero y sin mín/máx configurado: no se puede sugerir cuánto pedir
 */
export function urgencyOf(s: SupplySuggestion, coverageDays = SHORT_COVERAGE_DAYS): SupplyUrgency {
  if (s.belowMin) return s.suggestedQuantity > 0 ? 'bajo_minimo' : 'sin_meta'
  if (s.coverageDays !== null && s.coverageDays < coverageDays) return 'cobertura_corta'
  return 'ok'
}

export function needsAttention(s: SupplySuggestion, coverageDays = SHORT_COVERAGE_DAYS): boolean {
  return urgencyOf(s, coverageDays) !== 'ok'
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
