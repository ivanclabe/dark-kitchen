import type { InsightItem, InsightResult } from '../types'

/** Ítems del análisis por id de referencia (solo si el análisis está disponible). */
export function insightItemsByRef(result: InsightResult | undefined): Map<string, InsightItem> {
  const map = new Map<string, InsightItem>()
  if (result?.kind !== 'ok') return map
  for (const item of result.insight.items) if (item.refId && !map.has(item.refId)) map.set(item.refId, item)
  return map
}
