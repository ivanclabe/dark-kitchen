export interface Customer {
  id: string
  fullName: string
  phone: string | null
  address: string | null
  notes: string | null
}

export interface CustomerInput {
  fullName: string
  phone?: string | null
  address?: string | null
  notes?: string | null
}
