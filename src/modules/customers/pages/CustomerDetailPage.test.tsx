// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/Toast'

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

const { CustomerDetailPage } = await import('./CustomerDetailPage')

afterEach(cleanup)

describe('customer detail (ADR 0028)', () => {
  it('renders with its tabs and opens an order over the page, without flow actions', () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/k/centro/customers/c1']}>
          <Routes>
            <Route path="/k/centro/customers/:id" element={<CustomerDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Carlos' })).toBeTruthy()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Pedidos', 'Cuenta', 'Información'])
    fireEvent.click(screen.getByRole('button', { name: /Pedido #1042/ }))
    expect(screen.getByText('drawer o1 · actions offered: 0')).toBeTruthy()
  })
})
