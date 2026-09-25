import { supabase } from '@/shared/lib/supabase'
import type {
  AiInsight,
  AiInsightFeatureKey,
  InsightItem,
  InsightResult,
  InventorySignal,
  KitchenSignalOrder,
  KitchenSignals,
} from '../types'

const FUNCTION_NAME = 'dk-ai-insights'

/** ¿Está cargado el secreto de la IA? La Edge Function responde sin exponer la clave. */
export async function getAiConnectionStatus(): Promise<{ configured: boolean }> {
  const { data, error } = await supabase.functions.invoke<{ configured: boolean }>(FUNCTION_NAME, { body: { action: 'status' } })
  if (error) throw error
  return { configured: Boolean(data?.configured) }
}

interface InsightRow {
  id: string
  feature_key: string
  status: 'ok' | 'empty' | 'error'
  output: { summary?: string; items?: { ref_id: string | null; priority: InsightItem['priority']; title: string; explanation: string; action: string }[] } | null
  model: string | null
  created_at: string
}

function mapInsight(row: InsightRow): AiInsight {
  return {
    id: row.id,
    featureKey: row.feature_key as AiInsightFeatureKey,
    status: row.status,
    summary: row.output?.summary ?? '',
    items: (row.output?.items ?? []).map((i) => ({ refId: i.ref_id, priority: i.priority, title: i.title, explanation: i.explanation, action: i.action })),
    model: row.model,
    createdAt: row.created_at,
  }
}

/**
 * Pide el análisis de una función. La Edge Function decide si reutiliza el
 * último (según la frecuencia configurada) o llama al modelo; `force` salta
 * esa espera. Los errores esperables (sin clave, desactivada) se devuelven
 * como resultado, no como excepción: la pantalla sigue funcionando con las
 * señales determinísticas.
 */
export async function requestInsight(feature: AiInsightFeatureKey, force = false): Promise<InsightResult> {
  const { data, error } = await supabase.functions.invoke<{ insight: InsightRow; cached: boolean }>(FUNCTION_NAME, { body: { feature, force } })
  if (error) {
    let body: { error?: string; message?: string } = {}
    const context = (error as { context?: Response }).context
    if (context && typeof context.json === 'function') body = await context.json().catch(() => ({}))
    if (body.error === 'AI_NOT_CONFIGURED') return { kind: 'not_configured' }
    if (body.error === 'FEATURE_DISABLED') return { kind: 'disabled' }
    return { kind: 'error', message: body.message ?? body.error ?? error.message }
  }
  if (!data?.insight) return { kind: 'error', message: 'Respuesta vacía del servicio de IA.' }
  return { kind: 'ok', insight: mapInsight(data.insight), cached: data.cached }
}

/** Último análisis guardado de una función (para mostrar la fecha en Configuración). */
export async function getLatestInsight(feature: AiInsightFeatureKey): Promise<AiInsight | null> {
  const { data, error } = await supabase
    .from('dk_ai_insights')
    .select('id, feature_key, status, output, model, created_at')
    .eq('feature_key', feature)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? mapInsight(data as unknown as InsightRow) : null
}

export async function listInventorySignals(params: { coverageDays: number; warningDays: number; slowDays: number; overstockDays: number }): Promise<InventorySignal[]> {
  const { data, error } = await supabase.rpc('dk_inventory_signals', {
    p_coverage_days: params.coverageDays,
    p_warning_days: params.warningDays,
    p_slow_days: params.slowDays,
    p_overstock_days: params.overstockDays,
  })
  if (error) throw error
  return data.map((r) => ({
    ingredientId: r.ingredient_id,
    code: r.code,
    name: r.name,
    baseUnitCode: r.base_unit_code,
    primarySupplierId: r.primary_supplier_id,
    supplierName: r.supplier_name,
    stockOnHand: Number(r.stock_on_hand),
    stockAvailable: Number(r.stock_available),
    minStock: Number(r.min_stock),
    maxStock: r.max_stock === null ? null : Number(r.max_stock),
    avgCost: Number(r.avg_cost),
    stockValue: Number(r.stock_value),
    consumed30d: Number(r.consumed_30d),
    consumed7d: Number(r.consumed_7d),
    wasted30d: Number(r.wasted_30d),
    dailyBurn: Number(r.daily_burn),
    dailyBurn7d: Number(r.daily_burn_7d),
    coverageDays: r.coverage_days === null ? null : Number(r.coverage_days),
    belowMin: r.below_min,
    suggestedQuantity: Number(r.suggested_quantity),
    lastConsumedAt: r.last_consumed_at,
    daysSinceConsumption: r.days_since_consumption,
    perishable: r.perishable,
    shelfLifeDays: r.shelf_life_days,
    oldestStockAt: r.oldest_stock_at,
    oldestStockQty: r.oldest_stock_qty === null ? null : Number(r.oldest_stock_qty),
    estDaysToExpiry: r.est_days_to_expiry === null ? null : Number(r.est_days_to_expiry),
    projectedWasteQty: r.projected_waste_qty === null ? null : Number(r.projected_waste_qty),
    needsReorder: r.needs_reorder,
    perishableRisk: r.perishable_risk,
    slowMover: r.slow_mover,
    overstock: r.overstock,
  }))
}

interface KitchenSignalsRow {
  generated_at: string
  riders_active: number
  orders: {
    order_id: string
    order_number: number
    status: KitchenSignalOrder['status']
    priority: number
    minutes_since_created: number
    minutes_in_status: number
    alert_min: number
    late: boolean
    stalled: boolean
    items: { item_id: string; product: string; quantity: number; kitchen_status: KitchenSignalOrder['items'][number]['kitchenStatus']; minutes_in_status: number; stalled: boolean }[]
  }[]
}

export async function getKitchenSignals(dishStallMin: number): Promise<KitchenSignals> {
  const { data, error } = await supabase.rpc('dk_kitchen_signals', { p_dish_stall_min: dishStallMin })
  if (error) throw error
  const row = data as unknown as KitchenSignalsRow
  return {
    generatedAt: row.generated_at,
    ridersActive: row.riders_active,
    orders: (row.orders ?? []).map((o) => ({
      orderId: o.order_id,
      orderNumber: o.order_number,
      status: o.status,
      priority: o.priority,
      minutesSinceCreated: o.minutes_since_created,
      minutesInStatus: o.minutes_in_status,
      alertMin: o.alert_min,
      late: o.late,
      stalled: o.stalled,
      items: (o.items ?? []).map((i) => ({
        itemId: i.item_id,
        product: i.product,
        quantity: i.quantity,
        kitchenStatus: i.kitchen_status,
        minutesInStatus: i.minutes_in_status,
        stalled: i.stalled,
      })),
    })),
  }
}
