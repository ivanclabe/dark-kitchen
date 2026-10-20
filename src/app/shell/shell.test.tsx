// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ADR 0072: the sidebar (groups by permission, nested sections, folded), and Buscar y crear.
const state = vi.hoisted(() => ({ perms: new Set<string>() }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/hooks/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'u1', fullName: 'Ana Ruiz', avatarKey: null, active: true }, user: { email: 'ana@correo.com' }, session: null, signOut: vi.fn() }),
}))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({
  useActiveKitchen: () => ({
    kitchen: { id: 'k1', slug: 'centro', name: 'Brasa Centro', roleOptions: [], activeRoleId: 'admin', roleName: 'Administrador', iconKey: null },
    organization: null,
    can: (p: string) => state.perms.has(p),
    canShared: () => false,
    path: (to: string) => `/k/centro${to === '/' ? '' : to}`,
    setActiveRole: vi.fn(),
  }),
  useMyKitchens: () => ({ data: [{ id: 'k1' }] }),
  kitchenPath: (slug: string, to: string) => `/k/${slug}${to}`,
}))
vi.mock('@/modules/notifications/components/NotificationBell', () => ({ NotificationBell: () => <button type="button">Notificaciones</button> }))
vi.mock('../UserMenu', () => ({ UserMenu: () => <button type="button">Menú de usuario</button> }))
vi.mock('@/modules/products/hooks/useProducts', () => ({ useProducts: () => ({ data: [] }) }))
vi.mock('@/modules/customers/api/customers', () => ({ listCustomersPage: async () => ({ rows: [] }) }))
vi.mock('@/modules/orders/api/orders', () => ({ searchOrders: async () => ({ orders: [] }) }))
vi.mock('@/modules/orders/components/NewOrderDrawer', () => ({ NewOrderDrawer: () => <div role="dialog" aria-label="Nuevo pedido" /> }))
vi.mock('@/modules/customers/components/CreateCustomerModal', () => ({ CustomerFormModal: () => null }))
vi.mock('@/modules/supply/components/NewPurchaseDialog', () => ({ NewPurchaseDialog: () => null }))
vi.mock('@/modules/supply/components/CreateIngredientModal', () => ({ CreateIngredientModal: () => null }))

const { Sidebar } = await import('./Sidebar')
const { ShellActionsProvider } = await import('./ShellActions')
const { isSubsectionActive, navSubsections } = await import('./subsections')

function Where() {
  const l = useLocation()
  return <p data-testid="where">{l.pathname + l.search}</p>
}

function renderSidebar(url: string, collapsed = false) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <ShellActionsProvider>
          <Sidebar collapsed={collapsed} />
          <Routes>
            <Route path="*" element={<Where />} />
          </Routes>
        </ShellActionsProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} }))
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('la barra lateral (ADR 0072)', () => {
  it('muestra los módulos del rol, con nombre, en grupos titulados', () => {
    state.perms = new Set(['dashboard.view', 'orders.view', 'inventory.view', 'purchasing.view', 'customers.view'])
    renderSidebar('/k/centro/dashboard')
    const nav = screen.getByRole('navigation', { name: 'Principal' })
    expect(within(nav).getAllByRole('list').map((l) => l.getAttribute('aria-label'))).toEqual(['Operar', 'Vender'])
    expect(within(nav).getByRole('link', { name: 'Inicio' }).getAttribute('aria-current')).toBe('page')
    expect(within(nav).queryByRole('link', { name: 'Finanzas' })).toBeNull()
  })

  it('el módulo abierto muestra sus secciones (las que el rol puede abrir) y marca la actual', () => {
    state.perms = new Set(['inventory.view', 'purchasing.view'])
    renderSidebar('/k/centro/supply/compras/abc')
    const nav = screen.getByRole('navigation', { name: 'Principal' })
    expect(within(nav).getByRole('link', { name: 'Compras' }).getAttribute('aria-current')).toBe('page')
    expect(within(nav).getByRole('link', { name: 'Stock' })).toBeTruthy()
    expect(within(nav).queryByRole('link', { name: 'Proveedores' })).toBeNull()
  })

  it('plegada: solo íconos, cada uno con su nombre accesible', () => {
    state.perms = new Set(['dashboard.view', 'customers.view'])
    renderSidebar('/k/centro/dashboard', true)
    const nav = screen.getByRole('navigation', { name: 'Principal' })
    expect(within(nav).getByRole('link', { name: 'Clientes' }).textContent).toBe('')
    expect(screen.getByRole('button', { name: 'Buscar y crear' })).toBeTruthy()
  })
})

describe('Buscar y crear (ADR 0072)', () => {
  it('⌘K la abre; crea solo lo que el rol puede; Enter abre la primera opción y Escape cierra', () => {
    state.perms = new Set(['dashboard.view', 'orders.create', 'inventory.view', 'purchasing.view'])
    renderSidebar('/k/centro/dashboard')
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const dialog = screen.getByRole('dialog', { name: 'Buscar y crear' })
    const options = within(dialog).getAllByRole('option').map((o) => o.textContent)
    expect(options).toContain('Nuevo pedido')
    expect(options).not.toContain('Nuevo cliente')
    const input = within(dialog).getByRole('combobox')
    fireEvent.change(input, { target: { value: 'compras' } })
    expect(within(dialog).getAllByRole('option')[0].textContent).toContain('Abastecimiento › Compras')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByTestId('where').textContent).toBe('/k/centro/supply/compras')
    expect(screen.queryByRole('dialog', { name: 'Buscar y crear' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Buscar y crear/ }))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'nuevo ped' } })
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    expect(screen.getByRole('dialog', { name: 'Nuevo pedido' })).toBeTruthy()
  })
})

describe('secciones de cada módulo', () => {
  it('Operación por ?view= y Usuarios por la ruta más específica', () => {
    const subs = navSubsections({ can: (p) => ['orders.view', 'kitchen.view'].includes(p), canShared: () => false })
    const ops = subs['/operations']
    expect(ops.map((s) => s.label)).toEqual(['Tablero', 'Cocina', 'Lista'])
    expect(isSubsectionActive(ops[1], '/operations', '?view=kitchen', ops)).toBe(true)
    expect(isSubsectionActive(ops[0], '/operations', '?view=kitchen', ops)).toBe(false)
    const users = subs['/users']
    expect(isSubsectionActive(users[0], '/users/roles', '', users)).toBe(false)
    expect(isSubsectionActive(users[1], '/users/roles', '', users)).toBe(true)
  })
})
