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
vi.mock('../hooks/usePreparations', () => ({
  useIngredientUsage: (_id: string, enabled: boolean) => {
    state.asked.push(enabled)
    return {
      data: {
        dishes: [
          { productId: 'p1', name: 'Arroz con pollo', active: true, quantity: 120, via: null },
          { productId: 'p2', name: 'Paella', active: false, quantity: 90, via: null },
          { productId: 'p3', name: 'Arroz con salsa', active: true, quantity: null, via: 'Salsa de la casa' },
        ],
        preparations: [{ ingredientId: 'i9', name: 'Salsa de la casa', quantity: 300 }],
      },
      isLoading: false,
    }
  },
}))

const { IngredientDetail } = await import('./IngredientDetail')

const arroz: Ingredient = {
  id: 'i1', code: 'ARR', name: 'Arroz', description: null, categoryId: null, categoryName: null, baseUnitId: 'u', baseUnitCode: 'g',
  primarySupplierId: null, primarySupplierName: null, minStock: 1000, maxStock: 5000, avgCost: 5, perishable: false, shelfLifeDays: null,
  active: true, isPreparation: false, stockOnHand: 3000, stockAvailable: 3000,
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

  it('ADR 0057: the preparations that carry it, and the dishes that take it through them', () => {
    state.perms = new Set(['inventory.view', 'recipes.view'])
    renderDetail()
    expect(screen.getByRole('link', { name: /^Salsa de la casa/ }).getAttribute('href')).toBe('/supply/preparaciones/i9')
    expect(screen.getByText('300 g por lote')).toBeTruthy()
    expect(screen.getByText('vía Salsa de la casa')).toBeTruthy()
  })

  it('without recipes.view it is not shown nor asked for', () => {
    state.perms = new Set(['inventory.view'])
    renderDetail()
    expect(screen.queryByText('Se usa en')).toBeNull()
    expect(state.asked.every((enabled) => enabled === false)).toBe(true)
  })
})
