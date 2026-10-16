import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'

/**
 * ADR 0063 (D4–D6): the cost rules of the account (feature `cost_controls`).
 * They only warn and propose; they never block or change a price on their own.
 */
export interface CostSettings {
  /** False when the organization or the account turned the rules off: no warnings. */
  enabled: boolean
  targetFoodCostPct: number
  priceChangePct: number
  reorderDays: number
}

/**
 * Whether the dish costs can be shown: the rules are on and the person sees recipes or profitability
 * (the same permissions as `dk_dish_margins`; a cashier with sales reports does not see costs).
 */
export function useShowDishCosts(): { show: boolean; targetPct: number } {
  const { can } = useActiveKitchen()
  const cost = useCostSettings()
  return { show: cost.enabled && (can('recipes.view') || can('reports.profitability')), targetPct: cost.targetFoodCostPct }
}

/** Same defaults as `dk_features.default_settings` (migration 20261015140000). */
export const COST_DEFAULTS: Omit<CostSettings, 'enabled'> = { targetFoodCostPct: 35, priceChangePct: 10, reorderDays: 7 }

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/**
 * Effective settings. The warnings are information, so they follow «offered ∧ enabled»
 * and not the use permission: whoever buys sees the price warning without needing inventory.
 */
export function useCostSettings(): CostSettings {
  const { feature } = useActiveKitchen()
  const state = feature('cost_controls')
  const s = state?.settings ?? {}
  return {
    enabled: Boolean(state?.available && state?.enabled),
    targetFoodCostPct: num(s.target_food_cost_pct, COST_DEFAULTS.targetFoodCostPct),
    priceChangePct: num(s.price_change_pct, COST_DEFAULTS.priceChangePct),
    reorderDays: num(s.reorder_days, COST_DEFAULTS.reorderDays),
  }
}
