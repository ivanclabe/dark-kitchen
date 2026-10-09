// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Order } from '@/modules/orders/types'

// ADR 0031: one Centro de operaciones — each role its views, the figures of the day, the order on top.
const state = vi.hoisted(() => ({ perms: new Set<string>(), live: [] as Order[] }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({
  useActiveKitchen: () => ({ can: (p: string) => state.perms.has(p), path: (to: string) => `/k/centro${to}`, kitchen: { id: 'k1', slug: 'centro' } }),
}))
vi.mock('@/modules/orders/hooks/useOrders', () => ({
  useLiveOrders: () => ({ data: state.live, isLoading: false }),
  useDeliveredTodayCount: () => ({ data: 18 }),
}))
vi.mock('@/modules/orders/board/OrderBoard', () => ({ OrderBoard: ({ tickets }: { tickets?: Order[] }) => <p>{`board ${tickets?.length ?? 0}`}</p> }))
vi.mock('@/modules/orders/views/DispatchView', () => ({ DispatchView: () => <p>dispatch view</p> }))
vi.mock('@/modules/orders/views/OrderListView', () => ({
  OrderListView: function OrderListView() {
    return <p>{`list ${useLocation().search}`}</p>
  },
}))
vi.mock('@/modules/kitchen/views/KitchenView', async () => {
  const { OperationsShell } = await import('../components/OperationsShell')
  return { KitchenView: () => <OperationsShell>kitchen view</OperationsShell> }
})
vi.mock('@/modules/orders/components/OrderDetailDrawer', () => ({ OrderDetailDrawer: ({ orderId }: { orderId: string | null }) => (orderId ? <p>{`detail ${orderId}`}</p> : null) }))
vi.mock('@/modules/orders/components/NewOrderDrawer', () => ({ NewOrderDrawer: () => <p>new order</p> }))
vi.mock('@/modules/orders/components/RidersDrawer', () => ({ RidersDrawer: () => null }))
vi.mock('@/modules/orders/board/BoardDialogs', () => ({ ConfirmOrderDialog: () => null, DispatchDialog: () => null, CancelOrderDialog: () => null }))

const { OperationsPage } = await import('./OperationsPage')

const order = (id: string, status: Order['status'], total: number, paid: number): Order => ({
  id, orderNumber: 1000 + Number(id.slice(1)), customerId: 'c1', customerName: 'Juan Pérez', customerAddress: null, customerPhone: null, status, channel: 'MANUAL',
  subtotal: total, discount: 0, deliveryFee: 0, total, paymentMethod: null, notes: null, requiresReview: false, priority: 0,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), items: [], delivery: null,
  payments: paid ? [{ id: `p-${id}`, amount: paid, method: 'Efectivo', note: null, createdAt: new Date().toISOString(), createdBy: null, voidsPaymentId: null }] : [],
})

function renderAt(url = '/k/centro/operations') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/k/centro/operations" element={<OperationsPage />} />
        <Route path="/k/centro/operations/:orderId" element={<OperationsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const CAJA = ['orders.view', 'orders.create', 'kitchen.view', 'dispatch.view', 'dispatch.assign', 'dispatch.deliver', 'receivables.view', 'receivables.collect']

beforeEach(() => {
  state.perms = new Set(CAJA)
  state.live = [order('o1', 'NUEVO', 10000, 0), order('o2', 'EN_PREPARACION', 20000, 20000), order('o3', 'LISTO', 5000, 2000)]
})
afterEach(cleanup)

describe('Centro de operaciones (ADR 0031)', () => {
  it('one place: the four views of Caja, the figures of the day and the board', () => {
    renderAt()
    expect(screen.getByRole('heading', { level: 1, name: 'Centro de operaciones' })).toBeTruthy()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Tablero', 'Cocina', 'Despacho', 'Lista'])
    const figures = screen.getByRole('list', { name: 'Resumen de la operación' })
    for (const [label, value] of [['Por confirmar', '1'], ['Preparando', '1'], ['Listos', '1'], ['Entregados hoy', '18'], ['Por cobrar', '2']]) {
      expect(within(figures).getByText(label).previousSibling?.textContent).toBe(value)
    }
    expect(screen.getByText('board 3')).toBeTruthy()
  })

  it('a figure opens its orders already filtered', () => {
    renderAt()
    fireEvent.click(screen.getByText('Entregados hoy'))
    expect(screen.getByText(/^list /).textContent).toBe('list ?view=list&status=delivered&range=today')
  })

  it('«Por cobrar» opens the open orders still to collect', () => {
    renderAt()
    fireEvent.click(screen.getByText('Por cobrar'))
    expect(screen.getByText(/^list /).textContent).toBe('list ?view=list&status=open&range=all&payment=pending')
  })

  it('without the receivables there is no payment figure', () => {
    state.perms = new Set(CAJA.filter((p) => !p.startsWith('receivables')))
    renderAt()
    expect(screen.queryByText('Por cobrar')).toBeNull()
  })

  it('the rider: only Despacho, their deliveries, no tabs and no «Nuevo pedido»', () => {
    state.perms = new Set(['dispatch.view', 'dispatch.deliver'])
    renderAt()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByText('Tus entregas asignadas.')).toBeTruthy()
    expect(screen.getByText('dispatch view')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Nuevo pedido/ })).toBeNull()
  })

  it('a role that only prepares: the Cocina view, without tabs', () => {
    state.perms = new Set(['kitchen.view', 'kitchen.prepare'])
    renderAt()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByText('kitchen view')).toBeTruthy()
  })

  it('the line lands on Cocina even though it also sees the board', () => {
    state.perms = new Set(['kitchen.view', 'kitchen.prepare', 'orders.view'])
    renderAt()
    expect(screen.getByRole('tab', { name: 'Cocina' }).getAttribute('aria-selected')).toBe('true')
  })

  it('the views are their own bar, outside the header buttons (they change per view: the bar must not move)', () => {
    state.perms = new Set(['kitchen.view', 'kitchen.prepare', 'orders.view'])
    renderAt()
    const bar = screen.getByRole('tablist', { name: 'Vistas del Centro de operaciones' })
    expect(bar.closest('header')).toBeNull()
  })

  it('/operations/:id opens the order on top of the view', () => {
    renderAt('/k/centro/operations/o2?view=dispatch')
    expect(screen.getByText('detail o2')).toBeTruthy()
    expect(screen.getByText('dispatch view')).toBeTruthy()
  })
})
