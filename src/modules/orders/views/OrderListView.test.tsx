// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Order, OrderSearch } from '../types'

// ADR 0031: Operación → Lista — one-tap status filters with the board's words, the payment column and filter.
const state = vi.hoisted(() => ({ perms: new Set<string>(), filters: [] as OrderSearch[] }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({ useActiveKitchen: () => ({ can: (p: string) => state.perms.has(p) }) }))
vi.mock('../hooks/useOrders', () => ({
  useOrderSearchPages: (f: OrderSearch) => {
    state.filters.push(f)
    const o: Order = {
      id: 'o1', orderNumber: 1042, customerId: 'c1', customerName: 'Juan Pérez', customerAddress: null, customerPhone: null, status: 'EN_PREPARACION', channel: 'MANUAL',
      subtotal: 85000, discount: 0, deliveryFee: 0, total: 85000, paymentMethod: null, notes: null, requiresReview: false, priority: 0,
      createdAt: '2026-10-06T12:00:00Z', updatedAt: '2026-10-06T12:00:00Z', items: [], delivery: null, payments: [],
    }
    return { data: { pages: [{ orders: [o], hasMore: false }] }, isLoading: false, isFetchingNextPage: false, hasNextPage: false, fetchNextPage: vi.fn(), error: null, refetch: vi.fn() }
  },
}))

const { OrderListView } = await import('./OrderListView')

function renderAt(url = '/k/centro/operations?view=list') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <OrderListView onOpen={vi.fn()} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.perms = new Set(['orders.view', 'receivables.view'])
  state.filters = []
})
afterEach(cleanup)

describe('Operación → Lista (ADR 0031)', () => {
  it('a chip per status, with the same words as the board', () => {
    renderAt()
    const chips = screen.getByRole('group', { name: 'Estado' }).querySelectorAll('button')
    expect([...chips].map((c) => c.textContent)).toEqual(['Todos', 'Abiertos', 'Por confirmar', 'En cola', 'Preparando', 'Listo', 'En ruta', 'Entregados', 'Cancelados'])
    fireEvent.click(screen.getByRole('button', { name: 'Por confirmar' }))
    expect(state.filters.at(-1)?.statuses).toEqual(['NUEVO'])
  })

  it('the filters of the address arrive (from Inicio or a figure)', () => {
    renderAt('/k/centro/operations?view=list&status=open&payment=pending')
    expect(state.filters[0]).toMatchObject({ statuses: ['NUEVO', 'CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'DESPACHADO'], payment: 'pending' })
  })

  it('the payment: a column and a filter, for whoever sees the receivables', () => {
    renderAt()
    expect(screen.getByText('Pago')).toBeTruthy()
    expect(screen.getByText('Pago pendiente')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pagados' }))
    expect(state.filters.at(-1)?.payment).toBe('paid')
  })

  it('without the receivables: no payment column, no filter, and the address cannot force it', () => {
    state.perms = new Set(['orders.view'])
    renderAt('/k/centro/operations?view=list&payment=pending')
    expect(screen.queryByRole('group', { name: 'Pago' })).toBeNull()
    expect(screen.queryByText('Pago pendiente')).toBeNull()
    expect(state.filters[0]?.payment).toBeNull()
  })
})
