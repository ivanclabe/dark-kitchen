// @vitest-environment jsdom
import { ToastProvider } from '@/shared/ui/Toast'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

// ADR 0023 / ADR 0024: the user menu, by permissions, with Apariencia and Ayuda, and no "organización".
const state = vi.hoisted(() => ({ perms: new Set<string>(), orgPerms: [] as string[] }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/hooks/useAuth', () => ({
  useAuth: () => ({
    profile: { id: 'u1', fullName: 'Ana Ruiz', avatarKey: null, active: true, isSuperadmin: false },
    user: { email: 'ana@correo.com' },
    session: { user: { last_sign_in_at: '2026-10-02T13:00:00Z' }, expires_at: 1790950000 },
    signOut: vi.fn(),
  }),
}))
const role = (id: string, name: string, permissions: string[]) => ({ id, key: id, name, isSystem: true, permissions })
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({
  useActiveKitchen: () => ({
    kitchen: {
      id: 'k1', slug: 'brasa-centro', name: 'Brasa Centro', organizationId: 'o1', organizationName: 'Dark Kitchen',
      roleOptions: [role('admin', 'Administrador', ['dashboard.view']), role('kitchen', 'Cocina', ['kitchen.view'])],
      activeRoleId: 'admin', roleName: 'Administrador',
    },
    organization: { id: 'o1', slug: 'dark-kitchen', tenantCode: 'FR3RK6', name: 'Dark Kitchen', active: true, isOwner: true, isSuperAdmin: true, status: 'active', permissions: state.orgPerms },
    can: (p: string) => state.perms.has(p),
    canShared: (p: string) => state.orgPerms.includes(p),
    path: (to: string) => `/k/brasa-centro${to}`,
    setActiveRole: vi.fn(),
  }),
  useMyKitchens: () => ({
    data: [
      { id: 'k1', slug: 'brasa-centro', name: 'Brasa Centro', organizationId: 'o1', roleName: 'Administrador', active: true },
      // An account of another business: same list, no grouping.
      { id: 'k9', slug: 'julian', name: 'Julian Hamburguesas', organizationId: 'o2', roleName: 'Cajero', active: true },
    ],
  }),
  kitchenPath: (slug: string, to: string) => `/k/${slug}${to}`,
}))
vi.mock('@/modules/copilot/copilotContext', () => ({ useCopilot: () => ({ available: true, open: vi.fn() }) }))
const { UserMenu } = await import('./UserMenu')

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function openMenu(perms: string[], orgPerms: string[] = []) {
  state.perms = new Set(perms)
  state.orgPerms = orgPerms
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} }))
  render(
    <MemoryRouter>
      <ToastProvider>
        <UserMenu placement="right-end" />
      </ToastProvider>
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: /Menú de usuario/ }))
}

describe('UserMenu (ADR 0023)', () => {
  it('who I am, role and account; all your accounts in one list, without "organización"', () => {
    openMenu([], ['users.view', 'billing.view'])
    expect(screen.getByText('Ana Ruiz')).toBeTruthy()
    expect(screen.getByText('Cambiar de rol')).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: /Brasa Centro/ }))
    expect(screen.getByText('FR3RK6')).toBeTruthy()
    expect(screen.getByRole('menuitemradio', { name: /Brasa Centro/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('menuitemradio', { name: /Julian Hamburguesas/ })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/organizaci/i)
  })

  it('one link to the account settings (ADR 0026); Usuarios lives in the rail', () => {
    openMenu([])
    expect(screen.queryByRole('menuitem', { name: 'Configuración de la cuenta' })).toBeNull()
    cleanup()
    openMenu(['settings.manage', 'team.view'], ['billing.view'])
    expect(screen.getByRole('menuitem', { name: 'Configuración de la cuenta' }).getAttribute('aria-haspopup')).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Usuarios' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Roles y permisos' })).toBeNull()
  })

  it('Apariencia changes the theme on this device without closing the menu', () => {
    openMenu([])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Apariencia' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Claro (beta)' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(screen.getByRole('menuitemradio', { name: 'Claro (beta)' }).getAttribute('aria-checked')).toBe('true')
  })

  it('Ayuda: shortcuts window and the help center always; support contact hidden while not configured', () => {
    openMenu([])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ayuda y soporte' }))
    expect(screen.queryByRole('menuitem', { name: /Escribir a soporte|WhatsApp/ })).toBeNull()
    expect(screen.getByRole('menuitem', { name: /Centro de ayuda/ })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /Preguntar a Copilot/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Atajos de teclado' }))
    expect(screen.getByRole('dialog', { name: 'Atajos de teclado' })).toBeTruthy()
  })

  it('Detalles de la sesión show where I am, without secrets', () => {
    openMenu([])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Detalles de la sesión' }))
    const dialog = screen.getByRole('dialog', { name: 'Detalles de la sesión' })
    expect(dialog.textContent).toContain('FR3RK6 · Dark Kitchen')
    expect(dialog.textContent).toContain('Brasa Centro (brasa-centro)')
    expect(dialog.textContent).not.toMatch(/token/i)
  })
})
