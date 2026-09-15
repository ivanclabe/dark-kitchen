export type KitchenItemStatus = 'PENDIENTE' | 'EN_PREPARACION' | 'LISTO'

export type KitchenOrderStatus = 'CONFIRMADO' | 'EN_PREPARACION' | 'LISTO' | 'CANCELADO'

export interface KitchenTicketItem {
  id: string
  productName: string
  quantity: number
  observation: string | null
  kitchenStatus: KitchenItemStatus
}

export interface KitchenTicket {
  orderId: string
  orderNumber: number
  customerName: string
  orderStatus: KitchenOrderStatus
  createdAt: string
  notes: string | null
  priority: number
  items: KitchenTicketItem[]
  /** Solo presente en tickets CANCELADO — cuándo y por qué, para la columna Cancelado del Kanban. */
  cancelledAt?: string
  cancelReason?: string | null
}
