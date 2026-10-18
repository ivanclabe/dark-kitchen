import { supabase } from '@/shared/lib/supabase'
import type { Ingredient, IngredientInput } from '../types'

const SELECT = `
  id, code, name, description, category_id, base_unit_id, primary_supplier_id,
  min_stock, max_stock, avg_cost, perishable, shelf_life_days, active, is_preparation,
  dk_ingredient_categories ( name ),
  dk_units ( code ),
  dk_suppliers ( name ),
  dk_ingredient_stock ( stock_on_hand, stock_available )
`

interface IngredientRow {
  id: string
  code: string
  name: string
  description: string | null
  category_id: string | null
  base_unit_id: string
  primary_supplier_id: string | null
  min_stock: number
  max_stock: number | null
  avg_cost: number
  perishable: boolean
  shelf_life_days: number | null
  active: boolean
  is_preparation: boolean
  dk_ingredient_categories: { name: string } | null
  dk_units: { code: string } | null
  dk_suppliers: { name: string } | null
  // One row per ingredient; newer PostgREST versions return a one-to-one embed as a list.
  dk_ingredient_stock: { stock_on_hand: number; stock_available: number } | { stock_on_hand: number; stock_available: number }[] | null
}

function mapRow(row: IngredientRow): Ingredient {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    categoryId: row.category_id,
    categoryName: row.dk_ingredient_categories?.name ?? null,
    baseUnitId: row.base_unit_id,
    baseUnitCode: row.dk_units?.code ?? '',
    primarySupplierId: row.primary_supplier_id,
    primarySupplierName: row.dk_suppliers?.name ?? null,
    minStock: Number(row.min_stock),
    maxStock: row.max_stock === null ? null : Number(row.max_stock),
    avgCost: Number(row.avg_cost),
    perishable: row.perishable,
    shelfLifeDays: row.shelf_life_days,
    active: row.active,
    isPreparation: Boolean(row.is_preparation),
    stockOnHand: Number(stockOf(row)?.stock_on_hand ?? 0),
    stockAvailable: Number(stockOf(row)?.stock_available ?? 0),
  }
}

function stockOf(row: IngredientRow) {
  return Array.isArray(row.dk_ingredient_stock) ? (row.dk_ingredient_stock[0] ?? null) : row.dk_ingredient_stock
}

export async function listIngredients(): Promise<Ingredient[]> {
  const { data, error } = await supabase
    .from('dk_ingredients')
    .select(SELECT)
    .order('name')

  if (error) throw error
  return (data as unknown as IngredientRow[]).map(mapRow)
}

/**
 * ADR 0069: every ingredient is created by dk_create_ingredient — from the inventory, a purchase or a recipe. It
 * starts at zero stock (no movement), with a real base unit, and a name the account does not have yet (an empty
 * code is generated).
 */
export async function createIngredient(input: IngredientInput): Promise<Ingredient> {
  const { data: id, error } = await supabase.rpc('dk_create_ingredient', {
    p_name: input.name,
    p_base_unit_id: input.baseUnitId,
    p_code: input.code?.trim() || undefined,
    p_category_id: input.categoryId ?? undefined,
    p_min_stock: input.minStock,
    p_max_stock: input.maxStock ?? undefined,
    p_description: input.description ?? undefined,
    p_primary_supplier_id: input.primarySupplierId ?? undefined,
    p_perishable: input.perishable,
    p_shelf_life_days: input.shelfLifeDays ?? undefined,
  })
  if (error) throw error
  const { data, error: readError } = await supabase.from('dk_ingredients').select(SELECT).eq('id', id as string).single()
  if (readError) throw readError
  return mapRow(data as unknown as IngredientRow)
}

/** The ingredient that already has that name, when dk_create_ingredient refused a duplicate (its id is in the detail). */
export function duplicateIngredientId(err: unknown): string | null {
  if (typeof err !== 'object' || err === null) return null
  const { hint, details } = err as { hint?: unknown; details?: unknown }
  return hint === 'duplicate_ingredient' && typeof details === 'string' && details ? details : null
}

export async function updateIngredient(id: string, input: IngredientInput): Promise<void> {
  const { error } = await supabase
    .from('dk_ingredients')
    .update({
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      category_id: input.categoryId ?? null,
      base_unit_id: input.baseUnitId,
      primary_supplier_id: input.primarySupplierId ?? null,
      min_stock: input.minStock,
      max_stock: input.maxStock ?? null,
      perishable: input.perishable,
      shelf_life_days: input.shelfLifeDays ?? null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function setIngredientActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('dk_ingredients').update({ active }).eq('id', id)
  if (error) throw error
}
