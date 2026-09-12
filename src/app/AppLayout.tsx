import { useAuth } from '@/shared/hooks/useAuth'
import { canAccessModule, type ModuleKey } from '@/shared/rbac/roles'
import { NavLink, Outlet } from 'react-router-dom'

const NAV_ITEMS: Array<{ to: string; label: string; module: ModuleKey }> = [
  { to: '/', label: 'Dashboard', module: 'dashboard' },
  { to: '/orders', label: 'Pedidos', module: 'orders' },
  { to: '/kitchen', label: 'Cocina', module: 'kitchen' },
  { to: '/delivery', label: 'Despachos', module: 'delivery' },
  { to: '/inventory', label: 'Inventario', module: 'inventory' },
  { to: '/purchases', label: 'Compras', module: 'purchases' },
  { to: '/suppliers', label: 'Proveedores', module: 'suppliers' },
  { to: '/recipes', label: 'Recetas', module: 'recipes' },
  { to: '/products', label: 'Platos', module: 'products' },
  { to: '/menus', label: 'Menú', module: 'menus' },
  { to: '/customers', label: 'Clientes', module: 'customers' },
  { to: '/reports', label: 'Reportes', module: 'reports' },
  { to: '/users', label: 'Usuarios', module: 'users' },
]

export function AppLayout() {
  const { profile, signOut } = useAuth()
  const role = profile?.role ?? null

  return (
    <div className="flex min-h-screen bg-neutral-950 text-neutral-100">
      <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900">
        <div className="px-4 py-5">
          <p className="text-sm font-semibold tracking-wide text-orange-500">DARK KITCHEN</p>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {NAV_ITEMS.filter((item) => canAccessModule(role, item.module)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-orange-600 text-white'
                    : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-neutral-800 p-3">
          <p className="truncate text-xs text-neutral-400">{profile?.fullName}</p>
          <p className="text-xs text-neutral-600">{profile?.role}</p>
          <button
            onClick={() => void signOut()}
            className="mt-2 w-full rounded-md border border-neutral-700 px-2 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
