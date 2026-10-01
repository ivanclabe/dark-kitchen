// @vitest-environment jsdom
import { OrgAdminCtx, type OrgAdminContext } from '@/shared/org/orgContext'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuditEvent } from '../api'

// Bitácora (ADR 0012): filtros y "Cargar más" con cursor, sin red.
const fetchOrgEvents = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('../api', async (original) => ({ ...(await original<typeof import('../api')>()), fetchOrgEvents }))
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

const org: OrgAdminContext = {
  organization: { id: 'o1', slug: 'grupo', tenantCode: 'GR8P2X', name: 'Grupo XYZ', active: true, isOwner: true, isSuperAdmin: true, status: 'active', permissions: ['observability.view'] },
  can: () => true,
  path: (to) => `/o/grupo${to}`,
  accounts: [],
  isPlatformAdmin: false,
}

afterEach(cleanup)

describe('bitácora', () => {
  it('muestra quién, qué y dónde, marca los fallos y pagina con cursor', async () => {
    fetchOrgEvents
      .mockResolvedValueOnce({ events: [ev('2', 'Asignó el rol ADMIN a Juan en Centro'), ev('1', 'Falló el análisis de IA', { result: 'failure', category: 'ai', source: 'edge' })], hasMore: true })
      .mockResolvedValueOnce({ events: [ev('0', 'Creó la cuenta Centro', { category: 'accounts' })], hasMore: false })
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <OrgAdminCtx value={org}>
          <EventLog />
        </OrgAdminCtx>
      </QueryClientProvider>,
    )
    expect(await screen.findByText(/Asignó el rol ADMIN a Juan en Centro/)).toBeTruthy()
    expect(screen.getByText('Falló')).toBeTruthy()
    expect(screen.getByText('Servicio de IA')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Cargar más' }))
    expect(await screen.findByText(/Creó la cuenta Centro/)).toBeTruthy()
    // La segunda página se pide desde el último evento de la primera.
    expect(fetchOrgEvents.mock.calls[1][2]).toEqual({ at: '2026-09-28T11:00:00Z', id: '1' })
    expect(screen.queryByRole('button', { name: 'Cargar más' })).toBeNull()
  })
})
