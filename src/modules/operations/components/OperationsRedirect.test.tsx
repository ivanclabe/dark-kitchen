// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

// ADR 0031: the old addresses of Pedidos and Cocina keep working and keep what they carried.
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({ useActiveKitchen: () => ({ path: (to: string) => `/k/centro${to}` }) }))

const { OperationsRedirect } = await import('./OperationsRedirect')

function Where() {
  const { pathname, search } = useLocation()
  return <p>{`${pathname}${search}`}</p>
}

function go(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/k/centro/orders" element={<OperationsRedirect />} />
        <Route path="/k/centro/orders/:orderId" element={<OperationsRedirect />} />
        <Route path="/k/centro/kitchen" element={<OperationsRedirect view="kitchen" />} />
        <Route path="/k/centro/delivery" element={<OperationsRedirect view="dispatch" />} />
        <Route path="/k/centro/operations/*" element={<Where />} />
        <Route path="/k/centro/operations" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
  return screen.getByText(/^\/k\/centro\/operations/).textContent
}

afterEach(cleanup)

describe('old addresses → Centro de operaciones', () => {
  it('Pedidos keeps its view and filters', () => {
    expect(go('/k/centro/orders?view=list&status=delivered')).toBe('/k/centro/operations?view=list&status=delivered')
  })
  it('an order of Pedidos opens the same order', () => {
    expect(go('/k/centro/orders/abc')).toBe('/k/centro/operations/abc')
  })
  it('Cocina opens the Cocina view, with the order it had open (also the older ?pedido=)', () => {
    expect(go('/k/centro/kitchen')).toBe('/k/centro/operations?view=kitchen')
    cleanup()
    expect(go('/k/centro/kitchen?order=o1')).toBe('/k/centro/operations/o1?view=kitchen')
    cleanup()
    expect(go('/k/centro/kitchen?pedido=o2')).toBe('/k/centro/operations/o2?view=kitchen')
  })
  it('Despacho', () => {
    expect(go('/k/centro/delivery')).toBe('/k/centro/operations?view=dispatch')
  })
})
