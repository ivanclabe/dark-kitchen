// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { InsightsData } from '../api'
import { sortProducts } from '../lib/sort'

// ADR 0027: Insights from real figures (mocked here), with and without the profitability permission.
const state = vi.hoisted(() => ({ data: null as InsightsData | null }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({
  useActiveKitchen: () => ({ kitchen: { id: 'k1', slug: 'centro', name: 'Centro' }, path: (to: string) => `/k/centro${to}` }),
}))
vi.mock('../hooks', () => ({
  useInsights: () => ({ data: state.data, isError: false, isFetching: false, isPlaceholderData: false, refetch: vi.fn() }),
  useCatalogOptions: () => ({ data: { categories: [{ id: 'c1', name: 'Bebidas' }], products: [] } }),
  useProductOrders: () => ({ data: [], isLoading: false }),
}))
// recharts needs a real layout engine; the chart itself is not under test here.
vi.mock('../components/TrendChart', () => ({ TrendChart: () => <div data-testid="trend" /> }))

const { InsightsPage } = await import('./InsightsPage')

const product = (id: string, name: string, revenue: number, grossMargin: number | null, units: number) => ({
  id, name, categoryId: null, categoryName: null, units, revenue, previousRevenue: null, previousUnits: null,
  cogs: grossMargin === null ? null : revenue * (1 - grossMargin), grossProfit: grossMargin === null ? undefined : revenue * grossMargin, grossMargin,
})

const full: InsightsData = {
  timezone: 'America/Bogota',
  currency: 'COP',
  profitability: true,
  period: { from: '2026-10-01', to: '2026-10-05' },
  compare: { from: '2026-09-01', to: '2026-09-05' },
  current: { revenue: 26000, netRevenue: 21000, orders: 2, units: 4, averageOrderValue: 13000, cogs: 2000, grossProfit: 19000, grossMargin: 0.9048, estimatedCogs: 1000, costCoverage: 0.9524 },
  previous: { revenue: 11000, netRevenue: 11000, orders: 2, units: 4, averageOrderValue: 5500, cogs: 900, grossProfit: 10100, grossMargin: 0.9182, estimatedCogs: 0, costCoverage: 0.7273 },
  daily: [{ date: '2026-10-05', revenue: 26000, netRevenue: 21000, orders: 2, cogs: 2000 }],
  products: [product('p1', 'Sopa', 16000, 0.9375, 2), product('p2', 'Limonada', 4000, 0.75, 1), product('p3', 'Pan', 1000, null, 1)],
  categories: [{ id: null, name: null, units: 3, revenue: 17000, previousRevenue: null, cogs: 1000, grossProfit: 16000, grossMargin: 0.94 }],
  channels: [{ channel: 'WHATSAPP', orders: 2, revenue: 26000 }],
  byWeekday: [],
  byHour: [],
  purchases: { total: 10000, previousTotal: 8000, bySupplier: [], ingredients: [] },
  waste: { total: 500, previousTotal: 0, byIngredient: [] },
}

function renderAt(url = '/k/centro/insights') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/k/centro/insights" element={<InsightsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(cleanup)

describe('Insights (ADR 0027)', () => {
  it('Resumen: the six key figures with their change and the business summary', () => {
    state.data = full
    renderAt()
    const strip = screen.getByText('Ingresos').closest('div.grid') as HTMLElement
    for (const label of ['Ingresos', 'Costo de ventas', 'Utilidad bruta', 'Margen bruto', 'Pedidos', 'Ticket promedio']) expect(within(strip).getByText(label)).toBeTruthy()
    expect(within(strip).getByText('$26.000')).toBeTruthy()
    expect(within(strip).getAllByText('+136,4 %').length).toBe(2) // revenue and average order value
    expect(within(strip).getByText('$1.000 estimado')).toBeTruthy()
    expect(screen.getByText('Vendiste $26.000 en 2 pedidos (ticket promedio $13.000).')).toBeTruthy()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Resumen', 'Ventas', 'Productos', 'Costos'])
  })

  it('without reports.profitability there are no cost figures', () => {
    state.data = {
      ...full,
      profitability: false,
      current: { revenue: 26000, netRevenue: 21000, orders: 2, units: 4, averageOrderValue: 13000 },
      previous: { revenue: 11000, netRevenue: 11000, orders: 2, units: 4, averageOrderValue: 5500 },
    }
    renderAt()
    expect(screen.queryByText('Costo de ventas')).toBeNull()
    expect(screen.queryByText('Utilidad bruta')).toBeNull()
    expect(screen.queryByText('Margen bruto')).toBeNull()
  })

  it('Productos: profitability table, sortable; products without cost go last', () => {
    state.data = full
    renderAt('/k/centro/insights?tab=products')
    expect(screen.getByRole('tab', { name: 'Productos' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /Ordenar por Margen/ }))
    const names = [...document.querySelectorAll('tbody tr')].map((r) => r.querySelector('td span span')?.textContent)
    expect(names).toEqual(['Sopa', 'Limonada', 'Pan'])
    expect(sortProducts(full.products, 'grossMargin', 'asc').map((p) => p.name)).toEqual(['Limonada', 'Sopa', 'Pan'])
  })

  it('the comparison can be turned off', () => {
    state.data = full
    renderAt()
    expect(screen.getByText(/Comparar/).textContent).toMatch(/con /)
    fireEvent.click(screen.getByRole('switch', { name: 'Comparar con el periodo anterior' }))
    expect(screen.getByText(/Comparar/).textContent).toBe('Comparar')
  })
})
