import { supabase } from '@/shared/lib/supabase'
import type { SupplySuggestion } from '../types'

interface SuggestionRow {
  ingredient_id: string
  code: string
  name: string
  base_unit_code: string
  primary_supplier_id: string | null
  supplier_name: string | null
  stock_available: number
  min_stock: number
  max_stock: number | null
  avg_cost: number
  consumed_30d: number
  wasted_30d: number
  daily_burn: number
  coverage_days: number | null
  below_min: boolean
  suggested_quantity: number
}

/**
 * Lee dk_supply_suggestions: ritmo de consumo real (30 días), días de
 * cobertura y cantidad sugerida por insumo. La vista solo expone hechos —
 * el umbral de "cobertura corta" lo decide la UI (ver lib/stock.ts).
 */
export async function listSupplySuggestions(): Promise<SupplySuggestion[]> {
  const { data, error } = await supabase
    .from('dk_supply_suggestions')
    .select(
      'ingredient_id, code, name, base_unit_code, primary_supplier_id, supplier_name, stock_available, min_stock, max_stock, avg_cost, consumed_30d, wasted_30d, daily_burn, coverage_days, below_min, suggested_quantity',
    )
    .order('name')

  if (error) throw error
  return (data as unknown as SuggestionRow[]).map((row) => ({
    ingredientId: row.ingredient_id,
    code: row.code,
    name: row.name,
    baseUnitCode: row.base_unit_code,
    primarySupplierId: row.primary_supplier_id,
    supplierName: row.supplier_name,
    stockAvailable: Number(row.stock_available),
    minStock: Number(row.min_stock),
    maxStock: row.max_stock === null ? null : Number(row.max_stock),
    avgCost: Number(row.avg_cost),
    consumed30d: Number(row.consumed_30d),
    wasted30d: Number(row.wasted_30d),
    dailyBurn: Number(row.daily_burn),
    coverageDays: row.coverage_days === null ? null : Number(row.coverage_days),
    belowMin: row.below_min,
    suggestedQuantity: Number(row.suggested_quantity),
  }))
}
