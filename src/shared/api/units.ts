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
