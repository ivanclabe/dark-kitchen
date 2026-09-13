export interface Rider {
  id: string
  fullName: string
  phone: string | null
  vehicleType: string | null
  active: boolean
}

export interface RiderInput {
  fullName: string
  phone?: string | null
  vehicleType?: string | null
}

export interface ReadyOrder {
  orderId: string
  customerName: string
  address: string | null
  total: number
  createdAt: string
}

export interface DispatchedOrder {
  orderId: string
  customerName: string
  address: string | null
  total: number
  riderName: string | null
  dispatchedAt: string
}
