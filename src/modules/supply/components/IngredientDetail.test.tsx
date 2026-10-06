// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/Toast'
import type { Ingredient } from '../types'

// ADR 0031: from the stock back to the menu — «Se usa en» lists the dishes whose active recipe takes the ingredient.
const state = vi.hoisted(() => ({ perms: new Set<string>(), asked: [] as boolean[] }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({ useActiveKitchen: () => ({ can: (p: string) => state.perms.has(p) }) }))
vi.mock('@/shared/kitchen/KitchenLink', () => ({ KitchenLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }))
vi.mock('../hooks/useIngredients', () => ({ useSetIngredientActive: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('./MovementTimeline', () => ({ MovementTimeline: () => null }))
vi.mock('@/modules/recipes/hooks/useRecipes', () => ({
  useDishesUsingIngredient: (_id: string, enabled: boolean) => {
    state.asked.push(enabled)
    return { data: [{ productId: 'p1', productName: 'Arroz con pollo', active: true, quantity: 120 }, { productId: 'p2', productName: 'Paella', active: false, quantity: 90 }], isLoading: false }
  },
}))

const { IngredientDetail } = await import('./IngredientDetail')

const arroz: Ingredient = {
  id: 'i1', code: 'ARR', name: 'Arroz', description: null, categoryId: null, categoryName: null, baseUnitId: 'u', baseUnitCode: 'g',
  primarySupplierId: null, primarySupplierName: null, minStock: 1000, maxStock: 5000, avgCost: 5, perishable: false, shelfLifeDays: null,
  active: true, stockOnHand: 3000, stockAvailable: 3000,
}

function renderDetail() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <IngredientDetail ingredient={arroz} onEdit={vi.fn()} onRegisterMovement={vi.fn()} />
      </MemoryRouter>
    </ToastProvider>,
  )
}

beforeEach(() => {
  state.asked = []
})
afterEach(cleanup)

describe('Insumo → «Se usa en» (ADR 0031)', () => {
  it('the dishes that take it, how much, and a link to each recipe', () => {
    state.perms = new Set(['inventory.view', 'recipes.view'])
    renderDetail()
    expect(screen.getByText('Se usa en')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Arroz con pollo/ }).getAttribute('href')).toBe('/recipes/p1')
    expect(screen.getByText('120 g')).toBeTruthy()
    expect(screen.getByText(/Paella \(inactivo\)/)).toBeTruthy()
  })

  it('without recipes.view it is not shown nor asked for', () => {
    state.perms = new Set(['inventory.view'])
    renderDetail()
    expect(screen.queryByText('Se usa en')).toBeNull()
    expect(state.asked.every((enabled) => enabled === false)).toBe(true)
  })
})
