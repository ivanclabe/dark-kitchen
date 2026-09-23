import { supabase } from '@/shared/lib/supabase'
import type { Ingredient, IngredientInput } from '../types'

const SELECT = `
  id, code, name, description, category_id, base_unit_id, primary_supplier_id,
  min_stock, max_stock, avg_cost, perishable, shelf_life_days, active,
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
  dk_ingredient_categories: { name: string } | null
  dk_units: { code: string } | null
  dk_suppliers: { name: string } | null
  dk_ingredient_stock: { stock_on_hand: number; stock_available: number } | null
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
    stockOnHand: Number(row.dk_ingredient_stock?.stock_on_hand ?? 0),
    stockAvailable: Number(row.dk_ingredient_stock?.stock_available ?? 0),
  }
}

export async function listIngredients(): Promise<Ingredient[]> {
  const { data, error } = await supabase
    .from('dk_ingredients')
    .select(SELECT)
    .order('name')

  if (error) throw error
  return (data as unknown as IngredientRow[]).map(mapRow)
}

export async function createIngredient(input: IngredientInput): Promise<Ingredient> {
  const { data, error } = await supabase
    .from('dk_ingredients')
    .insert({
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
    .select(SELECT)
    .single()
  if (error) throw error
  return mapRow(data as unknown as IngredientRow)
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
