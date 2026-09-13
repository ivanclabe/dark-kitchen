import { useAuth } from '@/shared/hooks/useAuth'
import { canAccessModule, type ModuleKey } from '@/shared/rbac/roles'
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
  Menu as MenuIcon,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
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

function Logo() {
  return (
    <div className="flex items-center gap-2 px-4 py-5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brasa-400 to-brasa-600 shadow-sm">
        <Flame size={18} className="text-white" strokeWidth={2.5} />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-extrabold tracking-wide text-neutral-50">DARK KITCHEN</p>
        <p className="text-[10px] uppercase tracking-widest text-neutral-500">Operación</p>
      </div>
    </div>
  )
}

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
        className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900 transition-transform sm:static sm:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Logo />
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
          {NAV_ITEMS.filter((item) => canAccessModule(role, item.module)).map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-gradient-to-r from-brasa-600 to-brasa-600/80 text-white shadow-sm'
                      : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100'
                  }`
                }
              >
                <Icon size={17} strokeWidth={2} className="shrink-0 opacity-90" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>
        <div className="border-t border-neutral-800 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-neutral-200">
              {initials(profile?.fullName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-neutral-200">{profile?.fullName}</p>
              <p className="text-[11px] text-neutral-500">{profile?.role}</p>
            </div>
          </div>
          <button
            onClick={() => void signOut()}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-neutral-700 px-2 py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
          >
            <LogOut size={13} />
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
            <MenuIcon size={18} />
          </button>
          <div className="flex items-center gap-1.5">
            <Flame size={16} className="text-brasa-500" />
            <p className="text-sm font-semibold tracking-wide text-neutral-50">DARK KITCHEN</p>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
