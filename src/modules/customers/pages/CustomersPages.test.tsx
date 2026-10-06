// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { relativeDay } from '../lib/dates'
import type { CustomerListQuery, CustomerPage, CustomersSummary } from '../types'

// ADR 0028: Clientes paged in the database (mocked here): search, filters, sort, pages, states and permissions.
const state = vi.hoisted(() => ({
  perms: new Set<string>(),
  page: null as CustomerPage | null,
  summary: { total: 0 } as CustomersSummary,
  queries: [] as CustomerListQuery[],
  loading: false,
  error: null as Error | null,
}))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({
  useActiveKitchen: () => ({ can: (p: string) => state.perms.has(p), path: (to: string) => `/k/centro${to}`, kitchen: { slug: 'centro' } }),
}))
vi.mock('@/shared/kitchen/KitchenLink', () => ({ KitchenLink: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => <a href={to} {...rest}>{children}</a> }))
vi.mock('../hooks/useCustomers', () => ({
  useCustomersPage: (q: CustomerListQuery) => {
    state.queries.push(q)
    return { data: state.page ?? undefined, isLoading: state.loading, isError: !!state.error, error: state.error, isPlaceholderData: false, isFetching: false, refetch: vi.fn() }
  },
  useCustomersSummary: () => ({ data: state.summary }),
  useCustomerDetail: () => ({ data: undefined }),
  useCreateCustomer: () => ({ mutateAsync: vi.fn() }),
  useUpdateCustomer: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/modules/cartera/hooks/useReceivables', () => ({ useRecentPayments: () => ({ data: [] }), useCustomerReceivables: () => ({ data: [] }), useRegisterPayment: () => ({}) }))

const { CustomersPage } = await import('./CustomersPage')

const row = (id: string, fullName: string, over: object = {}) => ({
  id, fullName, phone: '300 123 4567', address: 'Calle 10', createdAt: new Date().toISOString(), hasWhatsapp: false,
  orders: 2, totalPurchased: 30000, lastOrderAt: new Date().toISOString(), active: true, balance: 25000, overdue: 0, ...over,
})

function renderPage(url = '/k/centro/customers') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/k/centro/customers" element={<CustomersPage />} />
        <Route path="*" element={<p>other</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.perms = new Set(['customers.view', 'customers.create', 'customers.edit', 'orders.view', 'receivables.view', 'receivables.collect'])
  state.page = { total: 2, sort: 'balance', dir: 'desc', orders: true, debt: true, rows: [row('c1', 'Ana Pérez'), row('c2', 'Bruno Díaz', { balance: 0, active: false, lastOrderAt: null, orders: 0 })] }
  state.summary = { total: 2, active: 1, withDebt: 1, pendingBalance: 25000, overdueBalance: 0, withOverdue: 0 }
  state.queries = []
  state.loading = false
  state.error = null
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Clientes (ADR 0028)', () => {
  it('KPIs in one strip and the business table with the useful columns', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Clientes' })).toBeTruthy()
    for (const label of ['Total clientes', 'Activos', 'Con deuda', 'Saldo pendiente']) expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    const table = screen.getByRole('table')
    for (const h of ['Cliente', 'Contacto', 'Pedidos', 'Total comprado', 'Saldo', 'Último pedido', 'Estado']) expect(within(table).getByText(h)).toBeTruthy()
    expect(within(table).getByText('Ana Pérez')).toBeTruthy()
    expect(within(table).getByText('Nunca')).toBeTruthy()
  })

  it('the search waits for a pause and goes to the database; filters reset to page 1', async () => {
    vi.useFakeTimers()
    renderPage()
    fireEvent.change(screen.getByLabelText('Buscar clientes'), { target: { value: 'ana' } })
    expect(state.queries.at(-1)?.search).toBe('')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350)
    })
    expect(state.queries.at(-1)?.search).toBe('ana')
    fireEvent.click(screen.getByRole('button', { name: 'Con deuda' }))
    expect(state.queries.at(-1)).toMatchObject({ status: 'debt', page: 0, search: 'ana' })
  })

  it('sorting is asked to the database; the pager pages it', () => {
    state.page = { ...state.page!, total: 60 }
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Ordenar por Total comprado/ }))
    expect(state.queries.at(-1)).toMatchObject({ sort: 'total', dir: 'desc' })
    expect(screen.getByText(/Mostrando/).textContent).toContain('1–25')
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    expect(state.queries.at(-1)?.page).toBe(1)
  })

  it('without the receivables permission there is no balance column, filter nor KPI', () => {
    state.perms = new Set(['customers.view'])
    state.page = { ...state.page!, orders: false, debt: false, rows: [{ id: 'c1', fullName: 'Ana Pérez', phone: null, address: null, createdAt: new Date().toISOString(), hasWhatsapp: false }] }
    state.summary = { total: 1 }
    renderPage()
    const table = screen.getByRole('table')
    expect(within(table).queryByText('Saldo')).toBeNull()
    expect(within(table).queryByText('Pedidos')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Con deuda' })).toBeNull()
    expect(screen.queryByText('Saldo pendiente')).toBeNull()
  })

  it('empty business vs no results', () => {
    state.page = { ...state.page!, total: 0, rows: [] }
    state.summary = { total: 0 }
    renderPage()
    expect(screen.getAllByText('No hay clientes todavía').length).toBeGreaterThan(0)
    cleanup()
    state.summary = { total: 40 }
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Vencidos' }))
    expect(screen.getAllByText('No encontramos clientes que coincidan con tu búsqueda').length).toBeGreaterThan(0)
  })

  it('an error does not break the page', () => {
    state.error = new Error('Sin conexión')
    renderPage()
    expect(screen.getByRole('button', { name: /Reintentar/ })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Clientes' })).toBeTruthy()
  })
})

describe('Clientes connected (ADR 0030)', () => {
  it('opens already filtered from the address (Inicio «Clientes con saldo vencido»)', () => {
    renderPage('/k/centro/customers?status=overdue&q=ana')
    expect(state.queries[0]).toMatchObject({ status: 'overdue', search: 'ana', page: 0 })
    expect((screen.getByLabelText('Buscar clientes') as HTMLInputElement).value).toBe('ana')
    expect(screen.getByRole('button', { name: 'Vencidos' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('an unknown status in the address is ignored', () => {
    renderPage('/k/centro/customers?status=nope')
    expect(state.queries[0]?.status).toBe('all')
  })
})

describe('relative days', () => {
  it('Hoy · Ayer · Hace N días · date', () => {
    const now = new Date('2026-10-05T12:00:00')
    expect(relativeDay('2026-10-05T08:00:00', now)).toBe('Hoy')
    expect(relativeDay('2026-10-04T23:00:00', now)).toBe('Ayer')
    expect(relativeDay('2026-10-01T10:00:00', now)).toBe('Hace 4 días')
    expect(relativeDay('2026-09-12T10:00:00', now)).toBe('12 sep')
    expect(relativeDay('2025-09-12T10:00:00', now)).toBe('12 sep 2025')
  })
})
