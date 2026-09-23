export type KitchenItemStatus = 'PENDIENTE' | 'EN_PREPARACION' | 'LISTO'

/**
 * Estados que viven en el tablero de Cocina: el flujo completo de un pedido
 * desde que se crea (NUEVO) hasta que sale a reparto (DESPACHADO), más
 * CANCELADO. ENTREGADO no está a propósito: es terminal y sale del tablero
 * (solo se cuenta en "Entregados hoy").
 */
export type KitchenOrderStatus = 'NUEVO' | 'CONFIRMADO' | 'EN_PREPARACION' | 'LISTO' | 'DESPACHADO' | 'CANCELADO'

/** El subconjunto que maneja la cocina propiamente dicha (y el motor de voz). */
export type KitchenPrepStatus = Extract<KitchenOrderStatus, 'CONFIRMADO' | 'EN_PREPARACION' | 'LISTO'>

export type OrderChannel = 'MANUAL' | 'WHATSAPP' | 'PHONE'

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
  /** Dirección del cliente — la necesita quien despacha (columnas Listo / En ruta). */
  address: string | null
  orderStatus: KitchenOrderStatus
  channel: OrderChannel
  createdAt: string
  notes: string | null
  priority: number
  total: number
  requiresReview: boolean
  items: KitchenTicketItem[]
  /** Solo en DESPACHADO: quién lo lleva y desde cuándo. */
  riderName?: string | null
  dispatchedAt?: string | null
  /** Solo presente en tickets CANCELADO — cuándo y por qué, para la columna Cancelado del Kanban. */
  cancelledAt?: string
  cancelReason?: string | null
}
