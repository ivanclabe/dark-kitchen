export interface Supplier {
  id: string
  name: string
  taxId: string | null
  phone: string | null
  email: string | null
  address: string | null
  contactName: string | null
  active: boolean
  /** ADR 0051: days to pay it (0 = cash). */
  paymentTermsDays: number
  /** ADR 0063: usual VAT % proposed in its manual purchases (null = none). */
  defaultVatPct: number | null
}

export interface SupplierInput {
  name: string
  taxId?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  contactName?: string | null
  paymentTermsDays?: number
  defaultVatPct?: number | null
}
