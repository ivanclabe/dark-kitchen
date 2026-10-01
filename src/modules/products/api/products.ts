import { supabase } from '@/shared/lib/supabase'
import { PRODUCT_IMAGES_BUCKET, prepareImage, type ProductImagePosition } from '../lib/productImages'
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

export interface ProductImage {
  id: string
  productId: string
  path: string
  position: ProductImagePosition
  width: number | null
  height: number | null
}

/** Photos of a dish (ADR 0018), main one first. */
export async function listProductImages(productId: string): Promise<ProductImage[]> {
  const { data, error } = await supabase
    .from('dk_product_images')
    .select('id, product_id, path, position, width, height')
    .eq('product_id', productId)
    .order('position')
  if (error) throw error
  return (data ?? []).map((r) => ({ id: r.id, productId: r.product_id, path: r.path, position: r.position as ProductImagePosition, width: r.width, height: r.height }))
}

/**
 * Puts a photo in a place of the dish (1 = main, 2 = second), replacing what
 * was there. The file is shrunk in the browser, uploaded under a new name
 * (so caches never show the old one) and only then recorded; the old file
 * is deleted afterwards. If recording fails, the new file is removed.
 */
export async function saveProductImage(productId: string, position: ProductImagePosition, file: File): Promise<void> {
  const prepared = await prepareImage(file)
  const { data: kitchenId, error: kitchenError } = await supabase.rpc('dk_current_kitchen_id')
  if (kitchenError) throw kitchenError
  if (!kitchenId) throw new Error('No hay una cuenta activa para guardar la foto.')
  const path = `kitchens/${kitchenId}/products/${productId}/${crypto.randomUUID()}.${prepared.extension}`

  const bucket = supabase.storage.from(PRODUCT_IMAGES_BUCKET)
  const { error: uploadError } = await bucket.upload(path, prepared.blob, { contentType: prepared.blob.type, cacheControl: '31536000', upsert: false })
  if (uploadError) throw uploadError

  try {
    const { data: current, error: currentError } = await supabase
      .from('dk_product_images')
      .select('id, path')
      .eq('product_id', productId)
      .eq('position', position)
      .maybeSingle()
    if (currentError) throw currentError
    const values = { path, width: prepared.width, height: prepared.height }
    const { error } = current
      ? await supabase.from('dk_product_images').update(values).eq('id', current.id)
      : await supabase.from('dk_product_images').insert({ product_id: productId, position, ...values })
    if (error) throw error
    if (current) await bucket.remove([current.path])
  } catch (err) {
    await bucket.remove([path])
    throw err
  }
}

/** Removes a photo; if it was the main one, the other becomes main (database trigger). */
export async function deleteProductImage(image: ProductImage): Promise<void> {
  const { error } = await supabase.from('dk_product_images').delete().eq('id', image.id)
  if (error) throw error
  // A leftover file is harmless (nothing points to it); the record is what matters.
  await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([image.path])
}

export async function setMainProductImage(imageId: string): Promise<void> {
  const { error } = await supabase.rpc('dk_set_main_product_image', { p_image_id: imageId })
  if (error) throw error
}
