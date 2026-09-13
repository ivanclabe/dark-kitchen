export interface SalesByDay {
  day: string
  orderCount: number
  total: number
}

export interface TopProduct {
  productId: string
  productName: string
  qtySold: number
  revenue: number
  estimatedCost: number
  margin: number
}

export interface SupplierPurchase {
  supplierId: string
  supplierName: string
  purchaseCount: number
  total: number
}

export interface TopIngredientPurchased {
  ingredientId: string
  ingredientName: string
  quantity: number
  totalCost: number
}

export interface WasteReportRow {
  ingredientId: string
  ingredientName: string
  quantity: number
  estimatedValue: number
}

export interface Profitability {
  revenue: number
  cogs: number
  grossMargin: number
}
