export type PurchaseStatus = 'BORRADOR' | 'CONFIRMADA' | 'ANULADA'

export interface Purchase {
  id: string
  supplierId: string
  supplierName: string
  invoiceNumber: string
  invoiceDate: string
  status: PurchaseStatus
  subtotal: number
  tax: number
  total: number
  notes: string | null
}

export interface PurchaseInput {
  supplierId: string
  invoiceNumber: string
  invoiceDate: string
  tax?: number
  notes?: string | null
}

export interface PurchaseItem {
  id: string
  purchaseId: string
  ingredientId: string
  ingredientName: string
  quantity: number
  purchaseUnitId: string
  purchaseUnitCode: string
  unitCost: number
  lineTotal: number
}

export interface PurchaseItemInput {
  ingredientId: string
  quantity: number
  purchaseUnitId: string
  unitCost: number
}

export interface Attachment {
  id: string
  fileName: string
  filePath: string
  createdAt: string
}
