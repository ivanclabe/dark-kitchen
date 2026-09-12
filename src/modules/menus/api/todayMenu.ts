import { supabase } from '@/shared/lib/supabase'
import type { TodayMenuItem } from '../types'

interface Row {
  id: string
  menu_id: string
  product_id: string
  active: boolean
  special_price: number | null
  start_time: string | null
  end_time: string | null
  dk_menus: { name: string; active: boolean } | null
  dk_products: { name: string; price: number } | null
}

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

function isWithinSchedule(startTime: string | null, endTime: string | null): boolean {
  if (!startTime && !endTime) return true
  const now = new Date().toTimeString().slice(0, 8)
  if (startTime && now < startTime) return false
  if (endTime && now > endTime) return false
  return true
}

export async function getTodayMenu(): Promise<TodayMenuItem[]> {
  const date = todayDateString()

  const { data: items, error: itemsError } = await supabase
    .from('dk_menu_items')
    .select(
      'id, menu_id, product_id, active, special_price, start_time, end_time, dk_menus ( name, active ), dk_products ( name, price )',
    )

  if (itemsError) throw itemsError

  const { data: overrides, error: overridesError } = await supabase
    .from('dk_daily_availability')
    .select('id, menu_item_id, available, special_price')
    .eq('menu_date', date)

  if (overridesError) throw overridesError

  const overrideByItem = new Map(overrides.map((o) => [o.menu_item_id, o]))

  return (items as unknown as Row[])
    .filter((row) => row.active && row.dk_menus?.active)
    .map((row) => {
      const override = overrideByItem.get(row.id)
      const withinSchedule = isWithinSchedule(row.start_time, row.end_time)
      const available = override ? override.available : true
      const price =
        override?.special_price != null
          ? Number(override.special_price)
          : (row.special_price ?? row.dk_products?.price ?? 0)

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
        menuName: row.dk_menus?.name ?? '—',
        effectiveAvailable: available && withinSchedule,
        effectivePrice: Number(price),
        dailyOverrideId: override?.id ?? null,
      }
    })
}

export async function setTodayAvailability(menuItemId: string, available: boolean): Promise<void> {
  const { error } = await supabase
    .from('dk_daily_availability')
    .upsert(
      { menu_item_id: menuItemId, menu_date: todayDateString(), available },
      { onConflict: 'menu_item_id,menu_date' },
    )
  if (error) throw error
}
