// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/Toast'
import type { PreparationDetail } from '../types'

// ADR 0057: preparing a batch — what goes out (with what there is), what comes in and its cost, before anything moves.
const state = vi.hoisted(() => ({ register: vi.fn() }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('../hooks/usePreparations', () => ({ useRegisterProduction: () => ({ mutateAsync: state.register, isPending: false }) }))
vi.mock('@/shared/hooks/useIngredientUnits', () => {
  const units = [
    { id: 'u-g', code: 'g', name: 'Gramo', unitType: 'WEIGHT', factorToBase: 1 },
    { id: 'u-kg', code: 'kg', name: 'Kilogramo', unitType: 'WEIGHT', factorToBase: 1000 },
    { id: 'u-p', code: 'porcion', name: 'Porción', unitType: 'UNIT', factorToBase: 1 },
  ]
  return {
    useIngredientUnits: () => ({
      units,
      isLoading: false,
      infoFor: (i: { id: string; baseUnitCode: string } | null) =>
        i ? { baseUnitCode: i.baseUnitCode, baseUnitType: 'WEIGHT', purchaseUnits: i.id === 'salsa' ? [{ unitCode: 'porcion', factor: 25 }] : [] } : null,
    }),
  }
})

const { ProductionDrawer } = await import('./ProductionDrawer')

const item = (name: string, quantity: number, avgCost: number, stockAvailable: number) => ({
  ingredientId: name, code: name.toUpperCase(), name, isPreparation: false, quantity, unitCode: 'g', enteredUnitId: null, enteredUnitCode: null,
  enteredQuantity: null, avgCost, lineCost: quantity * avgCost, stockAvailable,
})
const salsa: PreparationDetail = {
  id: 'salsa', code: 'PREP-001', name: 'Salsa de ajo', active: true, baseUnitId: 'u-g', baseUnitCode: 'g', stockOnHand: 0, stockAvailable: 0,
  minStock: 0, belowMin: false, avgCost: 11.79, theoreticalUnitCost: 11.79, portion: 25, usedIn: 3, lastBatchAt: null,
  recipe: { id: 'r1', version: 1, yieldQuantity: 850, yieldUnitCode: 'kg', yieldUnitQuantity: 0.85, createdAt: '2026-10-12T10:00:00Z' },
  items: [item('Mayonesa', 800, 12, 2000), item('Ajo', 50, 8, 1000), item('Sal', 10, 2, 1000)],
  tree: [], usage: { dishes: [], preparations: [] }, batches: [],
}

function renderDrawer() {
  return render(
    <ToastProvider>
      <ProductionDrawer preparation={salsa} open onClose={vi.fn()} />
    </ToastProvider>,
  )
}

beforeEach(() => {
  state.register.mockReset()
  state.register.mockResolvedValue({ batchId: 'b1', expectedYield: 850, actualYield: 820, totalCost: 10020, unitCost: 12.2195, unitCode: 'g' })
})
afterEach(cleanup)

describe('Preparar lote (ADR 0057)', () => {
  it('shows what goes out once, what comes in and the cost of the batch', () => {
    renderDrawer()
    const out = screen.getByRole('list', { name: 'Lo que se descuenta' })
    expect(out.textContent).toContain('Mayonesa')
    expect(out.textContent).toContain('800 g')
    expect(out.textContent).toContain('$9.600')
    expect(screen.getByText('850 g')).toBeTruthy()
    expect(screen.getByText('$10.020')).toBeTruthy()
    // 10.020 / 850 g; a portion is 25 g.
    expect(screen.getByText(/\$11,79 \/ g · \$295 \/ porción/)).toBeTruthy()
  })

  it('the real yield in kg converts (0,82 kg = 820 g), says the difference and raises the unit cost; saves what was typed', async () => {
    renderDrawer()
    fireEvent.change(screen.getByRole('combobox', { name: 'Unidad del rendimiento' }), { target: { value: 'kg' } })
    const real = screen.getByRole('textbox', { name: /Rendimiento real/ })
    fireEvent.change(real, { target: { value: '0,82' } })
    fireEvent.blur(real)
    expect(screen.getByText(/0,82 kg = 820 g · -3,529 % frente a lo esperado/)).toBeTruthy()
    expect(screen.getByText('820 g')).toBeTruthy()
    expect(screen.getByText(/\$12,22 \/ g/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar lote' }))
    await waitFor(() => expect(state.register).toHaveBeenCalled())
    expect(state.register.mock.calls[0][0]).toEqual({ batches: 1, actualYield: 0.82, yieldUnitId: 'u-kg', observation: null })
  })

  it('three batches need 2,4 kg of mayonnaise and there are 2 kg: it says so and does not let it go', () => {
    renderDrawer()
    const lots = screen.getByRole('textbox', { name: /Lotes/ })
    fireEvent.change(lots, { target: { value: '3' } })
    fireEvent.blur(lots)
    expect(screen.getByText(/No alcanza Mayonesa/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Registrar lote' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
