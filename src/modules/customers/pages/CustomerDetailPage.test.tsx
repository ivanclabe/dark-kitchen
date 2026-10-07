// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/Toast'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ADR 0028: the customer detail renders and an order opens over it (regression: the order drawer needs a board).
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({
  useActiveKitchen: () => ({ can: () => true, path: (to: string) => `/k/centro${to}`, kitchen: { slug: 'centro' } }),
}))
vi.mock('@/shared/kitchen/KitchenLink', () => ({ KitchenLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }))
vi.mock('../hooks/useCustomers', () => ({
  useCustomerDetail: () => ({
    data: { id: 'c1', fullName: 'Carlos', phone: '300', address: null, notes: null, createdAt: '2026-09-16T20:00:00Z', hasWhatsapp: true, orders: 1, totalPurchased: 15000, lastOrderAt: '2026-09-20T20:00:00Z', active: true, balance: 15000, overdue: 0 },
    isLoading: false,
    isError: false,
  }),
  useCreateCustomer: () => ({ mutateAsync: vi.fn() }),
  useUpdateCustomer: () => ({ mutateAsync: vi.fn() }),
}))
// ADR 0040: the sections of the 360° sheet.
const profile = {
  addresses: [
    { id: 'a1', address: 'Calle 10 # 20-30', reference: 'Torre 3', recipientName: 'Ana', deliveryNotes: 'Llamar al llegar', isFrequent: true, isCurrent: true, lastUsedAt: '2026-10-01T15:00:00Z', archivedAt: null, createdAt: '2026-09-16T20:00:00Z' },
    { id: 'a2', address: 'Carrera 5 # 6-7', reference: null, recipientName: null, deliveryNotes: null, isFrequent: false, isCurrent: false, lastUsedAt: '2026-09-20T15:00:00Z', archivedAt: null, createdAt: '2026-09-16T20:00:00Z' },
  ],
  preferences: [
    { id: 'p1', kind: 'favorite_dish', productId: 'd1', ingredientId: null, label: null, note: null, name: 'Hamburguesa Clásica', active: true, createdAt: '2026-10-01T15:00:00Z' },
    { id: 'p2', kind: 'disliked_ingredient', productId: null, ingredientId: 'i1', label: null, note: null, name: 'Cebolla', active: true, createdAt: '2026-10-01T15:00:00Z' },
  ],
  complaints: [
    { id: 'q1', orderId: 'o1', orderNumber: 1042, category: 'delay', description: 'Llegó tarde', status: 'pending', resolution: null, resolvedAt: null, resolvedBy: null, internalNotes: null, createdAt: '2026-10-02T15:00:00Z', createdBy: 'Caja', updatedAt: '2026-10-02T15:00:00Z' },
  ],
  recommendations: [{ id: 'r1', productId: 'd1', productName: 'Hamburguesa Clásica', title: 'Ofrecer el combo', reason: null, source: 'manual', score: null, status: 'active', createdAt: '2026-10-01T15:00:00Z', createdBy: 'Caja' }],
}
const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false })
vi.mock('../hooks/useCustomerProfile', () => ({
  useCustomerProfile: () => ({ data: profile, isError: false }),
  useCustomerOrderStats: () => ({
    data: { orders: 3, firstOrderAt: '2026-09-01T15:00:00Z', lastOrderAt: '2026-09-20T20:00:00Z', ordersLast90Days: 3, avgDaysBetween: 7, lastOrder: { id: 'o1', orderNumber: 1042, status: 'ENTREGADO', total: 15000, createdAt: '2026-09-20T20:00:00Z' }, topDishes: [{ productId: 'd1', name: 'Hamburguesa Clásica', units: 5, orders: 3 }] },
    isLoading: false,
  }),
  usePreferenceOptions: () => ({ data: { dishes: [], ingredients: [] } }),
  useSaveAddress: mutation,
  useArchiveAddress: mutation,
  useAddPreference: mutation,
  useRemovePreference: mutation,
  useCreateComplaint: mutation,
  useUpdateComplaint: mutation,
  useCreateRecommendation: mutation,
  useSetRecommendationStatus: mutation,
  useUpdateNotes: mutation,
}))
vi.mock('@/modules/cartera/hooks/useReceivables', () => ({
  useCustomerReceivables: () => ({ data: [], isLoading: false }),
  usePaymentsByCustomer: () => ({ data: [], isLoading: false }),
  useRegisterPayment: () => ({}),
}))
vi.mock('@/modules/orders/hooks/useOrders', () => ({
  useOrderSearch: () => ({ data: { orders: [{ id: 'o1', orderNumber: 1042, status: 'ENTREGADO', total: 15000, createdAt: '2026-09-20T20:00:00Z' }], hasMore: false }, isLoading: false, isError: false }),
}))
// The real drawer needs an order board: this stand-in asks for it exactly like OrderDetailDrawer does.
vi.mock('@/modules/orders/components/OrderDetailDrawer', async () => {
  const { useBoardActions } = await import('@/modules/orders/board/boardActions')
  return {
    OrderDetailDrawer: ({ orderId }: { orderId: string | null }) => {
      const board = useBoardActions()
      return orderId ? <p>{`drawer ${orderId} · actions offered: ${board.scope?.size ?? 'all'}`}</p> : null
    },
  }
})

vi.mock('@/modules/orders/components/NewOrderDrawer', () => ({
  NewOrderDrawer: ({ open, initialCustomer }: { open: boolean; initialCustomer?: { fullName: string } }) => (open ? <p>{`new order for ${initialCustomer?.fullName}`}</p> : null),
}))

const { CustomerDetailPage } = await import('./CustomerDetailPage')

function renderAt(entry: string | { pathname: string; state: unknown }) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/k/centro/customers/:id" element={<CustomerDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

afterEach(cleanup)

describe('customer detail (ADR 0028)', () => {
  it('renders with its tabs and opens an order over the page, without flow actions', () => {
    renderAt('/k/centro/customers/c1')
    expect(screen.getByRole('heading', { level: 1, name: 'Carlos' })).toBeTruthy()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Resumen', 'Pedidos', 'Preferencias', 'Direcciones', 'Quejas (1)', 'Cuenta'])
    fireEvent.click(screen.getByRole('tab', { name: 'Pedidos' }))
    fireEvent.click(screen.getByRole('button', { name: /Pedido #1042/ }))
    expect(screen.getByText('drawer o1 · actions offered: 0')).toBeTruthy()
  })

  it('goes back to the customers list by default (ADR 0030)', () => {
    renderAt('/k/centro/customers/c1')
    expect(screen.getByRole('link', { name: /Clientes/ }).getAttribute('href')).toBe('/customers')
  })

  it('goes back to where the person came from, and keeps it across tabs (ADR 0030)', () => {
    renderAt({ pathname: '/k/centro/customers/c1', state: { from: { to: '/k/centro/orders?view=list', label: 'Pedidos' } } })
    expect(screen.getByRole('link', { name: /Pedidos/ }).getAttribute('href')).toBe('/orders?view=list')
    fireEvent.click(screen.getByRole('tab', { name: 'Cuenta' }))
    expect(screen.getByRole('link', { name: /Pedidos/ }).getAttribute('href')).toBe('/orders?view=list')
  })

  it('ignores an origin outside the app', () => {
    renderAt({ pathname: '/k/centro/customers/c1', state: { from: { to: '//evil.example', label: 'Fuera' } } })
    expect(screen.queryByRole('link', { name: /Fuera/ })).toBeNull()
  })

  it('starts a new order for this customer (ADR 0030)', () => {
    renderAt('/k/centro/customers/c1')
    fireEvent.click(screen.getByRole('button', { name: /Nuevo pedido/ }))
    expect(screen.getByText('new order for Carlos')).toBeTruthy()
  })

  it('ADR 0040: the summary shows the most important first, from real data', () => {
    renderAt('/k/centro/customers/c1')
    // Behaviour from the orders: how often, the last order, the most ordered dish.
    expect(screen.getByText('Cada semana')).toBeTruthy()
    expect(screen.getByText('Lo que más pide')).toBeTruthy()
    expect(screen.getAllByText('Hamburguesa Clásica').length).toBeGreaterThan(0)
    // What they dislike, the last delivery address, the open complaint and the recommendation.
    expect(screen.getByText('Cebolla')).toBeTruthy()
    expect(screen.getByText('Calle 10 # 20-30')).toBeTruthy()
    expect(screen.getByText(/Última dirección de envío · usada/)).toBeTruthy()
    expect(screen.getByText('Llegó tarde')).toBeTruthy()
    expect(screen.getByText('Ofrecer el combo')).toBeTruthy()
    expect(screen.getByRole('button', { name: /1 queja abierta/ })).toBeTruthy()
  })

  it('ADR 0040: addresses keep the history — the last one first, then frequent and earlier', () => {
    renderAt('/k/centro/customers/c1')
    fireEvent.click(screen.getByRole('tab', { name: 'Direcciones' }))
    expect(screen.getByText('Torre 3 · Recibe: Ana')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Anteriores' }).textContent).toContain('Carrera 5 # 6-7')
    expect(screen.getByRole('button', { name: 'Usar como última' })).toBeTruthy()
  })

  it('ADR 0040: a complaint is registered from the header, and the history has its follow-up', () => {
    renderAt('/k/centro/customers/c1')
    fireEvent.click(screen.getByRole('tab', { name: 'Quejas (1)' }))
    expect(screen.getByText('Pendiente')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dar seguimiento' })).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: /Registrar queja/ })[0])
    expect(screen.getByRole('dialog', { name: 'Registrar queja' })).toBeTruthy()
  })
})
