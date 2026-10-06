// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/Toast'
import type { Order } from '../types'

// ADR 0031: «Registrar pago» inside the order, in place; voiding with a reason; only with the permissions.
const state = vi.hoisted(() => ({ perms: new Set<string>(), registered: [] as unknown[], voided: [] as unknown[] }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({ useActiveKitchen: () => ({ can: (p: string) => state.perms.has(p) }) }))
vi.mock('@/modules/cartera/hooks/useReceivables', () => ({
  useRegisterPayment: () => ({ isPending: false, mutateAsync: async (input: unknown) => void state.registered.push(input) }),
  useVoidPayment: () => ({ isPending: false, mutateAsync: async (input: unknown) => void state.voided.push(input) }),
}))

const { PaymentCard } = await import('./PaymentCard')

const order = (over: Partial<Order> = {}): Order => ({
  id: 'o1', orderNumber: 1042, customerId: 'c1', customerName: 'Juan Pérez', customerAddress: null, customerPhone: null, status: 'EN_PREPARACION', channel: 'MANUAL',
  subtotal: 85000, discount: 0, deliveryFee: 0, total: 85000, paymentMethod: null, notes: null, requiresReview: false, priority: 0,
  createdAt: '2026-10-06T12:00:00Z', updatedAt: '2026-10-06T12:00:00Z', items: [], delivery: null, payments: [], ...over,
})

const renderCard = (o: Order) => render(<ToastProvider><PaymentCard order={o} /></ToastProvider>)

beforeEach(() => {
  state.perms = new Set(['receivables.view', 'receivables.collect'])
  state.registered = []
  state.voided = []
})
afterEach(cleanup)

describe('Pago in the order (ADR 0031)', () => {
  it('pending: the balance and «Registrar pago»; the form comes filled and confirms in one tap', async () => {
    renderCard(order())
    expect(screen.getByText('Pago pendiente')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }))
    expect((screen.getByLabelText('Monto del pago') as HTMLInputElement).value).toBe('85000')
    fireEvent.click(screen.getByRole('button', { name: 'Transferencia' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pago' }))
    await waitFor(() => expect(state.registered).toEqual([{ orderId: 'o1', amount: 85000, method: 'Transferencia', note: '' }]))
  })

  it('never more than the balance', () => {
    renderCard(order({ payments: [{ id: 'p1', amount: 35000, method: 'Efectivo', note: null, createdAt: '2026-10-06T12:00:00Z', createdBy: 'Caja', voidsPaymentId: null }] }))
    expect(screen.getByText('Pago parcial')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }))
    fireEvent.change(screen.getByLabelText('Monto del pago'), { target: { value: '60000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pago' }))
    expect(screen.getByRole('alert').textContent).toContain('supera el saldo')
    expect(state.registered).toEqual([])
  })

  it('paid: «Pagado» and its detail; voiding asks for the reason', async () => {
    renderCard(order({ payments: [{ id: 'p1', amount: 85000, method: 'Efectivo', note: null, createdAt: '2026-10-06T12:00:00Z', createdBy: 'Caja', voidsPaymentId: null }] }))
    expect(screen.getAllByText(/Pagado/).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Registrar pago' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Ver detalle/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Anular' }))
    fireEvent.click(screen.getByRole('button', { name: 'Anular pago' }))
    expect(screen.getByRole('alert').textContent).toContain('motivo')
    fireEvent.change(screen.getByLabelText('Motivo de la anulación'), { target: { value: 'Cobrado dos veces' } })
    fireEvent.click(screen.getByRole('button', { name: 'Anular pago' }))
    await waitFor(() => expect(state.voided).toEqual([{ paymentId: 'p1', reason: 'Cobrado dos veces' }]))
  })

  it('a voided payment is shown as such and cannot be voided again', () => {
    renderCard(order({ payments: [
      { id: 'p1', amount: 85000, method: 'Efectivo', note: null, createdAt: '2026-10-06T12:00:00Z', createdBy: 'Caja', voidsPaymentId: null },
      { id: 'v1', amount: -85000, method: 'Efectivo', note: 'Cobrado dos veces', createdAt: '2026-10-06T12:05:00Z', createdBy: 'Caja', voidsPaymentId: 'p1' },
    ] }))
    expect(screen.getByText('Pago pendiente')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Ver detalle/ }))
    expect(screen.getByText('Anulado')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Anular' })).toBeNull()
  })

  it('who sees the receivables but does not collect: no actions', () => {
    state.perms = new Set(['receivables.view'])
    renderCard(order())
    expect(screen.getByText('Pago pendiente')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Registrar pago' })).toBeNull()
  })

  it('without the receivables: nothing (never a false «pendiente»)', () => {
    state.perms = new Set()
    const { container } = renderCard(order())
    expect(container.textContent).toBe('')
  })
})
