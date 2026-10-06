import { describe, expect, it } from 'vitest'
import type { OrderPayment } from '../types'
import { paymentSummary, voidedPaymentIds } from './payment'

const pay = (id: string, amount: number, voids: string | null = null): OrderPayment => ({ id, amount, method: 'Efectivo', note: null, createdAt: '', createdBy: null, voidsPaymentId: voids })

describe('the payment of an order is derived from its ledger (ADR 0031)', () => {
  it('pending, partial and paid — apart from the operational status', () => {
    expect(paymentSummary({ total: 85000, status: 'EN_PREPARACION', payments: [] })).toEqual({ paid: 0, balance: 85000, state: 'pending' })
    expect(paymentSummary({ total: 85000, status: 'EN_PREPARACION', payments: [pay('a', 35000)] })).toEqual({ paid: 35000, balance: 50000, state: 'partial' })
    expect(paymentSummary({ total: 85000, status: 'EN_PREPARACION', payments: [pay('a', 35000), pay('b', 50000)] })).toEqual({ paid: 85000, balance: 0, state: 'paid' })
  })

  it('a void (negative entry) brings the balance back', () => {
    const payments = [pay('a', 85000), pay('v', -85000, 'a')]
    expect(paymentSummary({ total: 85000, status: 'ENTREGADO', payments })?.state).toBe('pending')
    expect([...voidedPaymentIds(payments)]).toEqual(['a'])
  })

  it('a cancelled order has no payment status', () => {
    expect(paymentSummary({ total: 85000, status: 'CANCELADO', payments: [] })).toBeNull()
  })
})
