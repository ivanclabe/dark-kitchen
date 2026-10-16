/**
 * ADR 0063 (D6): the food cost of a dish against the account target. Same rule
 * as `dk_dish_margins()` in the database: cost ÷ price, and a suggested price
 * that reaches the target, rounded up to 100.
 */
export type DishMarginStatus = 'no_cost' | 'below_cost' | 'above_target' | 'ok'

export interface DishMargin {
  status: DishMarginStatus
  /** Cost ÷ price in %, one decimal (null without a cost or a price). */
  foodCostPct: number | null
  /** Price that reaches the target (null without a cost). */
  suggestedPrice: number | null
}

export function dishMargin(price: number, cost: number, targetPct: number): DishMargin {
  if (!(cost > 0)) return { status: 'no_cost', foodCostPct: null, suggestedPrice: null }
  const suggestedPrice = targetPct > 0 ? Math.ceil(cost / (targetPct / 100) / 100) * 100 : null
  const foodCostPct = price > 0 ? Math.round((cost / price) * 1000) / 10 : null
  if (price <= cost) return { status: 'below_cost', foodCostPct, suggestedPrice }
  return { status: foodCostPct !== null && foodCostPct > targetPct ? 'above_target' : 'ok', foodCostPct, suggestedPrice }
}
