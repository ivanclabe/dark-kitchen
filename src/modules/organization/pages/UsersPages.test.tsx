// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/Toast'

// ADR 0026: Usuarios in the same shell as Configuración. No network.
const state = vi.hoisted(() => ({ perms: [] as string[], shared: [] as string[] }))
const role = { id: 'r1', key: 'ADMIN', name: 'Administrador', description: null, isSystem: true, permissions: ['team.view'] }
const user = { userId: 'u1', fullName: 'Ana Ruiz', email: 'ana@prueba.test', avatarKey: null, status: 'active', isMe: false, isOwner: false, isSuperAdmin: false, accounts: [{ kitchenId: 'k1', kitchenName: 'Centro', active: true, roleIds: ['r1'], defaultRoleId: 'r1' }] }
const query = <T,>(data: T) => ({ data, isLoading: false, error: null, refetch: vi.fn() })

vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({
  useActiveKitchen: () => ({
    kitchen: { id: 'k1', name: 'Brasa Centro', slug: 'centro', organizationId: 'o1', iconKey: null, active: true, permissions: new Set(state.perms) },
    organization: { id: 'o1' },
    can: (p: string) => state.perms.includes(p),
    canShared: (p: string) => state.shared.includes(p),
    path: (to: string) => `/k/centro${to}`,
  }),
}))
vi.mock('../hooks/useOrganization', async (original) => ({
  ...(await original<typeof import('../hooks/useOrganization')>()),
  useAccountUsers: () => query([user]),
  useOrgRoles: () => query([role]),
  usePermissionCatalog: () => query([]),
  useRoleUsage: () => query({ accountCount: 1, accountsByRole: {} }),
}))

const { RolesPage, UsersLayout, UsersPage } = await import('./UsersAndPermissionsPage')

function renderAt(url: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/k/centro/users" element={<UsersLayout />}>
            <Route index element={<UsersPage />} />
            <Route path="roles" element={<RolesPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

afterEach(cleanup)

describe('Usuarios (ADR 0026)', () => {
  it('same shell as Configuración: header, navigation with Usuarios and Roles y permisos, section header', () => {
    state.perms = ['team.view', 'team.manage']
    renderAt('/k/centro/users')
    expect(screen.getByRole('heading', { level: 1, name: 'Usuarios' })).toBeTruthy()
    const nav = screen.getByRole('navigation', { name: 'Secciones de usuarios' })
    const desktop = nav.querySelector('ul.lg\\:block')!
    expect([...desktop.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['Usuarios', 'Roles y permisos'])
    expect(desktop.querySelector('a[aria-current="page"]')?.textContent).toBe('Usuarios')
    expect(screen.getByText('1 persona trabaja en esta cuenta.')).toBeTruthy()
    // The main action sits in the section header.
    expect(screen.getByRole('button', { name: 'Crear usuario' })).toBeTruthy()
    expect(screen.getByText('Ana Ruiz')).toBeTruthy()
  })

  it('without team.manage there is no «Crear usuario»', () => {
    state.perms = ['team.view']
    renderAt('/k/centro/users')
    expect(screen.queryByRole('button', { name: 'Crear usuario' })).toBeNull()
  })

  it('Roles y permisos is its own section; the old ?tab=roles lands there', () => {
    state.perms = ['team.view']
    renderAt('/k/centro/users?tab=roles')
    expect(screen.getByRole('heading', { level: 2, name: 'Roles y permisos' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Plantillas del sistema' })).toBeTruthy()
    const desktop = screen.getByRole('navigation', { name: 'Secciones de usuarios' }).querySelector('ul.lg\\:block')!
    expect(desktop.querySelector('a[aria-current="page"]')?.textContent).toBe('Roles y permisos')
  })
})
