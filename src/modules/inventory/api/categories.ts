import { supabase } from '@/shared/lib/supabase'
import type { IngredientCategory } from '../types'

export async function listCategories(): Promise<IngredientCategory[]> {
  const { data, error } = await supabase.from('dk_ingredient_categories').select('id, name').order('name')
  if (error) throw error
  return data
}

export async function createCategory(name: string): Promise<IngredientCategory> {
  const { data, error } = await supabase
    .from('dk_ingredient_categories')
    .insert({ name })
    .select('id, name')
    .single()
  if (error) throw error
  return data
}
