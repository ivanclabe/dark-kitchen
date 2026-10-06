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
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Pedidos', 'Cuenta', 'Información'])
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
})
