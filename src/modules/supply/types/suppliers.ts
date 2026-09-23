export interface Supplier {
  id: string
  name: string
  taxId: string | null
  phone: string | null
  email: string | null
  address: string | null
  contactName: string | null
  active: boolean
}

export interface SupplierInput {
  name: string
  taxId?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  contactName?: string | null
}
