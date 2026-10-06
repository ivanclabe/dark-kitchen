// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Ingredient } from '../types'

// ADR 0030: Inicio and the alerts open Stock on what is below the minimum (?filter=low).
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({ useActiveKitchen: () => ({ can: () => true }) }))
const ingredient = (id: string, name: string, stockAvailable: number) =>
  ({ id, name, code: id, active: true, stockAvailable, stockOnHand: stockAvailable, minStock: 5, maxStock: 20, avgCost: 100, baseUnitCode: 'g', categoryId: null, categoryName: null }) as unknown as Ingredient
vi.mock('../hooks/useIngredients', () => ({
  useIngredients: () => ({ data: [ingredient('i1', 'Arroz', 2), ingredient('i2', 'Sal', 12)], isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useCategories: () => ({ data: [] }),
}))

const { IngredientPanel } = await import('./IngredientPanel')

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <IngredientPanel selectedId={null} onSelect={vi.fn()} onCreate={vi.fn()} />
    </MemoryRouter>,
  )
}

afterEach(cleanup)

describe('Stock filtered from the address (ADR 0030)', () => {
  it('?filter=low shows only what is below the minimum', () => {
    renderAt('/k/centro/supply/stock?filter=low')
    expect(screen.getByRole('button', { name: /^Bajo mínimo/, pressed: true }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Arroz')).toBeTruthy()
    expect(screen.queryByText('Sal')).toBeNull()
  })

  it('without it, everything active', () => {
    renderAt('/k/centro/supply/stock')
    expect(screen.getByText('Arroz')).toBeTruthy()
    expect(screen.getByText('Sal')).toBeTruthy()
  })
})
