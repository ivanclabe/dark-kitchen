import { supabase } from '@/shared/lib/supabase'

export interface Unit {
  id: string
  code: string
  name: string
  unitType: 'WEIGHT' | 'VOLUME' | 'UNIT'
  factorToBase: number
}

export async function listUnits(): Promise<Unit[]> {
  const { data, error } = await supabase
    .from('dk_units')
    .select('id, code, name, unit_type, factor_to_base')
    .order('unit_type')
    .order('factor_to_base')

  if (error) throw error

  return data.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    unitType: row.unit_type,
    factorToBase: Number(row.factor_to_base),
  }))
}

/** ADR 0056: each ingredient's own packages («caja = 12 unidades»), for converting on screen. */
export async function listIngredientPackages(): Promise<Map<string, { unitCode: string; factor: number }[]>> {
  const { data, error } = await supabase.from('dk_ingredient_purchase_units').select('ingredient_id, factor_to_base, dk_units ( code )')
  if (error) throw error
  const byIngredient = new Map<string, { unitCode: string; factor: number }[]>()
  for (const row of (data ?? []) as unknown as { ingredient_id: string; factor_to_base: number; dk_units: { code: string } | null }[]) {
    if (!row.dk_units) continue
    byIngredient.set(row.ingredient_id, [...(byIngredient.get(row.ingredient_id) ?? []), { unitCode: row.dk_units.code, factor: Number(row.factor_to_base) }])
  }
  return byIngredient
}

/** ADR 0056: an ingredient's own package; `factor` null removes it. */
export async function setIngredientPackage(ingredientId: string, unitId: string, factor: number | null): Promise<void> {
  const { error } = await supabase.rpc('dk_ingredient_set_purchase_unit', { p_ingredient_id: ingredientId, p_unit_id: unitId, p_factor: factor as number })
  if (error) throw error
}
