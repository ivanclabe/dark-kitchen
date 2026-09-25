import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { canAccessAnyModule } from '@/shared/rbac/roles'
import { Drawer } from '@/shared/ui/Drawer'
import { Tooltip } from '@/shared/ui/Tooltip'
import clsx from 'clsx'
import { Flame, Menu } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { ContextIndicator } from './AccountSwitcher'
import { homeSection, isNavItemActive, isSectionAllowed, NAV_ITEMS } from './navigation'
import { UserMenu } from './UserMenu'
import { WelcomeCard } from './WelcomeCard'

export function AppLayout() {
  // Módulos visibles según los permisos del rol en la Cuenta activa (ADR 0007/0008).
  const { kitchen, can, path } = useActiveKitchen()
  const { pathname } = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const section = pathname.startsWith(path('/')) ? pathname.slice(path('/').length) || '/' : '/'

  const visibleItems = NAV_ITEMS.filter((item) => canAccessAnyModule(can, item.modules))
  const currentItem = visibleItems.find((item) => isNavItemActive(section, item))

  // Una sección que el rol activo no puede abrir (enlace directo, o recién
  // cambió a un rol con menos permisos) lleva a su inicio. La base igual
  // rechazaría los datos: esto evita una pantalla de "No autorizado".
  if (!isSectionAllowed(section, can)) {
    const home = homeSection(can)
    if (home !== section) return <Navigate to={path(home)} replace />
  }

  return (
    // h-screen + overflow-hidden (en vez de min-h-screen): fija el shell a
    // la altura real de la ventana para que el sidebar nunca se desplace
    // fuera de vista, y para que <main> tenga una altura acotada real — sin
    // eso, ninguna vista puede "llenar la pantalla" de forma confiable (solo
    // puede crecer con su contenido y dejar que la página entera scrollee).
    <div className="flex h-screen overflow-hidden bg-neutral-950 text-neutral-100">
      {/* Rail de escritorio compacto: solo íconos. El nombre de cada módulo
          aparece en un tooltip (hover y foco por teclado) y es su aria-label. */}
      <aside className="hidden w-16 shrink-0 flex-col items-center border-r border-neutral-800/60 bg-neutral-950 py-4 md:flex">
        <Tooltip label="Inicio">
          <Link
            to={path('/')}
            aria-label="Inicio"
            className="mb-4 flex size-10 items-center justify-center rounded-xl bg-brasa-500 shadow-[0_6px_18px_-8px_var(--color-brasa-500)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-300"
          >
            <Flame size={19} className="text-white" strokeWidth={2.5} aria-hidden />
          </Link>
        </Tooltip>

        {/* Sin overflow-y-auto: recortaría el tooltip, que sale a la derecha del rail. */}
        <nav aria-label="Principal" className="flex flex-1 flex-col items-center gap-1.5">
          {visibleItems.map((item) => {
            const Icon = item.icon
            const active = isNavItemActive(section, item)
            return (
              <Tooltip key={item.to} label={item.label}>
                <Link
                  to={path(item.to)}
                  aria-label={item.label}
                  aria-current={active ? 'page' : undefined}
                  className={clsx(
                    'flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500',
                    active
                      ? 'bg-brasa-500/10 text-brasa-400'
                      : clsx('text-neutral-500 hover:bg-neutral-900 hover:text-neutral-100', item.highlight && 'ring-1 ring-inset ring-brasa-500/30'),
                  )}
                >
                  <Icon size={19} strokeWidth={2} aria-hidden />
                </Link>
              </Tooltip>
            )
          })}
        </nav>

        <div className="mt-2 border-t border-neutral-800/60 pt-3">
          <UserMenu placement="right-end" />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Contexto actual (escritorio): Cuenta · rol, con cambio de Cuenta. */}
        <header className="hidden h-12 shrink-0 items-center border-b border-neutral-800/60 px-4 md:flex lg:px-6">
          <ContextIndicator />
        </header>

        {/* Barra superior móvil: módulos + contexto + menú de usuario. */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-neutral-800/60 bg-neutral-950/90 px-3 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Abrir menú"
            className="-ml-1 flex size-10 items-center justify-center rounded-full text-neutral-300 hover:bg-neutral-900"
          >
            <Menu size={20} aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <ContextIndicator compact />
          </div>
          <UserMenu placement="bottom-end" />
        </header>

        {/* flex flex-col + min-h-0: permite que una página (p.ej. Cocina/Kanban)
            se declare flex-1 y ocupe exactamente el alto disponible, con su
            propio scroll interno, en vez de que toda la página crezca y
            scrollee como un bloque. Las demás páginas siguen funcionando
            igual — su contenido simplemente scrollea dentro de <main>. */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8">
          <WelcomeCard />
          <Outlet />
        </main>
      </div>

      <Drawer open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} title={kitchen.name} subtitle={currentItem ? `Estás en ${currentItem.label}` : kitchen.roleName} side="left" size="sm">
        <nav aria-label="Principal" className="-mx-2 flex flex-col gap-1">
          {visibleItems.map((item) => {
            const Icon = item.icon
            const active = isNavItemActive(section, item)
            return (
              <Link
                key={item.to}
                to={path(item.to)}
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
      </Drawer>
    </div>
  )
}
