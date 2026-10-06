import type { Order, OrderPayment } from '../types'

/** The payment dimension of an order (ADR 0031), apart from its operational status. */
export type PaymentState = 'paid' | 'partial' | 'pending'

export interface OrderPaymentSummary {
  paid: number
  /** What is still to collect (never negative). */
  balance: number
  state: PaymentState
}

export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  paid: 'Pagado',
  partial: 'Pago parcial',
  pending: 'Pago pendiente',
}

/**
 * Derived, never stored: paid = the sum of the ledger (voids are negative),
 * balance = total − paid. A cancelled order has no payment status (null).
 */
export function paymentSummary(order: Pick<Order, 'total' | 'status' | 'payments'>): OrderPaymentSummary | null {
  if (order.status === 'CANCELADO') return null
  const paid = Math.round(order.payments.reduce((sum, p) => sum + p.amount, 0) * 100) / 100
  const balance = Math.max(Math.round((order.total - paid) * 100) / 100, 0)
  const state: PaymentState = paid >= order.total ? 'paid' : paid > 0 ? 'partial' : 'pending'
  return { paid, balance, state }
}

/** The payments that were voided (by a later negative entry). */
export function voidedPaymentIds(payments: OrderPayment[]): Set<string> {
  return new Set(payments.map((p) => p.voidsPaymentId).filter((id): id is string => Boolean(id)))
}
