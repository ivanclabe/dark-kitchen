import { OnlineIndicator } from './OnlineIndicator'
import { BrandMark } from '@/shared/brand/BrandMark'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { canAccessAnyModule } from '@/shared/rbac/roles'
import { Drawer } from '@/shared/ui/Drawer'
import { Popover, PopoverItem } from '@/shared/ui/Popover'
import { Tooltip } from '@/shared/ui/Tooltip'
import clsx from 'clsx'
import { Ellipsis, Menu } from 'lucide-react'
import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ContextIndicator } from './AccountSwitcher'
import { CopilotButton, CopilotProvider } from '@/modules/copilot/CopilotProvider'
import { VoiceMenu } from '@/modules/voice/components/VoiceMenu'
import { VoiceProvider } from '@/modules/voice/VoiceProvider'
import { ADMIN_NAV_ITEMS, fitRail, homeSection, isNavItemActive, isSectionAllowed, NAV_GROUP_LABELS, NAV_ITEMS, type NavItem } from './navigation'
import { NotificationBell } from '@/modules/notifications/components/NotificationBell'
import { UserMenu } from './UserMenu'
import { WelcomeCard } from './WelcomeCard'

export function AppLayout() {
  // Módulos visibles según los permisos del rol en la Cuenta activa (ADR 0007/0008).
  const { kitchen, can, path } = useActiveKitchen()
  const { pathname } = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const section = pathname.startsWith(path('/')) ? pathname.slice(path('/').length) || '/' : '/'

  const visibleItems = NAV_ITEMS.filter((item) => canAccessAnyModule(can, item.modules))
  const adminItems = ADMIN_NAV_ITEMS.filter((item) => canAccessAnyModule(can, item.modules))
  const allItems = [...visibleItems, ...adminItems]
  const currentItem = allItems.find((item) => isNavItemActive(section, item))

  // The rail only shows what fits the window; the rest goes into «Más» (see fitRail).
  const navRef = useRef<HTMLElement>(null)
  const [navHeight, setNavHeight] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = navRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setNavHeight(entry.contentRect.height || null))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const rail = fitRail(allItems, navHeight)
  const overflowActive = rail.overflow.some((item) => isNavItemActive(section, item))
  const navigate = useNavigate()
  // «Más» opens upwards from its button: it may not grow past the top of the window.
  const [moreMaxHeight, setMoreMaxHeight] = useState<number | null>(null)

  const railLink = (item: NavItem) => {
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
            active ? 'bg-brasa-500/10 text-brasa-400' : 'text-neutral-500 hover:bg-neutral-900 hover:text-neutral-100',
          )}
        >
          <Icon size={19} strokeWidth={2} aria-hidden />
        </Link>
      </Tooltip>
    )
  }

  const drawerLink = (item: NavItem) => {
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
        <Icon size={18} className="shrink-0" aria-hidden />
        <span className="min-w-0">
          <span className="block text-sm font-medium">{item.label}</span>
          <span className="block text-xs text-neutral-500">{item.description}</span>
        </span>
      </Link>
    )
  }

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
    // «Oye Quanela» (ADR 0033): the voice of the whole app, one per account; Copilot answers through it.
    // Copilot (ADR 0020): one conversation per account — a new account starts a new one.
    <VoiceProvider key={kitchen.id}>
    <CopilotProvider key={kitchen.id}>
    <div className="flex h-screen overflow-hidden bg-neutral-950 text-neutral-100">
      {/* Rail de escritorio compacto: solo íconos. El nombre de cada módulo
          aparece en un tooltip (hover y foco por teclado) y es su aria-label. */}
      <aside className="hidden w-16 shrink-0 flex-col items-center border-r border-neutral-800/60 bg-neutral-950 py-4 md:flex">
        <Tooltip label="Inicio">
          <Link
            to={path('/')}
            aria-label="Inicio"
            className="mb-4 flex size-10 shrink-0 items-center justify-center rounded-xl shadow-[0_6px_18px_-8px_var(--color-brasa-500)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-300"
          >
            <BrandMark className="size-10" />
          </Link>
        </Tooltip>

        {/* Sin overflow-y-auto: recortaría el tooltip, que sale a la derecha del rail. En cambio,
            min-h-0 lo deja encoger y lo que no cabe pasa a «Más» (fitRail). */}
        <nav
          ref={navRef}
          aria-label="Principal"
          className="flex min-h-0 w-full flex-1 flex-col items-center gap-1.5"
          style={moreMaxHeight ? ({ '--rail-more-max': `${moreMaxHeight}px` } as CSSProperties) : undefined}
        >
          {rail.visible.map((item, i) => (
            <Fragment key={item.to}>
              {i > 0 && item.group !== rail.visible[i - 1].group && <span className="my-1.5 h-px w-8 shrink-0 bg-neutral-800/80" aria-hidden />}
              {railLink(item)}
            </Fragment>
          ))}
          {rail.overflow.length > 0 && (
            <Popover
              placement="right-end"
              label="Más módulos"
              className="md:w-64 md:max-h-[var(--rail-more-max,80vh)]!"
              trigger={(props) => (
                <Tooltip label={overflowActive && currentItem ? `Más · ${currentItem.label}` : 'Más módulos'}>
                  <button
                    type="button"
                    {...props}
                    onClick={(e) => {
                      setMoreMaxHeight(Math.floor(e.currentTarget.getBoundingClientRect().bottom) - 8)
                      props.onClick()
                    }}
                    aria-label="Más módulos"
                    className={clsx(
                      'flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500',
                      overflowActive || props['aria-expanded'] ? 'bg-brasa-500/10 text-brasa-400' : 'text-neutral-500 hover:bg-neutral-900 hover:text-neutral-100',
                    )}
                  >
                    <Ellipsis size={19} strokeWidth={2} aria-hidden />
                  </button>
                </Tooltip>
              )}
            >
              {(close) =>
                rail.overflow.map((item, i) => (
                  <Fragment key={item.to}>
                    {(i === 0 || item.group !== rail.overflow[i - 1].group) && (
                      <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">{NAV_GROUP_LABELS[item.group]}</p>
                    )}
                    <PopoverItem
                      icon={item.icon}
                      checked={isNavItemActive(section, item)}
                      trailing={isNavItemActive(section, item) && <span className="size-1.5 rounded-full bg-brasa-400" aria-hidden />}
                      onSelect={() => {
                        close()
                        navigate(path(item.to))
                      }}
                    >
                      {item.label}
                    </PopoverItem>
                  </Fragment>
                ))
              }
            </Popover>
          )}
        </nav>

        {/* The bell (ADR 0037) right above the user menu: always visible, the modules give way first. */}
        <div className="mt-2 flex shrink-0 flex-col items-center gap-2 border-t border-neutral-800/60 pt-3">
          <NotificationBell placement="right-end" />
          <UserMenu placement="right-end" />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Contexto actual (escritorio): Cuenta · rol, con cambio de Cuenta. */}
        <header className="hidden h-12 shrink-0 items-center border-b border-neutral-800/60 px-4 md:flex lg:px-6">
          <ContextIndicator />
          <div className="ml-auto flex items-center gap-2">
            <OnlineIndicator />
            <VoiceMenu />
            <CopilotButton />
          </div>
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
          <OnlineIndicator compact />
          <VoiceMenu compact />
          <CopilotButton compact />
          <NotificationBell placement="bottom-end" />
          <UserMenu placement="bottom-end" />
        </header>

        {/* flex flex-col + min-h-0: permite que una página (p.ej. Cocina/Kanban)
            se declare flex-1 y ocupe exactamente el alto disponible, con su
            propio scroll interno, en vez de que toda la página crezca y
            scrollee como un bloque. Las demás páginas siguen funcionando
            igual — su contenido simplemente scrollea dentro de <main>. */}
        {/* scrollbar-gutter: a short page and a long one keep the same width (no sideways jump when the scrollbar appears). */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-4 [scrollbar-gutter:stable] sm:p-6 lg:p-8">
          <WelcomeCard />
          <Outlet />
        </main>
      </div>

      <Drawer open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} title={kitchen.name} subtitle={currentItem ? `Estás en ${currentItem.label}` : kitchen.roleName} side="left" size="sm">
        <nav aria-label="Principal" className="-mx-2 flex flex-col gap-1">
          {allItems.map((item, i) => (
            <Fragment key={item.to}>
              {(i === 0 || item.group !== allItems[i - 1].group) && (
                <p className={clsx('px-3 pb-1 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase', i > 0 && 'mt-3')}>{NAV_GROUP_LABELS[item.group]}</p>
              )}
              {drawerLink(item)}
            </Fragment>
          ))}
        </nav>
      </Drawer>
    </div>
    </CopilotProvider>
    </VoiceProvider>
  )
}
