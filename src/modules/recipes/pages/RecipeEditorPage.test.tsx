// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/Toast'

// ADR 0030: the recipe goes back to where the person came from and links to its sales.
const state = vi.hoisted(() => ({ perms: new Set<string>(), usesInventory: true, save: vi.fn(), createIngredient: vi.fn() }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({ useActiveKitchen: () => ({ can: (p: string) => state.perms.has(p) }) }))
vi.mock('@/shared/kitchen/KitchenLink', () => ({ KitchenLink: ({ to, children, state: _state, ...rest }: { to: string; state?: unknown; children: React.ReactNode }) => <a href={to} {...rest}>{children}</a> }))
vi.mock('@/modules/products/hooks/useProducts', () => ({ useProducts: () => ({ data: [{ id: 'p1', name: 'Sopa', price: 16000, masterProductId: null, usesInventory: state.usesInventory }] }) }))
vi.mock('@/modules/supply/hooks/useIngredients', () => ({
  useIngredients: () => ({ data: [{ id: 'i1', name: 'Arroz', code: 'ARR', baseUnitCode: 'g', avgCost: 5 }, { id: 'i2', name: 'Sal gruesa', code: 'SAL', baseUnitCode: 'kg', avgCost: 1000 }] }),
  useCreateIngredient: () => ({ mutateAsync: state.createIngredient, isPending: false }),
}))
// ADR 0069: the units a new ingredient can be counted in (a box is not one).
vi.mock('@/shared/hooks/useUnits', () => ({
  useUnits: () => ({
    data: [
      { id: 'u-g', code: 'g', name: 'Gramo' },
      { id: 'u-kg', code: 'kg', name: 'Kilogramo' },
      { id: 'u-caja', code: 'caja', name: 'Caja' },
    ],
  }),
}))
// ADR 0056: units as in the database (g, kg, l, unidad) and no own packages.
vi.mock('@/shared/hooks/useIngredientUnits', async () => {
  const units = [
    { id: 'u-g', code: 'g', name: 'Gramo', unitType: 'WEIGHT', factorToBase: 1 },
    { id: 'u-kg', code: 'kg', name: 'Kilogramo', unitType: 'WEIGHT', factorToBase: 1000 },
    { id: 'u-l', code: 'l', name: 'Litro', unitType: 'VOLUME', factorToBase: 1000 },
    { id: 'u-un', code: 'unidad', name: 'Unidad', unitType: 'UNIT', factorToBase: 1 },
  ]
  return {
    useIngredientUnits: () => ({
      units,
      isLoading: false,
      infoFor: (i: { baseUnitCode: string } | undefined) => (i ? { baseUnitCode: i.baseUnitCode, baseUnitType: 'WEIGHT', purchaseUnits: [] } : null),
    }),
  }
})
vi.mock('../hooks/useRecipes', () => ({
  useActiveRecipe: () => ({
    data: {
      recipeId: 'r1',
      version: 2,
      items: [
        { ingredientId: 'i1', ingredientName: 'Arroz', baseUnitCode: 'g', quantity: 100, unitCode: null, unitQuantity: null },
        { ingredientId: 'i2', ingredientName: 'Sal gruesa', baseUnitCode: 'kg', quantity: 0.005, unitCode: 'g', unitQuantity: 5 },
      ],
    },
    isLoading: false,
  }),
  useCreateRecipeVersion: () => ({ mutateAsync: state.save, isPending: false }),
}))

const { RecipeEditorPage } = await import('./RecipeEditorPage')

function renderAt(entry: string | { pathname: string; state: unknown }) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/k/centro/recipes/:productId" element={<RecipeEditorPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

beforeEach(() => {
  state.perms = new Set(['recipes.view', 'reports.view'])
  state.usesInventory = true
  state.save.mockReset()
  state.createIngredient.mockReset()
})
afterEach(cleanup)

describe('Receta connected (ADR 0030)', () => {
  it('by default, back to the planner; its sales one tap away', () => {
    renderAt('/k/centro/recipes/p1')
    expect(screen.getByRole('link', { name: /Volver al planificador/ }).getAttribute('href')).toBe('/menu-planner')
    expect(screen.getByRole('link', { name: /Ventas y rentabilidad/ }).getAttribute('href')).toBe('/insights?tab=products&product=p1')
  })

  it('opened from Insights, back to Insights as it was', () => {
    renderAt({ pathname: '/k/centro/recipes/p1', state: { from: { to: '/k/centro/insights?tab=products&category=c1', label: 'Insights' } } })
    expect(screen.getByRole('link', { name: /Insights/ }).getAttribute('href')).toBe('/insights?tab=products&category=c1')
  })

  it('without reports.view there is no link to sales', () => {
    state.perms = new Set(['recipes.view'])
    renderAt('/k/centro/recipes/p1')
    expect(screen.queryByRole('link', { name: /Ventas y rentabilidad/ })).toBeNull()
  })

  it('from the dish to the stock of what it takes (ADR 0031), with inventory.view', () => {
    state.perms = new Set(['recipes.view', 'inventory.view'])
    renderAt('/k/centro/recipes/p1')
    expect(screen.getByRole('link', { name: 'Ver Arroz en Stock' }).getAttribute('href')).toBe('/supply/stock/i1')
    cleanup()
    state.perms = new Set(['recipes.view'])
    renderAt('/k/centro/recipes/p1')
    expect(screen.queryByRole('link', { name: 'Ver Arroz en Stock' })).toBeNull()
  })
})

describe('Dishes that do not use inventory (ADR 0048)', () => {
  it('says so: the recipe only shows the cost', () => {
    state.usesInventory = false
    renderAt('/k/centro/recipes/p1')
    expect(screen.getByText('No usa inventario')).toBeTruthy()
    expect(screen.getByText(/no descuenta inventario: se vende sin receta/)).toBeTruthy()
  })

  it('a dish that uses inventory shows no such notice', () => {
    renderAt('/k/centro/recipes/p1')
    expect(screen.queryByText('No usa inventario')).toBeNull()
  })
})

describe('Recipes in any compatible unit (ADR 0056)', () => {
  it('shows each line as it was written (5 g of salt kept in kg), with its equivalence and real cost', () => {
    renderAt('/k/centro/recipes/p1')
    expect((screen.getByRole('combobox', { name: 'Unidad de Sal gruesa' }) as HTMLSelectElement).value).toBe('g')
    expect([...(screen.getByRole('combobox', { name: 'Unidad de Sal gruesa' }) as HTMLSelectElement).options].map((o) => o.value)).toEqual(['kg', 'g'])
    expect(screen.getByText('5 g = 0,005 kg')).toBeTruthy()
    // 100 g × $5 + 0,005 kg × $1.000 = $505
    expect(screen.getAllByText('$505').length).toBeGreaterThan(0)
  })

  it('changing the unit converts at once (0,2 kg of rice = 200 g → $1.000) and saves the chosen unit', async () => {
    state.perms = new Set(['recipes.view', 'recipes.edit'])
    renderAt('/k/centro/recipes/p1')
    fireEvent.change(screen.getByRole('combobox', { name: 'Unidad de Arroz' }), { target: { value: 'kg' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Cantidad de Arroz' }), { target: { value: '0,2' } })
    fireEvent.blur(screen.getByRole('textbox', { name: 'Cantidad de Arroz' }))
    expect(screen.getByText('0,2 kg = 200 g')).toBeTruthy()
    expect(screen.getAllByText('$1.005').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar como nueva versión' }))
    await waitFor(() => expect(state.save).toHaveBeenCalled())
    expect(state.save.mock.calls[0][0]).toEqual([
      { ingredientId: 'i1', quantity: 0.2, unitId: 'u-kg' },
      { ingredientId: 'i2', quantity: 5, unitId: 'u-g' },
    ])
  })
})

describe('Ingredients created from the recipe (ADR 0069)', () => {
  it('an ingredient that does not exist is created there, at zero stock, without leaving the recipe', async () => {
    state.perms = new Set(['recipes.view', 'recipes.edit'])
    state.createIngredient.mockResolvedValue({ id: 'i3', name: 'Queso', code: 'INS-001', baseUnitCode: 'g', avgCost: 0, active: true })
    renderAt('/k/centro/recipes/p1')
    fireEvent.click(screen.getByRole('button', { name: /Agregar ingrediente/ }))
    const pickers = screen.getAllByRole('combobox', { name: 'Insumo' })
    fireEvent.change(pickers[pickers.length - 1], { target: { value: 'Queso' } })
    fireEvent.mouseDown(screen.getByRole('option', { name: /Crear el insumo «Queso»/ }))

    expect((screen.getByRole('textbox', { name: /Nombre/ }) as HTMLInputElement).value).toBe('Queso')
    const unit = screen.getByRole('combobox', { name: /Unidad base/ }) as HTMLSelectElement
    expect([...unit.options].map((o) => o.value)).toEqual(['', 'u-g', 'u-kg'])
    expect(screen.getByText(/existencia cero hasta que registres una compra/)).toBeTruthy()
    fireEvent.change(unit, { target: { value: 'u-g' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear insumo' }))

    await waitFor(() => expect(state.createIngredient).toHaveBeenCalled())
    expect(state.createIngredient.mock.calls[0][0]).toMatchObject({ code: '', name: 'Queso', baseUnitId: 'u-g', minStock: 0 })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Crear insumo' })).toBeNull())
  })

  it('whoever cannot edit the recipe is not offered to create ingredients', () => {
    renderAt('/k/centro/recipes/p1')
    const pickers = screen.getAllByRole('combobox', { name: 'Insumo' })
    fireEvent.change(pickers[0], { target: { value: 'Queso' } })
    expect(screen.queryByRole('option', { name: /Crear el insumo/ })).toBeNull()
  })
})
