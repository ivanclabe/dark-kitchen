// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/Toast'

// ADR 0030: the recipe goes back to where the person came from and links to its sales.
const state = vi.hoisted(() => ({ perms: new Set<string>(), usesInventory: true }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({ useActiveKitchen: () => ({ can: (p: string) => state.perms.has(p) }) }))
vi.mock('@/shared/kitchen/KitchenLink', () => ({ KitchenLink: ({ to, children, state: _state, ...rest }: { to: string; state?: unknown; children: React.ReactNode }) => <a href={to} {...rest}>{children}</a> }))
vi.mock('@/modules/products/hooks/useProducts', () => ({ useProducts: () => ({ data: [{ id: 'p1', name: 'Sopa', price: 16000, masterProductId: null, usesInventory: state.usesInventory }] }) }))
vi.mock('@/modules/supply/hooks/useIngredients', () => ({ useIngredients: () => ({ data: [{ id: 'i1', name: 'Arroz', code: 'ARR', baseUnitCode: 'g', avgCost: 5 }] }) }))
vi.mock('../hooks/useRecipes', () => ({
  useActiveRecipe: () => ({ data: { recipeId: 'r1', version: 2, items: [{ ingredientId: 'i1', ingredientName: 'Arroz', baseUnitCode: 'g', quantity: 100 }] }, isLoading: false }),
  useCreateRecipeVersion: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
