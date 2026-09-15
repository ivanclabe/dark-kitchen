export type KitchenItemStatus = 'PENDIENTE' | 'EN_PREPARACION' | 'LISTO'

export type KitchenOrderStatus = 'CONFIRMADO' | 'EN_PREPARACION' | 'LISTO'

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
}
