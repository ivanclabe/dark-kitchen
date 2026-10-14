// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// A preparation can be kept in kg or l too (a stock made by the litre); recipes and dishes still write it in g or ml.
const state = vi.hoisted(() => ({ create: vi.fn(async () => 'nueva') }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('../hooks/usePreparations', () => ({ useCreatePreparation: () => ({ mutateAsync: state.create, isPending: false }) }))
vi.mock('@/shared/hooks/useUnits', () => ({
  useUnits: () => ({
    data: ['g', 'kg', 'ml', 'l', 'unidad'].map((code) => ({ id: `u-${code}`, code, name: code, unitType: 'WEIGHT', factorToBase: 1 })),
  }),
}))

const { NewPreparationDrawer } = await import('./NewPreparationDrawer')

afterEach(cleanup)

describe('Nueva preparación', () => {
  it('offers g, kg, ml, l and units, and creates it in litres', async () => {
    const onCreated = vi.fn()
    render(<NewPreparationDrawer open onClose={vi.fn()} onCreated={onCreated} />)
    const base = screen.getByRole('combobox', { name: /Se guarda en/ }) as HTMLSelectElement
    expect([...base.options].map((o) => o.value)).toEqual(['g', 'kg', 'ml', 'l', 'unidad'])
    fireEvent.change(screen.getByRole('textbox', { name: /Nombre/ }), { target: { value: 'Aguapanela' } })
    fireEvent.change(base, { target: { value: 'l' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear y escribir su receta' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('nueva'))
    expect(state.create).toHaveBeenCalledWith({ name: 'Aguapanela', baseUnitId: 'u-l', code: null })
  })
})
