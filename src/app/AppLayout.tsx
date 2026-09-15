import { useAuth } from '@/shared/hooks/useAuth'
import { canAccessModule, type ModuleKey } from '@/shared/rbac/roles'
import { Tooltip } from '@/shared/ui/Tooltip'
import {
  BarChart3,
  Bike,
  BookOpen,
  Boxes,
  CalendarDays,
  ChefHat,
  ClipboardList,
  Flame,
  LayoutDashboard,
  LogOut,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

const NAV_ITEMS: Array<{ to: string; label: string; module: ModuleKey; icon: LucideIcon }> = [
  { to: '/', label: 'Dashboard', module: 'dashboard', icon: LayoutDashboard },
  { to: '/orders', label: 'Pedidos', module: 'orders', icon: ClipboardList },
  { to: '/kitchen', label: 'Cocina', module: 'kitchen', icon: ChefHat },
  { to: '/delivery', label: 'Despachos', module: 'delivery', icon: Bike },
  { to: '/inventory', label: 'Inventario', module: 'inventory', icon: Boxes },
  { to: '/purchases', label: 'Compras', module: 'purchases', icon: ShoppingCart },
  { to: '/suppliers', label: 'Proveedores', module: 'suppliers', icon: Truck },
  { to: '/recipes', label: 'Recetas', module: 'recipes', icon: BookOpen },
  { to: '/products', label: 'Platos', module: 'products', icon: UtensilsCrossed },
  { to: '/menus', label: 'Menú', module: 'menus', icon: CalendarDays },
  { to: '/customers', label: 'Clientes', module: 'customers', icon: Users },
  { to: '/reports', label: 'Reportes', module: 'reports', icon: BarChart3 },
  { to: '/users', label: 'Usuarios', module: 'users', icon: UserCog },
]

function initials(name: string | undefined) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
}

const navIconClass =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500'

export function AppLayout() {
  const { profile, signOut } = useAuth()
  const role = profile?.role ?? null

  return (
    <div className="flex min-h-screen bg-neutral-950 text-neutral-100">
      <aside className="flex w-16 shrink-0 flex-col items-center border-r border-neutral-800 bg-neutral-900 py-4">
        <Tooltip label="Dark Kitchen">
          <div className="mb-4 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brasa-400 to-brasa-600 shadow-sm">
            <Flame size={18} className="text-white" strokeWidth={2.5} />
          </div>
        </Tooltip>

        <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto">
          {NAV_ITEMS.filter((item) => canAccessModule(role, item.module)).map((item) => {
            const Icon = item.icon
            return (
              <Tooltip key={item.to} label={item.label}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  aria-label={item.label}
                  className={({ isActive }) =>
                    `${navIconClass} ${
                      isActive
                        ? 'bg-gradient-to-br from-brasa-500 to-brasa-600 text-white shadow-sm'
                        : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100'
                    }`
                  }
                >
                  <Icon size={20} strokeWidth={2} />
                </NavLink>
              </Tooltip>
            )
          })}
        </nav>

        <div className="mt-2 flex flex-col items-center gap-2 border-t border-neutral-800 pt-3">
          <Tooltip label={`${profile?.fullName ?? '—'} · ${profile?.role ?? ''}`}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-neutral-200">
              {initials(profile?.fullName)}
            </div>
          </Tooltip>
          <Tooltip label="Cerrar sesión">
            <button
              onClick={() => void signOut()}
              aria-label="Cerrar sesión"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-700 text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500"
            >
              <LogOut size={15} />
            </button>
          </Tooltip>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
