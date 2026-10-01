import type { MenuPlanItem } from '../types'

/** What is being dragged, for days to decide whether they accept it. */
export interface PlanDragInfo {
  productId: string | null
  /** Day the dragged dish comes from (moving within its own day is reordering). */
  sourceDate: string | null
}

/** A day refuses a dish it already has, except the day the dish is being dragged from. */
export function isDayBlocked(date: string, items: MenuPlanItem[], drag: PlanDragInfo | undefined): boolean {
  if (!drag?.productId || drag.sourceDate === date) return false
  return items.some((i) => i.productId === drag.productId)
}
