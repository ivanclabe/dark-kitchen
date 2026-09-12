import { supabase } from '@/shared/lib/supabase'
import type { MenuItem, MenuItemInput } from '../types'

interface MenuItemRow {
  id: string
  menu_id: string
  product_id: string
  active: boolean
  special_price: number | null
  start_time: string | null
  end_time: string | null
  dk_products: { name: string; price: number } | null
}

function mapRow(row: MenuItemRow): MenuItem {
  return {
    id: row.id,
    menuId: row.menu_id,
    productId: row.product_id,
    productName: row.dk_products?.name ?? '—',
    productPrice: Number(row.dk_products?.price ?? 0),
    active: row.active,
    specialPrice: row.special_price === null ? null : Number(row.special_price),
    startTime: row.start_time,
    endTime: row.end_time,
  }
}

const SELECT = 'id, menu_id, product_id, active, special_price, start_time, end_time, dk_products ( name, price )'

export async function listMenuItems(menuId: string): Promise<MenuItem[]> {
  const { data, error } = await supabase.from('dk_menu_items').select(SELECT).eq('menu_id', menuId)
  if (error) throw error
  return (data as unknown as MenuItemRow[]).map(mapRow)
}

export async function addMenuItem(menuId: string, input: MenuItemInput): Promise<void> {
  const { error } = await supabase.from('dk_menu_items').insert({
    menu_id: menuId,
    product_id: input.productId,
    special_price: input.specialPrice ?? null,
    start_time: input.startTime || null,
    end_time: input.endTime || null,
  })
  if (error) throw error
}

export async function updateMenuItem(id: string, input: MenuItemInput): Promise<void> {
  const { error } = await supabase
    .from('dk_menu_items')
    .update({
      special_price: input.specialPrice ?? null,
      start_time: input.startTime || null,
      end_time: input.endTime || null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function setMenuItemActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('dk_menu_items').update({ active }).eq('id', id)
  if (error) throw error
}

export async function removeMenuItem(id: string): Promise<void> {
  const { error } = await supabase.from('dk_menu_items').delete().eq('id', id)
  if (error) throw error
}
