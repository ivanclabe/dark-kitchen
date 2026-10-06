// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CustomerListQuery } from '@/modules/customers/types'

// ADR 0030: the customer is searched in the database (never the whole list) and can come already chosen.
const state = vi.hoisted(() => ({ searches: [] as CustomerListQuery[], created: [] as string[] }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({ useActiveKitchen: () => ({ kitchen: { id: 'k1' }, can: () => true }) }))
vi.mock('@/modules/customers/api/customers', () => ({
  listCustomersPage: async (q: CustomerListQuery) => {
    state.searches.push(q)
    return { total: 1, sort: 'name', dir: 'asc', orders: false, debt: false, rows: [{ id: 'c2', fullName: `Ana (${q.search || 'recientes'})`, phone: '300', address: null, createdAt: '2026-10-01', hasWhatsapp: false }] }
  },
}))
vi.mock('@/modules/customers/components/CreateCustomerModal', () => ({ CreateCustomerModal: () => null }))
vi.mock('@/modules/orders/components/OrderBuilder', () => ({ OrderBuilder: ({ orderId }: { orderId: string }) => <p>{`builder ${orderId}`}</p> }))
vi.mock('@/modules/orders/hooks/useOrders', () => ({
  useCreateOrder: () => ({
    isPending: false,
    mutateAsync: async ({ customerId }: { customerId: string }) => {
      state.created.push(customerId)
      return { id: 'o1', orderNumber: 7, customerName: 'Carlos' }
    },
  }),
}))

const { NewOrderDrawer } = await import('./NewOrderDrawer')

function renderDrawer(props: Partial<Parameters<typeof NewOrderDrawer>[0]> = {}) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NewOrderDrawer open onClose={vi.fn()} {...props} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  state.searches = []
  state.created = []
})
afterEach(cleanup)

describe('Nuevo pedido (ADR 0030)', () => {
  it('from a customer, it opens already chosen and creates the order for them', async () => {
    renderDrawer({ initialCustomer: { id: 'c1', fullName: 'Carlos', phone: null } })
    const create = screen.getByRole('button', { name: 'Crear pedido' }) as HTMLButtonElement
    expect(create.disabled).toBe(false)
    fireEvent.click(create)
    await screen.findByText('builder o1')
    expect(state.created).toEqual(['c1'])
  })

  it('typing searches the database, a few results at a time', async () => {
    renderDrawer()
    await waitFor(() => expect(state.searches.length).toBeGreaterThan(0))
    expect(state.searches[0]).toMatchObject({ search: '', pageSize: 20 })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ana' } })
    await waitFor(() => expect(state.searches.at(-1)).toMatchObject({ search: 'ana', sort: 'name', pageSize: 20 }))
  })
})
