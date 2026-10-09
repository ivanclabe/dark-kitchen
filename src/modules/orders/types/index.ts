/**
 * The order, the one operational entity (ADR 0020). Pedidos, Cocina,
 * Despacho, the Dashboard and Clientes all read this same shape from the
 * same query (orders/api/orders.ts); none of them has its own copy.
 */
export type OrderStatus = 'NUEVO' | 'CONFIRMADO' | 'EN_PREPARACION' | 'LISTO' | 'DESPACHADO' | 'ENTREGADO' | 'CANCELADO'

/** The live flow of the board: from NUEVO (to confirm) to DESPACHADO (on its way). */
export type FlowStatus = Exclude<OrderStatus, 'ENTREGADO' | 'CANCELADO'>

/** The kitchen stretch (Cocina's own view and voice commands). */
export type PrepStatus = Extract<OrderStatus, 'CONFIRMADO' | 'EN_PREPARACION' | 'LISTO'>

export type KitchenItemStatus = 'PENDIENTE' | 'EN_PREPARACION' | 'LISTO'

export type OrderChannel = 'MANUAL' | 'WHATSAPP' | 'PHONE'

export type DeliveryStatus = 'EN_RUTA' | 'ENTREGADO' | 'FALLIDO'

export interface OrderItem {
  id: string
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  lineTotal: number
  observation: string | null
  kitchenStatus: KitchenItemStatus
}

export interface Order {
  id: string
  orderNumber: number
  customerId: string
  customerName: string
  /** Where it goes — the rider needs it (only with customers.view, or for the rider's own deliveries). */
  customerAddress: string | null
  customerPhone: string | null
  /** ADR 0044: a company, and whether the customer is preferred (with the business's reason). */
  customerType?: 'person' | 'company'
  customerPreferred?: boolean
  customerPreferredNote?: string | null
  status: OrderStatus
  channel: OrderChannel
  subtotal: number
  discount: number
  deliveryFee: number
  total: number
  paymentMethod: string | null
  notes: string | null
  requiresReview: boolean
  /** Kitchen priority (0 = normal). */
  priority: number
  createdAt: string
  updatedAt: string
  items: OrderItem[]
  /**
   * Its payments (ADR 0031): the ledger dk_order_payments, the one source of
   * truth — empty for whoever cannot see the receivables. A void is a
   * negative entry pointing to the payment it cancels.
   */
  payments: OrderPayment[]
  /** From dispatch on: who takes it and when. */
  delivery: { status: DeliveryStatus; riderId: string | null; riderName: string | null; dispatchedAt: string | null; deliveredAt: string | null } | null
}

export interface OrderPayment {
  id: string
  amount: number
  method: string | null
  note: string | null
  createdAt: string
  createdBy: string | null
  voidsPaymentId: string | null
}

export interface OrderInput {
  customerId: string
  notes?: string | null
  discount?: number
  deliveryFee?: number
  paymentMethod?: string | null
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
  changedBy: string | null
}

/** Filters of the Lista view (all orders, also delivered and cancelled). */
export interface OrderSearch {
  search?: string
  from?: string | null
  to?: string | null
  statuses?: OrderStatus[]
  channel?: OrderChannel | null
  customerId?: string | null
  /** ADR 0031: paid or still to collect (ignored by the database without receivables.view). */
  payment?: 'paid' | 'pending' | null
  limit?: number
  offset?: number
}

export interface Rider {
  id: string
  fullName: string
  phone: string | null
  vehicleType: string | null
  active: boolean
  /** The rider's Quanela user, if any (needed for shifts, ADR 0020). */
  userId: string | null
}

export interface RiderInput {
  fullName: string
  phone?: string | null
  vehicleType?: string | null
}
