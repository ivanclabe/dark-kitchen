import { supabase } from '@/shared/lib/supabase'

/**
 * Insights (ADR 0027): one aggregated query per screen, for the ACTIVE account
 * and in its time zone. The database checks reports.view; cost figures
 * (COGS, gross profit, margin) only come with reports.profitability — then
 * they are simply absent here (optional fields), never zero.
 */
export interface Kpis {
  revenue: number
  netRevenue: number
  orders: number
  units: number
  averageOrderValue: number | null
  cogs?: number
  grossProfit?: number
  grossMargin?: number | null
  estimatedCogs?: number
  costCoverage?: number | null
}

export interface DailyPoint {
  date: string
  revenue: number
  netRevenue: number
  orders: number
  cogs?: number
}

export interface ProductRow {
  id: string
  name: string
  categoryId: string | null
  categoryName: string | null
  units: number
  revenue: number
  previousRevenue: number | null
  previousUnits: number | null
  cogs?: number | null
  grossProfit?: number
  grossMargin?: number | null
  costCoverage?: number | null
  unitCost?: number | null
  previousUnitCost?: number | null
  realUnits?: number
  previousRealUnits?: number
}

export interface CategoryRow {
  id: string | null
  name: string | null
  units: number
  revenue: number
  previousRevenue: number | null
  cogs?: number | null
  grossProfit?: number
  grossMargin?: number | null
}

export interface IngredientPrice {
  id: string
  name: string
  unit: string | null
  quantity: number
  total: number
  purchases: number
  averagePrice: number | null
  previousAveragePrice: number | null
  previousPurchases: number
}

export interface InsightsData {
  timezone: string
  currency: string
  profitability: boolean
  period: { from: string; to: string }
  compare: { from: string; to: string } | null
  current: Kpis
  previous: Kpis | null
  daily: DailyPoint[]
  products: ProductRow[]
  categories: CategoryRow[]
  channels: { channel: string; orders: number; revenue: number }[]
  byWeekday: { weekday: number; orders: number; revenue: number }[]
  byHour: { hour: number; orders: number; revenue: number }[]
  purchases: {
    total: number
    previousTotal: number | null
    bySupplier: { id: string; name: string; purchases: number; total: number }[]
    ingredients: IngredientPrice[]
  }
  waste: {
    total: number
    previousTotal: number | null
    byIngredient: { id: string; name: string; unit: string | null; quantity: number; value: number }[]
  }
}

export interface InsightsQuery {
  from: string
  to: string
  compare: { from: string; to: string } | null
  categoryId: string | null
  productId: string | null
}

export async function fetchInsights(q: InsightsQuery): Promise<InsightsData> {
  const { data, error } = await supabase.rpc('dk_insights', {
    p_from: q.from,
    p_to: q.to,
    ...(q.compare ? { p_compare_from: q.compare.from, p_compare_to: q.compare.to } : {}),
    ...(q.categoryId ? { p_category: q.categoryId } : {}),
    ...(q.productId ? { p_product: q.productId } : {}),
  })
  if (error) throw error
  // jsonb numbers arrive as JSON numbers.
  return data as unknown as InsightsData
}

export interface ProductOrder {
  orderId: string
  orderNumber: number | null
  createdAt: string
  channel: string
  quantity: number
  revenue: number
  cost?: number | null
  costSource?: 'real' | 'estimated' | 'none'
}

export async function fetchProductOrders(productId: string, from: string, to: string): Promise<ProductOrder[]> {
  const { data, error } = await supabase.rpc('dk_insights_product_orders', { p_product: productId, p_from: from, p_to: to })
  if (error) throw error
  return data as unknown as ProductOrder[]
}

/** Options of the Category and Product filters (the account's catalog, RLS by account). */
export interface CatalogOptions {
  categories: { id: string; name: string }[]
  products: { id: string; name: string; categoryId: string | null }[]
}

export async function fetchCatalogOptions(): Promise<CatalogOptions> {
  const [categories, products] = await Promise.all([
    supabase.from('dk_product_categories').select('id, name').order('name'),
    supabase.from('dk_products').select('id, name, category_id').order('name'),
  ])
  if (categories.error) throw categories.error
  if (products.error) throw products.error
  return {
    categories: categories.data,
    products: products.data.map((p) => ({ id: p.id, name: p.name, categoryId: p.category_id })),
  }
}
