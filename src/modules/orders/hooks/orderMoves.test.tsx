// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { OrderItem } from '../types'

// ADR 0031: moving an order is still one RPC per item (the same logic), but the screens refresh once.
const calls = vi.hoisted(() => ({ advance: [] as string[], revert: [] as string[] }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('../api/orderItems', () => ({
  advanceKitchenItem: async (id: string) => void calls.advance.push(id),
  revertKitchenItem: async (id: string) => void calls.revert.push(id),
  addOrderItem: vi.fn(),
  removeOrderItem: vi.fn(),
}))

const { useAdvanceOrderItems, useRevertOrderItems } = await import('./useOrders')

const item = (id: string, kitchenStatus: OrderItem['kitchenStatus']): OrderItem => ({ id, productId: 'p', productName: 'Plato', quantity: 1, unitPrice: 1, lineTotal: 1, observation: null, kitchenStatus })

function setup() {
  const client = new QueryClient()
  const spy = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { spy, wrapper }
}
const ordersRefreshes = (spy: ReturnType<typeof setup>['spy']) => spy.mock.calls.filter(([f]) => JSON.stringify(f?.queryKey) === '["orders"]').length

describe('moving an order between stages (ADR 0031)', () => {
  it('Marcar listo: each item the steps it needs, one refresh at the end', async () => {
    calls.advance = []
    const { spy, wrapper } = setup()
    const { result } = renderHook(() => useAdvanceOrderItems(), { wrapper })
    await act(() => result.current.advanceOrderItems([item('a', 'PENDIENTE'), item('b', 'EN_PREPARACION'), item('c', 'LISTO')], 'LISTO'))
    expect(calls.advance).toEqual(['a', 'a', 'b'])
    expect(ordersRefreshes(spy)).toBe(1)
  })

  it('Iniciar: only what is waiting', async () => {
    calls.advance = []
    const { wrapper } = setup()
    const { result } = renderHook(() => useAdvanceOrderItems(), { wrapper })
    await act(() => result.current.advanceOrderItems([item('a', 'PENDIENTE'), item('b', 'EN_PREPARACION')], 'EN_PREPARACION'))
    expect(calls.advance).toEqual(['a'])
  })

  it('back to the queue: up to two steps per item, one refresh', async () => {
    calls.revert = []
    const { spy, wrapper } = setup()
    const { result } = renderHook(() => useRevertOrderItems(), { wrapper })
    await act(() => result.current.revertOrderItems([item('a', 'LISTO'), item('b', 'EN_PREPARACION'), item('c', 'PENDIENTE')], 'PENDIENTE'))
    expect(calls.revert).toEqual(['a', 'a', 'b'])
    expect(ordersRefreshes(spy)).toBe(1)
  })
})
