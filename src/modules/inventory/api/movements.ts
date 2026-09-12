import { supabase } from '@/shared/lib/supabase'
import type { InventoryMovement, WasteReason } from '../types'

interface MovementRow {
  id: string
  ingredient_id: string
  movement_type: InventoryMovement['movementType']
  quantity_base_unit: number
  unit_cost: number | null
  reason: WasteReason | null
  observation: string | null
  created_at: string
  dk_ingredients: { name: string } | null
}

export async function listMovements(ingredientId?: string): Promise<InventoryMovement[]> {
  let query = supabase
    .from('dk_inventory_movements')
    .select(
      'id, ingredient_id, movement_type, quantity_base_unit, unit_cost, reason, observation, created_at, dk_ingredients ( name )',
    )
    .order('created_at', { ascending: false })
    .limit(200)

  if (ingredientId) query = query.eq('ingredient_id', ingredientId)

  const { data, error } = await query
  if (error) throw error

  return (data as unknown as MovementRow[]).map((row) => ({
    id: row.id,
    ingredientId: row.ingredient_id,
    ingredientName: row.dk_ingredients?.name ?? '—',
    movementType: row.movement_type,
    quantityBaseUnit: Number(row.quantity_base_unit),
    unitCost: row.unit_cost === null ? null : Number(row.unit_cost),
    reason: row.reason,
    observation: row.observation,
    createdAt: row.created_at,
  }))
}

export async function registerWaste(
  ingredientId: string,
  quantity: number,
  reason: WasteReason,
  observation?: string,
): Promise<void> {
  const { error } = await supabase.rpc('dk_register_waste', {
    p_ingredient_id: ingredientId,
    p_quantity: quantity,
    p_reason: reason,
    p_observation: observation,
  })
  if (error) throw error
}

export async function registerAdjustment(
  ingredientId: string,
  quantity: number,
  observation?: string,
): Promise<void> {
  const { error } = await supabase.rpc('dk_register_adjustment', {
    p_ingredient_id: ingredientId,
    p_quantity: quantity,
    p_observation: observation,
  })
  if (error) throw error
}
