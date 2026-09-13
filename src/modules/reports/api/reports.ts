import { supabase } from '@/shared/lib/supabase'
import type { Profitability, SalesByDay, SupplierPurchase, TopIngredientPurchased, TopProduct, WasteReportRow } from '../types'

export async function getSalesByDay(from: string, to: string): Promise<SalesByDay[]> {
  const { data, error } = await supabase.rpc('dk_report_sales_by_day', { p_from: from, p_to: to })
  if (error) throw error
  return data.map((row) => ({ day: row.day, orderCount: Number(row.order_count), total: Number(row.total) }))
}

export async function getTopProducts(from: string, to: string): Promise<TopProduct[]> {
  const { data, error } = await supabase.rpc('dk_report_top_products', { p_from: from, p_to: to })
  if (error) throw error
  return data.map((row) => ({
    productId: row.product_id,
    productName: row.product_name,
    qtySold: Number(row.qty_sold),
    revenue: Number(row.revenue),
    estimatedCost: Number(row.estimated_cost),
    margin: Number(row.margin),
  }))
}

export async function getPurchasesBySupplier(from: string, to: string): Promise<SupplierPurchase[]> {
  const { data, error } = await supabase.rpc('dk_report_purchases_by_supplier', { p_from: from, p_to: to })
  if (error) throw error
  return data.map((row) => ({
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    purchaseCount: Number(row.purchase_count),
    total: Number(row.total),
  }))
}

export async function getTopIngredientsPurchased(from: string, to: string): Promise<TopIngredientPurchased[]> {
  const { data, error } = await supabase.rpc('dk_report_top_ingredients_purchased', { p_from: from, p_to: to })
  if (error) throw error
  return data.map((row) => ({
    ingredientId: row.ingredient_id,
    ingredientName: row.ingredient_name,
    quantity: Number(row.quantity),
    totalCost: Number(row.total_cost),
  }))
}

export async function getWasteReport(from: string, to: string): Promise<WasteReportRow[]> {
  const { data, error } = await supabase.rpc('dk_report_waste', { p_from: from, p_to: to })
  if (error) throw error
  return data.map((row) => ({
    ingredientId: row.ingredient_id,
    ingredientName: row.ingredient_name,
    quantity: Number(row.quantity),
    estimatedValue: Number(row.estimated_value),
  }))
}

export async function getProfitability(from: string, to: string): Promise<Profitability> {
  const { data, error } = await supabase.rpc('dk_report_profitability', { p_from: from, p_to: to })
  if (error) throw error
  const row = data[0]
  return { revenue: Number(row.revenue), cogs: Number(row.cogs), grossMargin: Number(row.gross_margin) }
}
