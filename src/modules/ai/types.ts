export type AiFeatureKey = 'supply_reorder' | 'supply_perishables' | 'supply_slow_movers' | 'kitchen_stall_alerts' | 'kitchen_insights'

/** Funciones que generan análisis con el modelo (las alertas de Cocina son reglas fijas). */
export type AiInsightFeatureKey = Exclude<AiFeatureKey, 'kitchen_stall_alerts'>

export type AiSettings = Record<string, number | boolean>

export type InsightPriority = 'alta' | 'media' | 'baja'

export interface InsightItem {
  refId: string | null
  priority: InsightPriority
  title: string
  explanation: string
  action: string
}

export interface AiInsight {
  id: string
  featureKey: AiInsightFeatureKey
  status: 'ok' | 'empty' | 'error'
  summary: string
  items: InsightItem[]
  model: string | null
  createdAt: string
}

/** Resultado de pedir un análisis: el análisis, o por qué no hay (sin romper la pantalla). */
export type InsightResult =
  | { kind: 'ok'; insight: AiInsight; cached: boolean }
  | { kind: 'not_configured' }
  | { kind: 'disabled' }
  | { kind: 'error'; message: string }

/** Fila de dk_inventory_signals, en camelCase. */
export interface InventorySignal {
  ingredientId: string
  code: string
  name: string
  baseUnitCode: string
  primarySupplierId: string | null
  supplierName: string | null
  stockOnHand: number
  stockAvailable: number
  minStock: number
  maxStock: number | null
  avgCost: number
  stockValue: number
  consumed30d: number
  consumed7d: number
  wasted30d: number
  dailyBurn: number
  dailyBurn7d: number
  coverageDays: number | null
  belowMin: boolean
  suggestedQuantity: number
  lastConsumedAt: string | null
  daysSinceConsumption: number | null
  perishable: boolean
  shelfLifeDays: number | null
  oldestStockAt: string | null
  oldestStockQty: number | null
  estDaysToExpiry: number | null
  projectedWasteQty: number | null
  needsReorder: boolean
  perishableRisk: boolean
  slowMover: boolean
  overstock: boolean
}

export interface KitchenSignalItem {
  itemId: string
  product: string
  quantity: number
  kitchenStatus: 'PENDIENTE' | 'EN_PREPARACION' | 'LISTO'
  minutesInStatus: number
  stalled: boolean
}

export interface KitchenSignalOrder {
  orderId: string
  orderNumber: number
  status: 'CONFIRMADO' | 'EN_PREPARACION' | 'LISTO'
  priority: number
  minutesSinceCreated: number
  minutesInStatus: number
  alertMin: number
  late: boolean
  stalled: boolean
  items: KitchenSignalItem[]
}

export interface KitchenSignals {
  generatedAt: string
  ridersActive: number
  orders: KitchenSignalOrder[]
}
