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
