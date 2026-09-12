export type KitchenItemStatus = 'PENDIENTE' | 'EN_PREPARACION' | 'LISTO'

export interface KitchenTicketItem {
  id: string
  productName: string
  quantity: number
  observation: string | null
  kitchenStatus: KitchenItemStatus
}

export interface KitchenTicket {
  orderId: string
  customerName: string
  orderStatus: 'CONFIRMADO' | 'EN_PREPARACION'
  createdAt: string
  notes: string | null
  items: KitchenTicketItem[]
}
