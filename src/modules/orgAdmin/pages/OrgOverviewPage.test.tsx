// @vitest-environment jsdom
import { OrgAdminCtx, type OrgAdminContext } from '@/shared/org/orgContext'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OrgObservability } from '../api'

// Resumen (ADR 0012): lo que calcula la base, tal cual; sin métricas inventadas.
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
const data: OrgObservability = {
  generatedAt: '2026-09-28T15:00:00Z',
  totals: { accountsActive: 2, accountsInactive: 1, users: 5, activeUsers7d: 3, ordersToday: 14, salesToday: 420000, late: 2, aiErrors24h: 0 },
  accounts: [
    { id: 'k1', name: 'Centro', slug: 'centro', iconKey: 'burger', active: true, timezone: 'America/Bogota', ordersToday: 14, salesToday: 420000, cancelledToday: 1, deliveredToday: 10, ordersWeek: 80, salesWeek: 2400000, inProgress: 3, late: 2, lowStock: 1, aiRuns24h: 5, aiErrors24h: 0, lastActivityAt: '2026-09-28T14:50:00Z' },
  ],
  alerts: [{ severity: 'warning', type: 'late_orders', message: 'Centro: 2 pedidos atrasados ahora', accountId: 'k1' }],
  recentEvents: [{ id: 'e1', createdAt: '2026-09-28T14:00:00Z', eventType: 'role.assigned', category: 'roles', summary: 'Asignó el rol CAJA a Luis en Centro', result: 'success', actor: 'Ana', account: 'Centro' }],
}
vi.mock('../api', async (original) => ({ ...(await original<typeof import('../api')>()), fetchOrgObservability: async () => data }))
const { OrgOverviewPage } = await import('./OrgOverviewPage')

const org: OrgAdminContext = {
  organization: { id: 'o1', slug: 'grupo', name: 'Grupo XYZ', active: true, isOwner: true, isSuperAdmin: true, status: 'active', permissions: ['observability.view'] },
  can: () => true,
  path: (to) => `/o/grupo${to === '/' ? '' : to}`,
  accounts: [],
  isPlatformAdmin: false,
}

afterEach(cleanup)

describe('Resumen', () => {
  it('muestra totales, alertas, cuentas y actividad reciente', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <OrgAdminCtx value={org}>
            <OrgOverviewPage />
          </OrgAdminCtx>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('3 de 5')).toBeTruthy()
    expect(screen.getByText('Centro: 2 pedidos atrasados ahora')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Centro/ }).getAttribute('href')).toBe('/o/grupo/observabilidad?cuenta=k1')
    expect(screen.getByText(/Asignó el rol CAJA a Luis en Centro/)).toBeTruthy()
  })
})
