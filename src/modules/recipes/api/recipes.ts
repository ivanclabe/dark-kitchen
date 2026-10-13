import { supabase } from '@/shared/lib/supabase'
import type { ActiveRecipe, RecipeItemDraft } from '../types'

interface RecipeItemRow {
  ingredient_id: string
  quantity: number
  unit_quantity: number | null
  unit: { code: string } | null
  dk_ingredients: { name: string; dk_units: { code: string } | null } | null
}

export async function getActiveRecipe(productId: string): Promise<ActiveRecipe | null> {
  const { data: product, error: productError } = await supabase
    .from('dk_products')
    .select('active_recipe_id, dk_recipes!dk_products_active_recipe_fkey ( id, version )')
    .eq('id', productId)
    .single()

  if (productError) throw productError

  const recipe = product.dk_recipes as unknown as { id: string; version: number } | null
  if (!recipe) return null

  const { data: items, error: itemsError } = await supabase
    .from('dk_recipe_items')
    .select('ingredient_id, quantity, unit_quantity, unit:dk_units ( code ), dk_ingredients ( name, dk_units ( code ) )')
    .eq('recipe_id', recipe.id)

  if (itemsError) throw itemsError

  return {
    recipeId: recipe.id,
    version: recipe.version,
    items: (items as unknown as RecipeItemRow[]).map((row) => ({
      ingredientId: row.ingredient_id,
      ingredientName: row.dk_ingredients?.name ?? '—',
      baseUnitCode: row.dk_ingredients?.dk_units?.code ?? '',
      quantity: Number(row.quantity),
      unitCode: row.unit?.code ?? null,
      unitQuantity: row.unit_quantity === null ? null : Number(row.unit_quantity),
    })),
  }
}

export async function createRecipeVersion(productId: string, items: RecipeItemDraft[]): Promise<void> {
  const { error } = await supabase.rpc('dk_create_recipe_version', {
    p_product_id: productId,
    p_items: items.map((i) => ({ ingredient_id: i.ingredientId, quantity: i.quantity, unit_id: i.unitId ?? null })),
  })
  if (error) throw error
}
