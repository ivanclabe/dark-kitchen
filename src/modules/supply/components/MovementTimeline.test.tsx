// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InventoryMovement } from '../types'

// Movimientos recientes: each quantity says its unit, and so does the unit cost.
const state = vi.hoisted(() => ({ movements: [] as InventoryMovement[] }))
vi.mock('../hooks/useMovements', () => ({ useMovements: () => ({ data: state.movements, isLoading: false, isError: false }) }))

const { MovementTimeline } = await import('./MovementTimeline')

const movement = (over: Partial<InventoryMovement>): InventoryMovement => ({
  id: Math.random().toString(),
  ingredientId: 'i1',
  ingredientName: 'Carne de res',
  movementType: 'COMPRA',
  quantityBaseUnit: 1500,
  unitCode: 'g',
  unitCost: 32.5,
  reason: null,
  observation: null,
  createdAt: '2026-10-09T15:00:00Z',
  ...over,
})
afterEach(cleanup)

describe('Movimientos recientes', () => {
  it('shows the quantity as people read it (ADR 0056: 1.500 g → 1,5 kg; 0,15 kg → 150 g) and the cost per base unit', () => {
    state.movements = [
      movement({ id: 'm1' }),
      movement({ id: 'm2', movementType: 'CONSUMO', quantityBaseUnit: -0.15, unitCode: 'kg', unitCost: null, ingredientName: 'Papa' }),
    ]
    render(<MovementTimeline showIngredientName />)
    expect(screen.getByText('+1,5 kg')).toBeTruthy()
    expect(screen.getByText('$32,50 / g')).toBeTruthy()
    expect(screen.getByText('-150 g')).toBeTruthy()
  })

  it('without a unit it still shows the number', () => {
    state.movements = [movement({ id: 'm3', quantityBaseUnit: 3, unitCode: '', unitCost: null })]
    render(<MovementTimeline />)
    expect(screen.getByText('+3')).toBeTruthy()
  })
})
