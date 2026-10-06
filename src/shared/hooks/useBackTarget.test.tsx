// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { useCameFrom, useHere } from './useBackTarget'

const at = (entry: string | { pathname: string; search?: string; state?: unknown }) => ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>
)

describe('«Volver» to where the person was (ADR 0030, ADR 0031)', () => {
  it('names the screen a link leaves from', () => {
    expect(renderHook(() => useHere(), { wrapper: at('/k/centro/operations/o1?view=kitchen') }).result.current).toEqual({ to: '/k/centro/operations/o1?view=kitchen', label: 'Pedido' })
    expect(renderHook(() => useHere(), { wrapper: at('/k/centro/operations?view=list') }).result.current.label).toBe('Operación')
    expect(renderHook(() => useHere(), { wrapper: at('/k/centro/customers/c1') }).result.current.label).toBe('Cliente')
    expect(renderHook(() => useHere(), { wrapper: at('/k/centro/supply/stock/i1') }).result.current.label).toBe('Abastecimiento')
    expect(renderHook(() => useHere('Insights'), { wrapper: at('/k/centro/insights') }).result.current.label).toBe('Insights')
  })

  it('reads the origin without the account prefix, and only inside the app', () => {
    expect(renderHook(() => useCameFrom(), { wrapper: at({ pathname: '/k/centro/supply/stock/i1', state: { from: { to: '/k/centro/recipes/p1', label: 'Receta' } } }) }).result.current).toEqual({ to: '/recipes/p1', label: 'Receta' })
    expect(renderHook(() => useCameFrom(), { wrapper: at({ pathname: '/k/centro/supply', state: { from: { to: 'https://x.test', label: 'X' } } }) }).result.current).toBeNull()
    expect(renderHook(() => useCameFrom(), { wrapper: at('/k/centro/supply') }).result.current).toBeNull()
  })
})
