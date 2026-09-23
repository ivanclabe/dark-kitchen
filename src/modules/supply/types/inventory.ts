export interface IngredientCategory {
  id: string
  name: string
}

export interface Ingredient {
  id: string
  code: string
  name: string
  description: string | null
  categoryId: string | null
  categoryName: string | null
  baseUnitId: string
  baseUnitCode: string
  primarySupplierId: string | null
  primarySupplierName: string | null
  minStock: number
  maxStock: number | null
  avgCost: number
  perishable: boolean
  shelfLifeDays: number | null
  active: boolean
  stockOnHand: number
  stockAvailable: number
}

export interface IngredientInput {
  code: string
  name: string
  description?: string | null
  categoryId?: string | null
  baseUnitId: string
  primarySupplierId?: string | null
  minStock: number
  maxStock?: number | null
  perishable: boolean
  shelfLifeDays?: number | null
}

export type WasteReason = 'VENCIMIENTO' | 'DANO' | 'ERROR_PREPARACION' | 'OTRO'

export interface InventoryMovement {
  id: string
  ingredientId: string
  ingredientName: string
  movementType: 'COMPRA' | 'MERMA' | 'AJUSTE' | 'CONSUMO' | 'DEVOLUCION'
  quantityBaseUnit: number
  unitCost: number | null
  reason: WasteReason | null
  observation: string | null
  createdAt: string
}

/** Una fila de dk_supply_suggestions — hechos de reposición por insumo (ver migración dk_supply_suggestions). */
export interface SupplySuggestion {
  ingredientId: string
  code: string
  name: string
  baseUnitCode: string
  primarySupplierId: string | null
  supplierName: string | null
  stockAvailable: number
  minStock: number
  maxStock: number | null
  avgCost: number
  /** Consumo de cocina en los últimos 30 días (no incluye merma). */
  consumed30d: number
  wasted30d: number
  /** consumed30d / 30 — ritmo diario de consumo. */
  dailyBurn: number
  /** Días que alcanza el stock a ese ritmo. null = no hubo consumo en el período. */
  coverageDays: number | null
  belowMin: boolean
  suggestedQuantity: number
}
