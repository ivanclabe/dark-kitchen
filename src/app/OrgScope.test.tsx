// @vitest-environment jsdom
import { getActiveKitchenId, getActiveRoleId, setActiveKitchenId, setActiveRoleId } from '@/shared/kitchen/activeKitchen'
import type { MyContext } from '@/shared/kitchen/kitchensApi'
import { useOrgAdmin } from '@/shared/org/orgContext'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

// OrgScope (ADR 0012): la organización se resuelve contra las MÍAS; sin Cuenta activa.
const state = vi.hoisted(() => ({ ctx: null as MyContext | null }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', async (original) => ({
  ...(await original<typeof import('@/shared/kitchen/activeKitchenContext')>()),
  useMyContext: () => ({ data: state.ctx, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}))

const { OrgScope } = await import('./OrgScope')

const ctx = (orgPermissions: string[]): MyContext => ({
  profile: { id: 'u1', fullName: 'Ana', avatarKey: null, active: true, isPlatformAdmin: false, lastAccountId: null },
  accountPermissions: [],
  organizations: [{ id: 'o1', slug: 'grupo', tenantCode: 'GR8P2X', name: 'Grupo XYZ', active: true, isOwner: true, isSuperAdmin: true, status: 'active', permissions: orgPermissions }],
  accounts: [{ id: 'k1', slug: 'centro', name: 'Centro', organizationId: 'o1', iconKey: null, active: true, superAdmin: true, defaultRoleId: null, roles: [] }],
})

function Probe() {
  const { organization, accounts, path } = useOrgAdmin()
  return (
    <p>
      {organization.name} · {accounts.length} · {path('/equipos')}
    </p>
  )
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/o/:orgSlug" element={<OrgScope />}>
          <Route index element={<Probe />} />
        </Route>
        <Route path="/cuentas" element={<p>Tus cuentas</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(cleanup)

describe('OrgScope', () => {
  it('con permisos de administración: entra y no queda Cuenta ni rol activos', () => {
    setActiveKitchenId('k-anterior')
    setActiveRoleId('rol-anterior')
    state.ctx = ctx(['organization.view', 'users.view'])
    renderAt('/o/grupo')
    expect(screen.getByText('Grupo XYZ · 1 · /o/grupo/equipos')).toBeTruthy()
    expect(getActiveKitchenId()).toBeNull()
    expect(getActiveRoleId()).toBeNull()
  })

  it('una organización ajena (slug manipulado) lleva a "Tus cuentas"', () => {
    state.ctx = ctx(['organization.view', 'users.view'])
    renderAt('/o/otra-organizacion')
    expect(screen.getByText('Tus cuentas')).toBeTruthy()
  })

  it('un miembro sin permisos de administración no entra', () => {
    state.ctx = ctx(['organization.view'])
    renderAt('/o/grupo')
    expect(screen.getByText('Tus cuentas')).toBeTruthy()
  })
})
