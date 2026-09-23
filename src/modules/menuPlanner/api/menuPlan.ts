import { supabase } from '@/shared/lib/supabase'
import type { AddMenuPlanItemInput, MenuPlanItem, MenuPlanItemRules } from '../types'

interface MenuPlanItemRow {
  id: string
  plan_date: string
  product_id: string
  display_order: number
  is_active: boolean
  start_time: string | null
  end_time: string | null
  special_price: number | null
  unit_limit: number | null
  while_supplies_last: boolean
  dk_products: { name: string; price: number; active: boolean; dk_product_categories: { name: string } | null } | null
}

const SELECT = `
  id, plan_date, product_id, display_order, is_active, start_time, end_time, special_price, unit_limit, while_supplies_last,
  dk_products ( name, price, active, dk_product_categories ( name ) )
`

function mapRow(row: MenuPlanItemRow): MenuPlanItem {
  return {
    id: row.id,
    planDate: row.plan_date,
    productId: row.product_id,
    productName: row.dk_products?.name ?? '—',
    productPrice: Number(row.dk_products?.price ?? 0),
    productCategory: row.dk_products?.dk_product_categories?.name ?? null,
    productActive: row.dk_products?.active ?? true,
    displayOrder: row.display_order,
    isActive: row.is_active,
    startTime: row.start_time,
    endTime: row.end_time,
    specialPrice: row.special_price === null ? null : Number(row.special_price),
    unitLimit: row.unit_limit,
    whileSuppliesLast: row.while_supplies_last,
  }
}

/** [startDate, endDateExclusive) — misma convención que usan los RPC de copia. */
export async function listMenuPlanRange(startDate: string, endDateExclusive: string): Promise<MenuPlanItem[]> {
  const { data, error } = await supabase
    .from('dk_menu_plan_items')
    .select(SELECT)
    .gte('plan_date', startDate)
    .lt('plan_date', endDateExclusive)
    .order('plan_date')
    .order('display_order')

  if (error) throw error
  return (data as unknown as MenuPlanItemRow[]).map(mapRow)
}

function rulesToRow(rules: Partial<MenuPlanItemRules>) {
  return {
    is_active: rules.isActive,
    start_time: rules.startTime,
    end_time: rules.endTime,
    special_price: rules.specialPrice,
    unit_limit: rules.unitLimit,
    while_supplies_last: rules.whileSuppliesLast,
  }
}

export async function addMenuPlanItem(planDate: string, input: AddMenuPlanItemInput): Promise<void> {
  const { error } = await supabase.from('dk_menu_plan_items').insert({
    plan_date: planDate,
    product_id: input.productId,
    display_order: input.displayOrder ?? 0,
    ...rulesToRow(input),
  })
  if (error) throw error
}

/**
 * Agrega el mismo plato a varias fechas de una vez — para "aplicar a un rango
 * de fechas" sin crear el plato ni la receta de nuevo. Los días que ya lo
 * tienen se saltan (ignoreDuplicates sobre el unique plan_date+product_id)
 * en vez de tumbar todo el lote. Devuelve cuántos días se agregaron de verdad.
 */
export async function addMenuPlanItemForDates(productId: string, dates: string[], displayOrder: number, rules?: Partial<MenuPlanItemRules>): Promise<number> {
  const { data, error } = await supabase
    .from('dk_menu_plan_items')
    .upsert(
      dates.map((planDate) => ({
        plan_date: planDate,
        product_id: productId,
        display_order: displayOrder,
        ...rulesToRow(rules ?? {}),
      })),
      { onConflict: 'plan_date,product_id', ignoreDuplicates: true },
    )
    .select('id')
  if (error) throw error
  return data.length
}

export async function updateMenuPlanItemRules(id: string, rules: Partial<MenuPlanItemRules>): Promise<void> {
  const { error } = await supabase.from('dk_menu_plan_items').update(rulesToRow(rules)).eq('id', id)
  if (error) throw error
}

export async function removeMenuPlanItem(id: string): Promise<void> {
  const { error } = await supabase.from('dk_menu_plan_items').delete().eq('id', id)
  if (error) throw error
}

/** Mueve un plato a otra fecha (drag entre días) — puede fallar si ese plato ya existe ese día (unique constraint). */
export async function moveMenuPlanItem(id: string, planDate: string, displayOrder: number): Promise<void> {
  const { error } = await supabase.from('dk_menu_plan_items').update({ plan_date: planDate, display_order: displayOrder }).eq('id', id)
  if (error) throw error
}

/** Reordena todos los platos de un mismo día tras un drag — un update por fila, en paralelo. */
export async function reorderMenuPlanDay(items: { id: string; displayOrder: number }[]): Promise<void> {
  const { error } = await Promise.all(
    items.map((item) => supabase.from('dk_menu_plan_items').update({ display_order: item.displayOrder }).eq('id', item.id)),
  ).then((results) => {
    const failed = results.find((r) => r.error)
    return failed ?? { error: null }
  })
  if (error) throw error
}

/** p_days=1 copia un día puntual, p_days=7 copia una semana completa — reemplaza el destino por completo. */
export async function copyMenuPlanRange(fromDate: string, toDate: string, days: number): Promise<void> {
  const { error } = await supabase.rpc('dk_copy_menu_plan_range', { p_from_date: fromDate, p_to_date: toDate, p_days: days })
  if (error) throw error
}
