// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Order } from '../types'

vi.mock('@/shared/kitchen/activeKitchenContext', () => ({ useActiveKitchen: () => ({ can: () => true }) }))
vi.mock('../hooks/useSlaSettings', () => ({ useSlaSettings: () => ({ data: undefined }) }))

const { OrderCardBody } = await import('./OrderCardBody')

afterEach(cleanup)

const item = (id: string, quantity: number, productName: string) =>
  ({ id, quantity, productName, kitchenStatus: 'PENDIENTE', observation: null, options: [] }) as unknown as Order['items'][number]

const ticket = {
  id: 'o1', orderNumber: 1003, customerName: 'Laura Gómez', status: 'CONFIRMADO', priority: 0, requiresReview: false, notes: null,
  total: 30000, payments: [], delivery: null, fulfillment: 'delivery', createdAt: new Date().toISOString(),
  items: [item('i1', 3, 'Salchipapa'), item('i2', 1, 'Hamburguesa de la casa con queso doble y tocineta')],
} as unknown as Order

describe('the board card (ADR 0065)', () => {
  it('Cocina: one dish per line, whole, and without the payment', () => {
    render(<OrderCardBody ticket={ticket} now={Date.now()} kitchen />)
    const lines = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(lines).toEqual(['3×Salchipapa', '1×Hamburguesa de la casa con queso doble y tocineta'])
    expect(screen.queryByText('Por cobrar')).toBeNull()
  })

  it('Tablero: the summary in one paragraph and the payment', () => {
    render(<OrderCardBody ticket={ticket} now={Date.now()} />)
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByText('3× Salchipapa, 1× Hamburguesa de la casa con queso doble y tocineta')).toBeTruthy()
    expect(screen.getByText('Por cobrar')).toBeTruthy()
  })
})
