// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/Toast'

// ADR 0057: a preparation's recipe in the same editor as a dish's — lines in any unit, the yield and the portion.
const state = vi.hoisted(() => ({ perms: new Set<string>(['recipes.view', 'recipes.edit']), save: vi.fn() }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({ useActiveKitchen: () => ({ can: (p: string) => state.perms.has(p) }) }))
vi.mock('@/shared/kitchen/KitchenLink', () => ({ KitchenLink: ({ to, children, state: _s, ...rest }: { to: string; state?: unknown; children: React.ReactNode }) => <a href={to} {...rest}>{children}</a> }))
vi.mock('@/modules/products/hooks/useProducts', () => ({ useProducts: () => ({ data: [] }) }))
vi.mock('@/modules/recipes/hooks/useRecipes', () => ({ useActiveRecipe: () => ({ data: null }), useCreateRecipeVersion: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('../hooks/useIngredients', () => ({
  useIngredients: () => ({
    data: [
      { id: 'mayo', name: 'Mayonesa', code: 'MAYO', baseUnitCode: 'g', avgCost: 12, active: true, isPreparation: false },
      { id: 'ajo', name: 'Ajo', code: 'AJO', baseUnitCode: 'g', avgCost: 8, active: true, isPreparation: false },
      { id: 'salsa', name: 'Salsa de ajo', code: 'PREP-001', baseUnitCode: 'g', avgCost: 0, active: true, isPreparation: true },
    ],
  }),
}))
vi.mock('../hooks/usePreparations', () => ({
  usePreparation: () => ({
    data: {
      id: 'salsa', code: 'PREP-001', name: 'Salsa de ajo', active: true, baseUnitId: 'u-g', baseUnitCode: 'g', stockOnHand: 0, stockAvailable: 0,
      minStock: 0, belowMin: false, avgCost: 0, theoreticalUnitCost: null, portion: null, usedIn: 0, lastBatchAt: null, recipe: null,
      items: [], tree: [], usage: { dishes: [], preparations: [] }, batches: [],
    },
    isLoading: false,
    isError: false,
  }),
  useCreatePreparationVersion: () => ({ mutateAsync: state.save, isPending: false }),
}))
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

const { PreparationRecipePage } = await import('./PreparationRecipePage')

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/k/centro/supply/preparaciones/salsa/receta']}>
        <Routes>
          <Route path="/k/centro/supply/preparaciones/:id/receta" element={<PreparationRecipePage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

function typeNumber(name: string | RegExp, value: string) {
  const box = screen.getByRole('textbox', { name })
  fireEvent.change(box, { target: { value } })
  fireEvent.blur(box)
}

beforeEach(() => state.save.mockReset())
afterEach(cleanup)

describe('Receta de una preparación (ADR 0057)', () => {
  it('back to the preparation; asks for the yield', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /Volver a la preparación/ }).getAttribute('href')).toBe('/supply/preparaciones/salsa')
    expect(screen.getByText('Preparación')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: /Rinde por lote/ })).toBeTruthy()
  })

  it('yield written in kg (0,85 kg = 850 g), cost per gram and per portion; saves the yield and the portion as typed', async () => {
    renderPage()
    // The empty state and the table footer both offer it: the first one adds the first line.
    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar ingrediente' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Agregar ingrediente' }))
    const pickers = screen.getAllByRole('combobox', { name: 'Insumo' })
    // The preparation is not offered as its own ingredient.
    fireEvent.focus(pickers[0])
    fireEvent.change(pickers[0], { target: { value: 'Salsa' } })
    expect(screen.getByText('Sin insumos con ese nombre o código')).toBeTruthy()
    fireEvent.change(pickers[0], { target: { value: 'Mayo' } })
    fireEvent.mouseDown(screen.getByRole('button', { name: /^Mayonesa/ }))
    fireEvent.focus(pickers[1])
    fireEvent.change(pickers[1], { target: { value: 'Ajo' } })
    fireEvent.mouseDown(screen.getByRole('button', { name: /^AjoAJO/ }))
    typeNumber('Cantidad de Mayonesa', '800')
    fireEvent.change(screen.getByRole('combobox', { name: 'Unidad de Ajo' }), { target: { value: 'kg' } })
    typeNumber('Cantidad de Ajo', '0,05')
    expect(screen.getByText('0,05 kg = 50 g')).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox', { name: 'Unidad del rendimiento' }), { target: { value: 'kg' } })
    typeNumber(/Rinde por lote/, '0,85')
    typeNumber(/Una porción/, '25')
    expect(screen.getByText('= 850 g')).toBeTruthy()
    expect(screen.getByText('Un lote da 34 porciones')).toBeTruthy()
    // 800 × $12 + 50 × $8 = $10.000 → $11,76/g → $294 a portion.
    expect(screen.getAllByText('$10.000').length).toBeGreaterThan(0)
    expect(screen.getByText('$11,76')).toBeTruthy()
    expect(screen.getByText('$294')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar como nueva versión' }))
    await waitFor(() => expect(state.save).toHaveBeenCalled())
    expect(state.save.mock.calls[0][0]).toEqual({
      items: [
        { ingredientId: 'mayo', quantity: 800, unitId: null },
        { ingredientId: 'ajo', quantity: 0.05, unitId: 'u-kg' },
      ],
      yieldQuantity: 0.85,
      yieldUnitId: 'u-kg',
      portion: 25,
      portionUnitId: null,
    })
  })
})
