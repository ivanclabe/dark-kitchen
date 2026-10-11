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
}

export interface SupplierInput {
  name: string
  taxId?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  contactName?: string | null
  paymentTermsDays?: number
}
