import { supabase } from '@/shared/lib/supabase'
import type { DashboardSummary } from '../types'

interface SummaryRow {
  sales_today: number
  sales_week: number
  sales_month: number
  orders_today: number
  orders_week: number
  orders_month: number
  avg_ticket_month: number
  inventory_value: number
  low_stock_count: number
  waste_value_month: number
  purchases_month: number
  orders_nuevo: number
  orders_confirmado: number
  orders_en_preparacion: number
  orders_listo: number
  orders_despachado: number
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const { data, error } = await supabase.rpc('dk_dashboard_summary')
  if (error) throw error

  const row = data as unknown as SummaryRow
  return {
    salesToday: Number(row.sales_today),
    salesWeek: Number(row.sales_week),
    salesMonth: Number(row.sales_month),
    ordersToday: Number(row.orders_today),
    ordersWeek: Number(row.orders_week),
    ordersMonth: Number(row.orders_month),
    avgTicketMonth: Number(row.avg_ticket_month),
    inventoryValue: Number(row.inventory_value),
    lowStockCount: Number(row.low_stock_count),
    wasteValueMonth: Number(row.waste_value_month),
    purchasesMonth: Number(row.purchases_month),
    ordersNuevo: Number(row.orders_nuevo),
    ordersConfirmado: Number(row.orders_confirmado),
    ordersEnPreparacion: Number(row.orders_en_preparacion),
    ordersListo: Number(row.orders_listo),
    ordersDespachado: Number(row.orders_despachado),
  }
}
