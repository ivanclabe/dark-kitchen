// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { MenuPlanItem } from '../types'

// ADR 0018: the week shows a dropped dish at once and goes back if the database refuses.
const api = vi.hoisted(() => ({ add: vi.fn(), remove: vi.fn(), list: vi.fn() }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('../api/menuPlan', async (original) => ({
  ...(await original<typeof import('../api/menuPlan')>()),
  addMenuPlanItem: api.add,
  removeMenuPlanItem: api.remove,
  listMenuPlanRange: api.list,
}))
const { useAddMenuPlanItem, useRemoveMenuPlanItem } = await import('./useMenuPlan')

const item = (over: Partial<MenuPlanItem>): MenuPlanItem => ({
  id: 'i1', planDate: '2026-10-05', productId: 'p1', productName: 'Bandeja', productPrice: 20000, productCategory: null, productActive: true,
  productImagePath: null, displayOrder: 0, isActive: true, startTime: null, endTime: null, specialPrice: null, unitLimit: null, whileSuppliesLast: false, ...over,
})

function setup(initial: MenuPlanItem[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } })
  const key = ['menu-plan', '2026-10-05', '2026-10-12']
  client.setQueryData(key, initial)
  api.list.mockResolvedValue(initial)
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, key, wrapper }
}

const product = { productName: 'Ajiaco', productPrice: 18000, productCategory: 'Sopas', productActive: true, productImagePath: null }

describe('menu plan, optimistic (ADR 0018)', () => {
  it('a dropped dish is in the week before the database answers', async () => {
    const { client, key, wrapper } = setup([item({})])
    let resolve!: () => void
    api.add.mockReturnValue(new Promise<void>((r) => (resolve = r)))
    const { result } = renderHook(() => useAddMenuPlanItem(), { wrapper })
    act(() => result.current.mutate({ planDate: '2026-10-06', input: { productId: 'p2', displayOrder: 0 }, product }))
    await waitFor(() => expect(client.getQueryData<MenuPlanItem[]>(key)?.map((i) => i.productName)).toEqual(['Bandeja', 'Ajiaco']))
    resolve()
  })

  it('outside the loaded range nothing is drawn', async () => {
    const { client, key, wrapper } = setup([])
    api.add.mockReturnValue(new Promise<void>(() => {}))
    const { result } = renderHook(() => useAddMenuPlanItem(), { wrapper })
    act(() => result.current.mutate({ planDate: '2026-11-01', input: { productId: 'p2' }, product }))
    await new Promise((r) => setTimeout(r, 20))
    expect(client.getQueryData<MenuPlanItem[]>(key)).toEqual([])
  })

  it('if the database refuses, the week goes back', async () => {
    const { client, key, wrapper } = setup([item({})])
    api.add.mockRejectedValue(new Error('duplicate'))
    api.list.mockResolvedValue([item({})])
    const { result } = renderHook(() => useAddMenuPlanItem(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ planDate: '2026-10-06', input: { productId: 'p2' }, product }).catch(() => undefined)
    })
    await waitFor(() => expect(client.getQueryData<MenuPlanItem[]>(key)?.map((i) => i.productName)).toEqual(['Bandeja']))
  })

  it('removing takes the dish off at once', async () => {
    const { client, key, wrapper } = setup([item({}), item({ id: 'i2', productId: 'p2', productName: 'Ajiaco' })])
    api.remove.mockReturnValue(new Promise<void>(() => {}))
    const { result } = renderHook(() => useRemoveMenuPlanItem(), { wrapper })
    act(() => result.current.mutate('i1'))
    await waitFor(() => expect(client.getQueryData<MenuPlanItem[]>(key)?.map((i) => i.id)).toEqual(['i2']))
  })
})
