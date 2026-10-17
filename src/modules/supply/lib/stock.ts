import type { Ingredient } from '../types'

/**
 * Disponible por debajo (o igual) del mínimo configurado. Sin mínimo (0) no hay
 * umbral que romper (ADR 0065): antes todo insumo sin mínimo y en 0 salía «bajo mínimo».
 */
export function isLowStock(ingredient: Ingredient): boolean {
  return ingredient.minStock > 0 && ingredient.stockAvailable <= ingredient.minStock
}

/**
 * Posición del stock disponible dentro de la banda mínimo→máximo, para la
 * barra visual. Sin `max_stock` no hay banda definida: se usa 2× el mínimo
 * como referencia visual (nunca como regla de negocio).
 */
export function stockRatio(ingredient: Ingredient): number {
  const ceiling = ingredient.maxStock ?? Math.max(ingredient.minStock * 2, 1)
  if (ceiling <= 0) return 0
  return Math.max(0, Math.min(1, ingredient.stockAvailable / ceiling))
}

/** Cuánto habría que comprar para llegar al máximo (o al doble del mínimo si no hay máximo). */
export function suggestedRestock(ingredient: Ingredient): number {
  const target = ingredient.maxStock ?? ingredient.minStock * 2
  return Math.max(0, Math.round((target - ingredient.stockAvailable) * 100) / 100)
}

export function inventoryValue(ingredients: Ingredient[]): number {
  return ingredients.reduce((sum, i) => sum + i.stockOnHand * i.avgCost, 0)
}
