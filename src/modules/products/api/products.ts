import { supabase } from '@/shared/lib/supabase'
import { kitchenFilePath } from '@/shared/lib/kitchenFiles'
import type { Product, ProductCategory, ProductInput } from '../types'

interface ProductRow {
  id: string
  code: string | null
  name: string
  description: string | null
  category_id: string | null
  price: number
  image_path: string | null
  active_recipe_id: string | null
  estimated_cost: number
  active: boolean
  master_product_id: string | null
  price_is_local: boolean
  dk_product_categories: { name: string } | null
  dk_recipes: { version: number } | null
}

const SELECT = `
  id, code, name, description, category_id, price, image_path, active_recipe_id, estimated_cost, active, master_product_id, price_is_local,
  dk_product_categories ( name ),
  dk_recipes!dk_products_active_recipe_fkey ( version )
`

function mapRow(row: ProductRow): Product {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    categoryId: row.category_id,
    categoryName: row.dk_product_categories?.name ?? null,
    price: Number(row.price),
    imagePath: row.image_path,
    activeRecipeId: row.active_recipe_id,
    activeRecipeVersion: row.dk_recipes?.version ?? null,
    estimatedCost: Number(row.estimated_cost),
    active: row.active,
    masterProductId: row.master_product_id,
    priceIsLocal: row.price_is_local,
  }
}

export async function listProducts(): Promise<Product[]> {
  const { data, error } = await supabase.from('dk_products').select(SELECT).order('name')
  if (error) throw error
  return (data as unknown as ProductRow[]).map(mapRow)
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const { data, error } = await supabase
    .from('dk_products')
    .insert({
      code: input.code || null,
      name: input.name,
      description: input.description ?? null,
      category_id: input.categoryId ?? null,
      price: input.price,
    })
    .select(SELECT)
    .single()

  if (error) throw error
  return mapRow(data as unknown as ProductRow)
}

export async function updateProduct(id: string, input: ProductInput): Promise<void> {
  const { error } = await supabase
    .from('dk_products')
    .update({
      code: input.code || null,
      name: input.name,
      description: input.description ?? null,
      category_id: input.categoryId ?? null,
      price: input.price,
    })
    .eq('id', id)
  if (error) throw error
}

/** Plato de menú maestro: la Cocina solo cambia el precio (queda como precio propio). */
export async function updateProductPrice(id: string, price: number): Promise<void> {
  const { error } = await supabase.from('dk_products').update({ price }).eq('id', id)
  if (error) throw error
}

/** Plato de menú maestro: volver al precio del maestro (lo resuelve la base). */
export async function resetProductPrice(id: string): Promise<void> {
  const { error } = await supabase.from('dk_products').update({ price_is_local: false }).eq('id', id)
  if (error) throw error
}

export async function setProductActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('dk_products').update({ active }).eq('id', id)
  if (error) throw error
}

export async function listProductCategories(): Promise<ProductCategory[]> {
  const { data, error } = await supabase.from('dk_product_categories').select('id, name').order('name')
  if (error) throw error
  return data
}

export async function createProductCategory(name: string): Promise<ProductCategory> {
  const { data, error } = await supabase
    .from('dk_product_categories')
    .insert({ name })
    .select('id, name')
    .single()
  if (error) throw error
  return data
}

export async function uploadProductImage(productId: string, file: File): Promise<void> {
  const path = await kitchenFilePath('products', productId, file.name)
  const { error: uploadError } = await supabase.storage.from('dk-attachments').upload(path, file)
  if (uploadError) throw uploadError

  const { error: updateError } = await supabase.from('dk_products').update({ image_path: path }).eq('id', productId)
  if (updateError) throw updateError
}

export async function getProductImageUrl(imagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('dk-attachments').createSignedUrl(imagePath, 60 * 5)
  if (error) throw error
  return data.signedUrl
}
