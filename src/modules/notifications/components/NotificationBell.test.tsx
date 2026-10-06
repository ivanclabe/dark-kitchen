// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NotificationFeed } from '../types'
import { NotificationBell } from './NotificationBell'

const calls = vi.hoisted(() => ({ marked: [] as string[][] }))
const feed: NotificationFeed = {
  generatedAt: '2026-10-06T15:20:00Z',
  unread: 2,
  items: [
    { key: 'late_orders:2026-10-06:3', group: 'operation', type: 'late_orders', severity: 'warning', title: '3 pedidos atrasados', detail: 'Superaron el tiempo objetivo.', to: '/operations?view=kitchen', action: 'Ver en Cocina', at: '2026-10-06T15:20:00Z', ongoing: true, read: false },
    { key: 'ai:kitchen_insights:x:alta', group: 'ai', type: 'kitchen_insights', severity: 'warning', title: 'Despachar pedido 1015', detail: 'Listo hace 20 min.', source: 'Sugerencias de Cocina en vivo', to: '/operations/x', action: 'Ver en Cocina', at: '2026-10-06T15:10:00Z', ongoing: false, read: false },
    { key: 'low_stock:2026-10-06:1', group: 'operation', type: 'low_stock', severity: 'warning', title: '1 insumo bajo el mínimo', detail: null, to: '/supply/stock?filter=low', action: 'Ver stock', at: '2026-10-06T15:20:00Z', ongoing: true, read: true },
  ],
}

vi.mock('../api', () => ({
  fetchNotifications: async () => feed,
  markNotificationsRead: async (keys: string[]) => {
    calls.marked.push(keys)
  },
}))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({ useActiveKitchen: () => ({ kitchen: { id: 'k1' }, path: (p: string) => `/k/demo${p}` }) }))

afterEach(() => {
  cleanup()
  calls.marked = []
})

function Where() {
  const l = useLocation()
  return <p data-testid="where">{l.pathname + l.search}</p>
}

function renderBell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NotificationBell placement="right-end" />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('the bell (ADR 0037)', () => {
  it('counts the unread and lists them, the AI ones tagged', async () => {
    renderBell()
    const bell = await screen.findByRole('button', { name: 'Notificaciones: 2 sin leer' })
    expect(within(bell).getByText('2')).toBeTruthy()
    fireEvent.click(bell)
    const panel = screen.getByRole('dialog', { name: 'Notificaciones' })
    expect(within(panel).getByText('3 pedidos atrasados')).toBeTruthy()
    expect(within(panel).getByText(/IA · Sugerencias de Cocina en vivo/)).toBeTruthy()
    fireEvent.click(within(panel).getByRole('tab', { name: /IA/ }))
    expect(within(panel).queryByText('3 pedidos atrasados')).toBeNull()
    expect(within(panel).getByText('Despachar pedido 1015')).toBeTruthy()
  })

  it('opening a notice marks it seen and goes to its screen in the account', async () => {
    renderBell()
    fireEvent.click(await screen.findByRole('button', { name: 'Notificaciones: 2 sin leer' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /3 pedidos atrasados/ }))
    await waitFor(() => expect(calls.marked).toEqual([['late_orders:2026-10-06:3']]))
    expect(screen.getByTestId('where').textContent).toBe('/k/demo/operations?view=kitchen')
  })

  it('«Marcar todo como leído» marks the unread ones of the tab', async () => {
    renderBell()
    fireEvent.click(await screen.findByRole('button', { name: 'Notificaciones: 2 sin leer' }))
    fireEvent.click(screen.getByRole('button', { name: /Marcar todo como leído/ }))
    await waitFor(() => expect(calls.marked).toEqual([['late_orders:2026-10-06:3', 'ai:kitchen_insights:x:alta']]))
    expect(await screen.findByRole('button', { name: 'Notificaciones' })).toBeTruthy()
  })
})
