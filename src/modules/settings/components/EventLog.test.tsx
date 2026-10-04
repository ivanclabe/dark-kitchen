// @vitest-environment jsdom
import { ActiveKitchenContext, buildActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import type { MyKitchen } from '@/shared/kitchen/kitchensApi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuditEvent } from '../api'

// Bitácora de la cuenta (ADR 0012, ADR 0024): "Cargar más" con cursor, sin red y sin filtro de otras cuentas.
const fetchAccountEvents = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('../api', async (original) => ({ ...(await original<typeof import('../api')>()), fetchAccountEvents }))
const { EventLog } = await import('./EventLog')

const ev = (id: string, summary: string, over: Partial<AuditEvent> = {}): AuditEvent => ({
  id,
  createdAt: `2026-09-28T1${id}:00:00Z`,
  eventType: 'role.assigned',
  category: 'roles',
  summary,
  result: 'success',
  source: 'db',
  action: 'INSERT',
  table: 'dk_member_roles',
  recordKey: id,
  context: {},
  actor: { id: 'u1', name: 'Ana', avatarKey: null },
  account: { id: 'k1', name: 'Centro', iconKey: null },
  changes: null,
  ...over,
})

const kitchen = { id: 'k1', slug: 'centro', name: 'Centro', permissions: new Set(['audit.view']), roleOptions: [] } as unknown as MyKitchen

afterEach(cleanup)

describe('bitácora', () => {
  it('muestra quién, qué y dónde, marca los fallos y pagina con cursor', async () => {
    fetchAccountEvents
      .mockResolvedValueOnce({ events: [ev('2', 'Asignó el rol ADMIN a Juan en Centro'), ev('1', 'Falló el análisis de IA', { result: 'failure', category: 'ai', source: 'edge' })], hasMore: true })
      .mockResolvedValueOnce({ events: [ev('0', 'Creó la cuenta Centro', { category: 'accounts' })], hasMore: false })
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ActiveKitchenContext value={buildActiveKitchen(kitchen)}>
          <EventLog />
        </ActiveKitchenContext>
      </QueryClientProvider>,
    )
    expect(await screen.findByText(/Asignó el rol ADMIN a Juan en Centro/)).toBeTruthy()
    expect(screen.getByText('Falló')).toBeTruthy()
    expect(screen.getByText('Servicio de IA')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Cargar más' }))
    expect(await screen.findByText(/Creó la cuenta Centro/)).toBeTruthy()
    // La segunda página se pide desde el último evento de la primera.
    expect(fetchAccountEvents.mock.calls[1][1]).toEqual({ at: '2026-09-28T11:00:00Z', id: '1' })
    expect(screen.queryByRole('button', { name: 'Cargar más' })).toBeNull()
    // Only this account: there is no account filter.
    expect(screen.queryByRole('combobox', { name: 'Filtrar por cuenta' })).toBeNull()
  })
})
