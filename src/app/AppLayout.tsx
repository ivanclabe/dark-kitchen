import { useAuth } from '@/shared/hooks/useAuth'
import { canAccessModule, type ModuleKey } from '@/shared/rbac/roles'
import { useState } from 'react'
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
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-neutral-950 text-neutral-100">
      {sidebarOpen && (
        <button
          aria-label="Cerrar menú"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 sm:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-56 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900 transition-transform sm:static sm:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-4 py-5">
          <p className="text-sm font-semibold tracking-wide text-orange-500">DARK KITCHEN</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-2">
          {NAV_ITEMS.filter((item) => canAccessModule(role, item.module)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setSidebarOpen(false)}
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

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-4 py-3 sm:hidden">
          <button
            aria-label="Abrir menú"
            onClick={() => setSidebarOpen(true)}
            className="rounded-md border border-neutral-700 p-1.5 text-neutral-300"
          >
            ☰
          </button>
          <p className="text-sm font-semibold tracking-wide text-orange-500">DARK KITCHEN</p>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
