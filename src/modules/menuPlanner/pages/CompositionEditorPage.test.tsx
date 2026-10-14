// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/Toast'

// ADR 0059: the composition of a dish — a quick start, live price and cost, and what is saved.
const state = vi.hoisted(() => ({ perms: new Set<string>(['products.edit', 'products.view']), save: vi.fn(), composition: null as unknown }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({ useActiveKitchen: () => ({ can: (p: string) => state.perms.has(p) }) }))
vi.mock('@/shared/kitchen/KitchenLink', () => ({ KitchenLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }))
vi.mock('@/modules/products/hooks/useComposition', () => ({
  useComposition: () => ({ data: state.composition, isLoading: false, isError: false }),
  useSaveComposition: () => ({ mutateAsync: state.save, isPending: false }),
}))
vi.mock('@/modules/supply/hooks/useIngredients', () => ({
  useIngredients: () => ({ data: [{ id: 'res', name: 'Carne de res', code: 'RES', baseUnitCode: 'g', avgCost: 24, active: true, isPreparation: false }] }),
}))
vi.mock('@/modules/products/hooks/useProducts', () => ({ useProducts: () => ({ data: [] }) }))
vi.mock('@/shared/hooks/useIngredientUnits', () => {
  const units = [
    { id: 'u-g', code: 'g', name: 'Gramo', unitType: 'WEIGHT', factorToBase: 1 },
    { id: 'u-kg', code: 'kg', name: 'Kilogramo', unitType: 'WEIGHT', factorToBase: 1000 },
  ]
  return {
    useIngredientUnits: () => ({
      units,
      isLoading: false,
      infoFor: (i: { baseUnitCode: string } | undefined | null) => (i ? { baseUnitCode: i.baseUnitCode, baseUnitType: 'WEIGHT', purchaseUnits: [] } : null),
    }),
  }
})

const { CompositionEditorPage } = await import('./CompositionEditorPage')

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/k/centro/dishes/corr/composition']}>
        <Routes>
          <Route path="/k/centro/dishes/:productId/composition" element={<CompositionEditorPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

beforeEach(() => {
  state.save.mockReset()
  state.save.mockImplementation(async () => state.composition)
  state.composition = { productId: 'corr', name: 'Corrientazo', price: 18000, usesInventory: true, masterCopy: false, recipeCost: 600, groups: [] }
})
afterEach(cleanup)

describe('Composición del plato (ADR 0059)', () => {
  it('starts from the «Corrientazo» template: five groups, the customer view and the price with the defaults', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Plantilla: Corrientazo' }))
    expect(screen.getAllByRole('region', { name: /^Grupo / })).toHaveLength(5)
    expect(screen.getByText('Así lo ve el cliente')).toBeTruthy()
    // The defaults: sopa del día, frijoles, pollo, limonada → $18.000; choosing beef adds $3.000.
    expect(screen.getByText('Precio para el cliente').nextElementSibling?.textContent).toBe('$18.000')
    fireEvent.click(screen.getAllByRole('radio', { name: /Res/ })[0])
    expect(screen.getByText('Precio para el cliente').nextElementSibling?.textContent).toBe('$21.000')
  })

  it('an option that consumes beef shows its cost and margin; saving sends the groups as the database expects', async () => {
    state.composition = {
      productId: 'corr', name: 'Corrientazo', price: 18000, usesInventory: true, masterCopy: false, recipeCost: 600,
      groups: [{ id: 'g1', name: 'Proteína', minSelect: 1, maxSelect: 1, allowRepeat: false, options: [
        { id: 'o1', name: 'Res', pricing: 'extra', price: 3000, isDefault: false, active: true, available: true, componentIngredientId: 'res', componentQuantity: 180,
          componentUnitId: null, componentUnitQuantity: null, componentProductId: null, componentName: 'Carne de res', componentUnitCode: 'g', unitCost: 4320 },
      ] }],
    }
    renderPage()
    // 180 g × $24 = $4.320; margin $3.000 − $4.320.
    expect(screen.getByText('Costo $4.320')).toBeTruthy()
    expect(screen.getByText('Margen -$1.320')).toBeTruthy()
    // Written in kg: 0,2 kg → saved with its unit (the database converts to 200 g).
    fireEvent.change(screen.getByRole('combobox', { name: 'Unidad de Res' }), { target: { value: 'kg' } })
    const qty = screen.getByRole('textbox', { name: 'Cantidad de Res' })
    fireEvent.change(qty, { target: { value: '0,2' } })
    fireEvent.blur(qty)
    expect(screen.getByText('Costo $4.800')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar composición' }))
    await waitFor(() => expect(state.save).toHaveBeenCalled())
    expect(state.save.mock.calls[0][0]).toEqual([
      {
        id: 'g1', name: 'Proteína', minSelect: 1, maxSelect: 1, allowRepeat: false,
        options: [{ id: 'o1', name: 'Res', pricing: 'extra', price: 3000, isDefault: false, active: true, componentIngredientId: 'res', componentQuantity: 0.2, componentUnitId: 'u-kg', componentProductId: null }],
      },
    ])
  })

  it('without products.edit it is read-only', () => {
    state.perms = new Set(['products.view'])
    renderPage()
    expect(screen.queryByRole('button', { name: 'Guardar composición' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Plantilla: Corrientazo' })).toBeNull()
    state.perms = new Set(['products.edit', 'products.view'])
  })
})
