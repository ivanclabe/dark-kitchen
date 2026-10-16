import { supabase } from '@/shared/lib/supabase'

/** ADR 0063 (D5): a physical count. Lines keep what the system said when it started and what was counted. */
export interface StockCount {
  id: string
  status: 'open' | 'applied' | 'cancelled'
  scope: string
  createdAt: string
  appliedAt: string | null
}

export interface StockCountLine {
  id: string
  ingredientId: string
  systemQty: number
  countedQty: number | null
  countedUnitId: string | null
  countedBaseQty: number | null
  difference: number | null
}

export interface StockCountResult {
  adjusted: number
  value: number
  counted: number
}

function mapCount(r: { id: string; status: string; scope: string; created_at: string; applied_at: string | null }): StockCount {
  return { id: r.id, status: r.status as StockCount['status'], scope: r.scope, createdAt: r.created_at, appliedAt: r.applied_at }
}

/** The open count (one at a time) or null. */
export async function getOpenCount(): Promise<StockCount | null> {
  const { data, error } = await supabase.from('dk_stock_counts').select('id, status, scope, created_at, applied_at').eq('status', 'open').maybeSingle()
  if (error) throw error
  return data ? mapCount(data) : null
}

/** The last applied or discarded counts. */
export async function listRecentCounts(limit = 5): Promise<StockCount[]> {
  const { data, error } = await supabase
    .from('dk_stock_counts')
    .select('id, status, scope, created_at, applied_at')
    .neq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data.map(mapCount)
}

export async function listCountLines(countId: string): Promise<StockCountLine[]> {
  const { data, error } = await supabase
    .from('dk_stock_count_lines')
    .select('id, ingredient_id, system_qty, counted_qty, counted_unit_id, counted_base_qty, difference')
    .eq('count_id', countId)
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    ingredientId: r.ingredient_id,
    systemQty: Number(r.system_qty),
    countedQty: r.counted_qty === null ? null : Number(r.counted_qty),
    countedUnitId: r.counted_unit_id,
    countedBaseQty: r.counted_base_qty === null ? null : Number(r.counted_base_qty),
    difference: r.difference === null ? null : Number(r.difference),
  }))
}

export async function startCount(scope: { categoryId?: string | null; supplierId?: string | null }): Promise<string> {
  const { data, error } = await supabase.rpc('dk_stock_count_start', {
    ...(scope.categoryId ? { p_category_id: scope.categoryId } : {}),
    ...(scope.supplierId ? { p_supplier_id: scope.supplierId } : {}),
  })
  if (error) throw error
  return data as string
}

/** What was counted in a line (null clears it); any unit of the ingredient. */
export async function setCountLine(lineId: string, quantity: number | null, unitId: string | null): Promise<void> {
  const { error } = await supabase.rpc('dk_stock_count_set', {
    p_line_id: lineId,
    p_quantity: quantity as number,
    ...(unitId ? { p_unit_id: unitId } : {}),
  })
  if (error) throw error
}

export async function applyCount(countId: string): Promise<StockCountResult> {
  const { data, error } = await supabase.rpc('dk_stock_count_apply', { p_count_id: countId })
  if (error) throw error
  const r = data as unknown as StockCountResult
  return { adjusted: Number(r.adjusted), value: Number(r.value), counted: Number(r.counted) }
}

export async function cancelCount(countId: string): Promise<void> {
  const { error } = await supabase.rpc('dk_stock_count_cancel', { p_count_id: countId })
  if (error) throw error
}
