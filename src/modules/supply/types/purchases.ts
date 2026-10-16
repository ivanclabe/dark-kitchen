export type PurchaseStatus = 'BORRADOR' | 'CONFIRMADA' | 'ANULADA'

export interface Purchase {
  id: string
  supplierId: string
  supplierName: string
  /** Optional while it is a draft; required to confirm (ADR 0063 D4). */
  invoiceNumber: string | null
  invoiceDate: string
  status: PurchaseStatus
  subtotal: number
  tax: number
  /** VAT % of the invoice: the tax is computed from it on confirm (ADR 0063 D4). Null = the tax as written (imported invoices). */
  taxPct: number | null
  total: number
  notes: string | null
}

export interface PurchaseInput {
  supplierId: string
  invoiceNumber?: string | null
  invoiceDate: string
  taxPct?: number | null
  notes?: string | null
}

/** What can change in a draft header (ADR 0063 D4). */
export interface PurchaseHeaderInput {
  invoiceNumber: string | null
  invoiceDate: string
  taxPct: number | null
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

export interface LastIngredientPrice {
  unitCost: number
  purchaseUnitId: string
  purchaseUnitCode: string
  supplierName: string
  invoiceDate: string
  /** The same price per inventory (base) unit. */
  perBase: number
}

/** Price references of one ingredient (ADR 0063 D4): last confirmed purchase and the 90-day average, per base unit. */
export interface PriceReference {
  avgCost: number
  last: LastIngredientPrice | null
  avg90PerBase: number | null
}
