export interface Receivable {
  orderId: string
  orderNumber: number
  customerId: string
  customerName: string
  customerPhone: string | null
  status: string
  total: number
  paidAmount: number
  balance: number
  dueDate: string | null
  createdAt: string
}

export interface RegisterPaymentInput {
  orderId: string
  amount: number
  method?: string | null
  note?: string | null
}

export interface CustomerPayment {
  id: string
  orderId: string
  orderNumber: number
  amount: number
  method: string | null
  note: string | null
  createdAt: string
}

export interface RecentPayment extends CustomerPayment {
  customerId: string
  customerName: string
}
