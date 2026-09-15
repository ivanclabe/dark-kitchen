export type OrderStatus =
  | 'NUEVO'
  | 'CONFIRMADO'
  | 'EN_PREPARACION'
  | 'LISTO'
  | 'DESPACHADO'
  | 'ENTREGADO'
  | 'CANCELADO'

export interface Order {
  id: string
  orderNumber: number
  customerId: string
  customerName: string
  status: OrderStatus
  subtotal: number
  discount: number
  deliveryFee: number
  total: number
  paymentMethod: string | null
  notes: string | null
  requiresReview: boolean
  createdAt: string
}

export interface OrderInput {
  customerId: string
  notes?: string | null
  discount?: number
  deliveryFee?: number
  paymentMethod?: string | null
}

export interface OrderItem {
  id: string
  orderId: string
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  lineTotal: number
  observation: string | null
  kitchenStatus: 'PENDIENTE' | 'EN_PREPARACION' | 'LISTO'
}

export interface OrderItemInput {
  productId: string
  quantity: number
  unitPrice: number
  observation?: string | null
}

export interface OrderStatusHistoryEntry {
  id: string
  fromStatus: OrderStatus | null
  toStatus: OrderStatus
  changedAt: string
  note: string | null
}
