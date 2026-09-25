import { supabase } from '@/shared/lib/supabase'

export interface MasterMenu {
  id: string
  name: string
  description: string | null
  active: boolean
  productCount: number
  kitchenIds: string[]
}

export interface MasterRecipeItem {
  ingredientCode: string
  ingredientName: string
  unitCode: string
  quantity: number
}

export interface MasterProduct {
  id: string
  code: string
  name: string
  description: string | null
  categoryName: string | null
  price: number
  active: boolean
  recipe: MasterRecipeItem[]
}

export interface Unit {
  code: string
  name: string
}

/** Menús maestros de una organización (ADR 0008: son de la organización y se comparten entre sus Cuentas). */
export async function listMasterMenus(organizationId: string): Promise<MasterMenu[]> {
  const { data, error } = await supabase
    .from('dk_master_menus')
    .select('id, name, description, active, dk_master_products ( id ), dk_master_menu_kitchens ( kitchen_id )')
    .eq('organization_id', organizationId)
    .order('name')
  if (error) throw error
  return data.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    active: m.active,
    productCount: m.dk_master_products?.length ?? 0,
    kitchenIds: (m.dk_master_menu_kitchens ?? []).map((k) => k.kitchen_id),
  }))
}

export async function createMasterMenu(organizationId: string, name: string, description: string): Promise<string> {
  const { data, error } = await supabase
    .from('dk_master_menus')
    .insert({ organization_id: organizationId, name: name.trim(), description: description.trim() || null })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function setMasterMenuActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('dk_master_menus').update({ active }).eq('id', id)
  if (error) throw error
}

export async function deleteMasterMenu(id: string): Promise<void> {
  const { error } = await supabase.rpc('dk_delete_master_menu', { p_menu_id: id })
  if (error) throw error
}

export async function listMasterProducts(menuId: string): Promise<MasterProduct[]> {
  const { data, error } = await supabase
    .from('dk_master_products')
    .select('id, code, name, description, category_name, price, active, sort_order, dk_master_recipe_items ( ingredient_code, ingredient_name, unit_code, quantity )')
    .eq('master_menu_id', menuId)
    .order('sort_order')
  if (error) throw error
  return data.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    categoryName: p.category_name,
    price: Number(p.price),
    active: p.active,
    recipe: (p.dk_master_recipe_items ?? []).map((r) => ({
      ingredientCode: r.ingredient_code,
      ingredientName: r.ingredient_name,
      unitCode: r.unit_code,
      quantity: Number(r.quantity),
    })),
  }))
}

export interface MasterProductInput {
  id: string | null
  code: string
  name: string
  description: string
  categoryName: string
  price: number
  active: boolean
  recipe: MasterRecipeItem[]
}

/** Guarda plato + receta y sincroniza una sola vez con las Cocinas asignadas. */
export async function saveMasterProduct(menuId: string, input: MasterProductInput): Promise<void> {
  const { error } = await supabase.rpc('dk_save_master_product', {
    p_menu_id: menuId,
    p_product_id: input.id as string,
    p_code: input.code,
    p_name: input.name,
    p_description: input.description,
    p_category: input.categoryName,
    p_price: input.price,
    p_active: input.active,
    p_recipe: input.recipe.map((r) => ({ ingredient_code: r.ingredientCode, ingredient_name: r.ingredientName, unit_code: r.unitCode, quantity: r.quantity })),
  })
  if (error) throw error
}

/** Borrar un plato del maestro: sus copias quedan como platos locales desactivados. */
export async function deleteMasterProduct(id: string): Promise<void> {
  const { error } = await supabase.from('dk_master_products').delete().eq('id', id)
  if (error) throw error
}

export async function assignMasterMenu(menuId: string, kitchenIds: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('dk_assign_master_menu', { p_menu_id: menuId, p_kitchen_ids: kitchenIds })
  if (error) throw error
  return data
}

export async function unassignMasterMenu(menuId: string, kitchenIds: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('dk_unassign_master_menu', { p_menu_id: menuId, p_kitchen_ids: kitchenIds })
  if (error) throw error
  return data
}

export async function listUnits(): Promise<Unit[]> {
  const { data, error } = await supabase.from('dk_units').select('code, name').order('code')
  if (error) throw error
  return data
}
