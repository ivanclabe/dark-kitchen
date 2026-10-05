// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

// ADR 0026: the Configuración layout and the IA y voz sub-navigation, by permissions. No network.
const state = vi.hoisted(() => ({ perms: [] as string[], shared: [] as string[] }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({
  useActiveKitchen: () => ({
    kitchen: { id: 'k1', name: 'Brasa Centro', slug: 'centro', organizationId: 'o1' },
    organization: { id: 'o1' },
    can: (p: string) => state.perms.includes(p),
    canShared: (p: string) => state.shared.includes(p),
    path: (to: string) => `/k/centro${to}`,
    feature: () => null,
    features: [],
  }),
}))
vi.mock('@/modules/organization/components/FeaturesPanel', () => ({ FeaturesPanel: () => <p>features-panel</p> }))
vi.mock('../components/AiStatusPanel', () => ({ AiStatusPanel: () => <p>status-panel</p> }))
vi.mock('../api', async (original) => ({ ...(await original<typeof import('../api')>()), fetchAccountAiUsage: () => new Promise(() => {}) }))

const { SettingsLayout } = await import('./SettingsLayout')
const { AiSettingsPage } = await import('./AiSettingsPage')
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')

function Where() {
  const location = useLocation()
  return <p data-testid="where">{location.pathname + location.search}</p>
}

function renderAt(url: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/k/centro/settings" element={<SettingsLayout />}>
            <Route path="ai" element={<AiSettingsPage />} />
            <Route path="general" element={<p>general-page</p>} />
            <Route path="activity" element={<p>activity-page</p>} />
          </Route>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(cleanup)

describe('Configuración layout (ADR 0026)', () => {
  it('one navigation with the sections of the role, marking the current one', () => {
    state.perms = ['settings.manage', 'audit.view']
    state.shared = []
    renderAt('/k/centro/settings/general')
    const nav = screen.getByRole('navigation', { name: 'Secciones de configuración' })
    const links = [...nav.querySelectorAll('ul.lg\\:block a')].map((a) => a.textContent)
    expect(links).toEqual(['General', 'IA y voz', 'Integraciones', 'Actividad'])
    expect(nav.querySelector('ul.lg\\:block a[aria-current="page"]')?.textContent).toBe('General')
    expect(screen.getByText('general-page')).toBeTruthy()
  })

  it('a section the role cannot open goes to the first one it can', () => {
    state.perms = ['audit.view']
    state.shared = []
    renderAt('/k/centro/settings/general')
    expect(screen.getByText('activity-page')).toBeTruthy()
    expect(screen.queryByText('general-page')).toBeNull()
  })
})

describe('IA y voz sub-navigation (ADR 0026, D3)', () => {
  it('whoever manages the features: Funciones · Este dispositivo · Uso y estado', () => {
    state.perms = ['settings.manage']
    state.shared = ['features.manage']
    renderAt('/k/centro/settings/ai')
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Funciones', 'Este dispositivo', 'Uso y estado'])
    expect(screen.getByText('features-panel')).toBeTruthy()
  })

  it('old tabs land on their new place (voice → Funciones, status → Uso y estado)', () => {
    state.perms = ['settings.manage']
    state.shared = ['features.manage']
    renderAt('/k/centro/settings/ai?tab=status')
    expect(screen.getByRole('tab', { name: 'Uso y estado' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('status-panel')).toBeTruthy()
    cleanup()
    renderAt('/k/centro/settings/ai?tab=voice')
    expect(screen.getByRole('tab', { name: 'Funciones' }).getAttribute('aria-selected')).toBe('true')
  })

  it('the account administrator only has this device: no sub-navigation', () => {
    state.perms = ['settings.manage']
    state.shared = []
    renderAt('/k/centro/settings/ai')
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByText(/no hay nada que ajustar en este equipo/)).toBeTruthy()
  })
})
