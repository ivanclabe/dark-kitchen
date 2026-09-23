import { useAuth } from '@/shared/hooks/useAuth'
import { canAccessAnyModule, type ModuleKey } from '@/shared/rbac/roles'
import { Drawer } from '@/shared/ui/Drawer'
import { Tooltip } from '@/shared/ui/Tooltip'
import { initials } from '@/shared/utils/format'
import clsx from 'clsx'
import {
  BarChart3,
  ChefHat,
  Flame,
  LayoutDashboard,
  LogOut,
  Menu,
  Soup,
  UserCog,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'

/**
 * Sidebar agrupado (13 -> 7 ítems, ver auditoría de navegación): cada
 * entrada de grupo apunta a su ruta "principal" pero se resalta en
 * cualquiera de `matchPrefixes` (todas sus sub-rutas reales, que no
 * cambiaron de URL — ver src/app/layouts/*Layout.tsx y routes.tsx). Es
 * visible si el rol tiene acceso a AL MENOS UNO de `modules`; cada sub-ruta
 * sigue protegida por su propio ModuleKey sin cambios.
 */
interface NavItem {
  to: string
  label: string
  description: string
  modules: ModuleKey[]
  icon: LucideIcon
  matchPrefixes?: string[]
  highlight?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', description: 'Resumen del negocio', modules: ['dashboard'], icon: LayoutDashboard },
  {
    to: '/kitchen',
    label: 'Cocina',
    description: 'Del pedido a la entrega, en un tablero',
    modules: ['kitchen'],
    icon: ChefHat,
    matchPrefixes: ['/kitchen', '/orders', '/delivery'],
    highlight: true,
  },
  {
    to: '/menu-planner',
    label: 'Catálogo',
    description: 'Planificador de menús, platos y recetas',
    modules: ['menuPlanner'],
    icon: Soup,
    matchPrefixes: ['/menu-planner', '/recipes'],
  },
  {
    to: '/supply',
    label: 'Abastecimiento',
    description: 'Stock, compras y proveedores',
    modules: ['supply'],
    icon: Warehouse,
    matchPrefixes: ['/supply', '/inventory', '/purchases', '/suppliers'],
  },
  {
    to: '/customers',
    label: 'Clientes',
    description: 'Saldos, pagos e historial de cada cliente',
    modules: ['customers'],
    icon: Users,
    matchPrefixes: ['/customers'],
  },
  { to: '/reports', label: 'Reportes', description: 'Ventas, compras y rentabilidad', modules: ['reports'], icon: BarChart3 },
  { to: '/users', label: 'Usuarios', description: 'Equipo y roles', modules: ['users'], icon: UserCog },
]

function isNavItemActive(pathname: string, item: NavItem): boolean {
  const prefixes = item.matchPrefixes ?? [item.to]
  if (item.to === '/') return pathname === '/'
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export function AppLayout() {
  const { profile, signOut } = useAuth()
  const role = profile?.role ?? null
  const { pathname } = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const visibleItems = NAV_ITEMS.filter((item) => canAccessAnyModule(role, item.modules))
  const currentItem = visibleItems.find((item) => isNavItemActive(pathname, item))

  return (
    // h-screen + overflow-hidden (en vez de min-h-screen): fija el shell a
    // la altura real de la ventana para que el sidebar nunca se desplace
    // fuera de vista, y para que <main> tenga una altura acotada real — sin
    // eso, ninguna vista puede "llenar la pantalla" de forma confiable (solo
    // puede crecer con su contenido y dejar que la página entera scrollee).
    <div className="flex h-screen overflow-hidden bg-neutral-950 text-neutral-100">
      {/* Rail de escritorio: ícono + etiqueta siempre visibles (no requiere
          hover), como un panel de trading — cada ítem es su propia "ficha"
          navegable, "Salir" incluido, en vez de solo íconos con tooltip. */}
      <aside className="hidden w-20 shrink-0 flex-col items-center border-r border-neutral-800/60 bg-neutral-950 py-4 md:flex">
        <Link to="/" aria-label="Dark Kitchen — inicio" className="mb-5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-brasa-500">
          <Flame size={18} className="text-white" strokeWidth={2.5} aria-hidden />
        </Link>

        <nav aria-label="Principal" className="flex flex-1 flex-col items-center gap-1 overflow-y-auto">
          {visibleItems.map((item) => {
            const Icon = item.icon
            const active = isNavItemActive(pathname, item)
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'flex w-16 shrink-0 flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500',
                  active
                    ? 'text-brasa-400'
                    : clsx('text-neutral-500 hover:bg-neutral-900 hover:text-neutral-100', item.highlight && 'ring-1 ring-inset ring-brasa-500/30'),
                )}
              >
                <Icon size={19} strokeWidth={2} aria-hidden />
                <span className="text-[10px] leading-none font-medium">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="mt-2 flex flex-col items-center gap-2 border-t border-neutral-800/60 pt-3">
          <Tooltip label={`${profile?.fullName ?? '—'} · ${profile?.role ?? ''}`}>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-neutral-200" aria-hidden>
              {initials(profile?.fullName)}
            </div>
          </Tooltip>
          <button
            onClick={() => void signOut()}
            className="flex w-16 shrink-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-center text-[10px] font-medium text-neutral-500 transition-colors hover:bg-neutral-900 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500"
          >
            <LogOut size={17} aria-hidden />
            Salir
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Barra superior móvil: logo + sección actual + menú. */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-neutral-800/60 bg-neutral-950/90 px-4 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Abrir menú"
            className="-ml-1 flex size-10 items-center justify-center rounded-full text-neutral-300 hover:bg-neutral-900"
          >
            <Menu size={20} aria-hidden />
          </button>
          <span className="flex size-7 items-center justify-center rounded-lg bg-brasa-500">
            <Flame size={14} className="text-white" strokeWidth={2.5} aria-hidden />
          </span>
          <span className="truncate text-sm font-semibold text-neutral-100">{currentItem?.label ?? 'Dark Kitchen'}</span>
        </header>

        {/* flex flex-col + min-h-0: permite que una página (p.ej. Cocina/Kanban)
            se declare flex-1 y ocupe exactamente el alto disponible, con su
            propio scroll interno, en vez de que toda la página crezca y
            scrollee como un bloque. Las demás páginas siguen funcionando
            igual — su contenido simplemente scrollea dentro de <main>. */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      <Drawer open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} title="Dark Kitchen" subtitle={profile?.fullName} side="left" size="sm">
        <nav aria-label="Principal" className="-mx-2 flex flex-col gap-1">
          {visibleItems.map((item) => {
            const Icon = item.icon
            const active = isNavItemActive(pathname, item)
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileNavOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
                  active ? 'bg-brasa-500/10 text-brasa-400' : 'text-neutral-300 hover:bg-neutral-800 hover:text-neutral-50',
                )}
              >
                <Icon size={18} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="block text-xs text-neutral-500">{item.description}</span>
                </span>
              </Link>
            )
          })}
        </nav>
        <button
          onClick={() => void signOut()}
          className="mt-6 flex w-full items-center gap-3 rounded-xl border border-neutral-800 px-3 py-2.5 text-sm text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-50"
        >
          <LogOut size={16} aria-hidden /> Cerrar sesión
        </button>
      </Drawer>
    </div>
  )
}
