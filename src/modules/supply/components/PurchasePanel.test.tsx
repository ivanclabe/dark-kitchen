// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Purchase } from '../types'

// ADR 0030 D5: purchases load 50 at a time with «Cargar más», and say when not all are loaded.
const state = vi.hoisted(() => ({ limits: [] as number[], total: 0 }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({ useActiveKitchen: () => ({ can: () => true }) }))
vi.mock('../hooks/usePurchases', () => ({
  PURCHASES_PAGE: 50,
  usePurchases: (limit: number) => {
    state.limits.push(limit)
    const rows: Purchase[] = Array.from({ length: Math.min(limit, state.total) }, (_, i) => ({
      id: `p${i}`, supplierId: 's1', supplierName: `Proveedor ${i}`, invoiceNumber: `F-${i}`, invoiceDate: '2026-10-01', status: 'CONFIRMADA', subtotal: 1000, tax: 0, total: 1000, notes: null,
    }))
    return { data: { rows, hasMore: state.total > limit }, isLoading: false, isFetching: false, isError: false, error: null, refetch: vi.fn() }
  },
}))

const { PurchasePanel } = await import('./PurchasePanel')

beforeEach(() => {
  state.limits = []
})
afterEach(cleanup)

describe('Compras paginadas (ADR 0030)', () => {
  it('loads the 50 most recent, warns, and «Cargar más» asks for the next 50', () => {
    state.total = 120
    render(<PurchasePanel selectedId={null} onSelect={vi.fn()} onCreate={vi.fn()} />)
    expect(state.limits.at(-1)).toBe(50)
    expect(screen.getAllByText(/^Proveedor /)).toHaveLength(50)
    expect(screen.getByText(/Mostrando las 50 compras más recientes/)).toBeTruthy()
    // The counts would lie with part of the list: they are hidden while there is more.
    expect(screen.getByRole('button', { name: 'Todas' }).textContent).toBe('Todas')
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }))
    expect(state.limits.at(-1)).toBe(100)
  })

  it('with everything loaded, no notice and the counts are back', () => {
    state.total = 3
    render(<PurchasePanel selectedId={null} onSelect={vi.fn()} onCreate={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Cargar más' })).toBeNull()
    expect(screen.getByRole('button', { name: /Todas/ }).textContent).toBe('Todas3')
  })
})
