import { supabase } from '@/shared/lib/supabase'
import type { ActiveRecipe, RecipeItemDraft } from '../types'

interface RecipeItemRow {
  ingredient_id: string
  quantity: number
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
    .select('ingredient_id, quantity, dk_ingredients ( name, dk_units ( code ) )')
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
    })),
  }
}

export interface DishUsingIngredient {
  productId: string
  productName: string
  active: boolean
  /** How much of the ingredient the dish takes (base unit). */
  quantity: number
}

/**
 * The dishes whose ACTIVE recipe uses this ingredient (ADR 0031: from the
 * stock back to the menu). Old recipe versions do not count.
 */
export async function listDishesUsingIngredient(ingredientId: string): Promise<DishUsingIngredient[]> {
  const { data: items, error: itemsError } = await supabase.from('dk_recipe_items').select('recipe_id, quantity').eq('ingredient_id', ingredientId)
  if (itemsError) throw itemsError
  const quantityByRecipe = new Map((items ?? []).map((i) => [i.recipe_id as string, Number(i.quantity)]))
  if (quantityByRecipe.size === 0) return []
  const { data: products, error } = await supabase
    .from('dk_products')
    .select('id, name, active, active_recipe_id')
    .in('active_recipe_id', [...quantityByRecipe.keys()])
    .order('name')
  if (error) throw error
  return (products ?? []).map((p) => ({ productId: p.id, productName: p.name, active: p.active, quantity: quantityByRecipe.get(p.active_recipe_id as string) ?? 0 }))
}

export async function createRecipeVersion(productId: string, items: RecipeItemDraft[]): Promise<void> {
  const { error } = await supabase.rpc('dk_create_recipe_version', {
    p_product_id: productId,
    p_items: items.map((i) => ({ ingredient_id: i.ingredientId, quantity: i.quantity })),
  })
  if (error) throw error
}
