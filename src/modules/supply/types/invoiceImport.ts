/** ADR 0049 — importing a purchase from an invoice. */
import type { Extraction } from '../../../../supabase/functions/dk-invoice-import/contract'

export type { Confidence, Extraction, ExtractedLine } from '../../../../supabase/functions/dk-invoice-import/contract'

export type InvoiceImportStatus = 'LEYENDO' | 'LISTA' | 'ERROR' | 'USADA' | 'DESCARTADA'

export interface InvoiceImport {
  id: string
  status: InvoiceImportStatus
  fileName: string
  filePath: string
  mimeType: string
  extraction: Extraction | null
  error: string | null
  purchaseId: string | null
  createdAt: string
}

export type MatchReason = 'tax_id' | 'name' | 'similar' | 'learned' | 'code'

export interface SupplierCandidate {
  id: string
  name: string
  taxId: string | null
  active: boolean
  score: number
  reason: MatchReason
  taxIdDiffers: boolean
}

export interface IngredientSuggestion {
  ingredientId: string
  name: string
  code: string
  active: boolean
  baseUnitCode: string
  baseUnitType: 'WEIGHT' | 'VOLUME' | 'UNIT'
  avgCost: number
  purchaseUnits: { unitCode: string; factor: number }[]
  score: number
  reason: MatchReason
  learnedUnitCode: string | null
}

export interface InvoiceMatch {
  suppliers: SupplierCandidate[]
  supplierId: string | null
  supplierStrong: boolean
  duplicateInvoice: { purchaseId: string; status: string; invoiceNumber: string; invoiceDate: string } | null
  lines: { index: number; suggestions: IngredientSuggestion[] }[]
}

/** What the function answers after reading. */
export type ReadResult =
  | { kind: 'read'; importId: string; extraction: Extraction; match: InvoiceMatch }
  | { kind: 'duplicate'; importId: string; status: InvoiceImportStatus; purchaseId: string | null; invoiceNumber: string | null }

export type SupplierChoice =
  | { kind: 'existing'; id: string }
  | { kind: 'new'; name: string; taxId: string; phone: string; email: string; address: string }

export type IngredientChoice = { kind: 'existing'; id: string } | { kind: 'new'; name: string; baseUnitCode: string }

export interface ReviewLine {
  key: string
  /** Position in what the AI read. */
  index: number
  text: string
  code: string | null
  ignored: boolean
  ingredient: IngredientChoice | null
  quantity: number | null
  unitCode: string | null
  unitCost: number | null
  /** Base units in one purchase unit (only when the unit needs it: a box, a bag…). */
  factor: number | null
  remember: boolean
  confidence: 'alta' | 'media' | 'baja'
  /** The line total printed on the invoice. */
  invoiceLineTotal: number | null
  suggestions: IngredientSuggestion[]
  /** The product in plain words, as the AI read it («Arroz»). */
  genericName: string | null
  /** What one unit sold holds, as the invoice says («X 1000» → 1000 g). */
  pack: { size: number; unitCode: string } | null
  /** Added by the person (not read from the invoice). */
  added?: boolean
}

export interface ReviewDraft {
  supplier: SupplierChoice | null
  invoiceNumber: string
  /** The document had no number: this one was proposed by Quanela. */
  numberProposed: boolean
  invoiceDate: string
  tax: number | null
  notes: string
  lines: ReviewLine[]
}

export interface SaveResult {
  purchaseId: string
  supplierId: string
  supplierCreated: boolean
  supplierReused: boolean
  ingredientsCreated: number
  ingredientsReused: number
  confirmed: boolean
}
