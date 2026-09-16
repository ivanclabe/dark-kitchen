import { supabase } from '@/shared/lib/supabase'
import type { DayOfWeek, TodayMenuEntry, WeeklyMenuItem } from '../types'

interface WeeklyMenuItemRow {
  id: string
  product_id: string
  day_of_week: DayOfWeek
  display_order: number
  is_active: boolean
  dk_products: { name: string; price: number } | null
}

const SELECT = 'id, product_id, day_of_week, display_order, is_active, dk_products ( name, price )'

function mapRow(row: WeeklyMenuItemRow): WeeklyMenuItem {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.dk_products?.name ?? '—',
    productPrice: Number(row.dk_products?.price ?? 0),
    dayOfWeek: row.day_of_week,
    displayOrder: row.display_order,
    isActive: row.is_active,
  }
}

export async function listWeeklyMenu(day: DayOfWeek): Promise<WeeklyMenuItem[]> {
  const { data, error } = await supabase
    .from('dk_weekly_menu_items')
    .select(SELECT)
    .eq('day_of_week', day)
    .order('display_order')

  if (error) throw error
  return (data as unknown as WeeklyMenuItemRow[]).map(mapRow)
}

export async function addWeeklyMenuItem(day: DayOfWeek, productId: string, displayOrder: number): Promise<void> {
  const { error } = await supabase
    .from('dk_weekly_menu_items')
    .insert({ day_of_week: day, product_id: productId, display_order: displayOrder })
  if (error) throw error
}

export async function removeWeeklyMenuItem(id: string): Promise<void> {
  const { error } = await supabase.from('dk_weekly_menu_items').delete().eq('id', id)
  if (error) throw error
}

export async function setWeeklyMenuItemActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('dk_weekly_menu_items').update({ is_active: active }).eq('id', id)
  if (error) throw error
}

export async function setWeeklyMenuItemOrder(id: string, displayOrder: number): Promise<void> {
  const { error } = await supabase.from('dk_weekly_menu_items').update({ display_order: displayOrder }).eq('id', id)
  if (error) throw error
}

/** Reemplaza por completo la configuración de `toDay` con la de `fromDay` — RPC atómico, nunca duplica productos. */
export async function copyWeeklyMenuDay(fromDay: DayOfWeek, toDay: DayOfWeek): Promise<void> {
  const { error } = await supabase.rpc('dk_copy_weekly_menu_day', { p_from_day: fromDay, p_to_day: toDay })
  if (error) throw error
}

interface TodayMenuRow {
  product_id: string
  product: string
  price: number
  description: string | null
  category: string | null
  display_order: number
  available: true
}

/**
 * Fuente de verdad de "qué vendemos hoy" — misma vista (dk_today_menu) que
 * consumirá n8n. No confundir con el getTodayMenu() de ../api/todayMenu.ts
 * (sistema de Menú/excepciones por fecha exacta, sin relación con esto —
 * ver docs/audit/menu-semanal-n8n-integration-audit-2026-09.md sección 2).
 */
export async function getTodayMenu(): Promise<TodayMenuEntry[]> {
  const { data, error } = await supabase
    .from('dk_today_menu')
    .select('product_id, product, price, description, category, display_order, available')
    .order('display_order')
    .order('product')

  if (error) throw error

  return (data as unknown as TodayMenuRow[]).map((row) => ({
    productId: row.product_id,
    productName: row.product,
    price: Number(row.price),
    description: row.description,
    category: row.category,
    displayOrder: row.display_order,
    available: row.available,
  }))
}
