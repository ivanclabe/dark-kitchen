import { BillingBanner } from '@/shared/billing/BillingBanner'
import { OnlineIndicator } from './OnlineIndicator'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Drawer } from '@/shared/ui/Drawer'
import clsx from 'clsx'
import { useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { CopilotProvider } from '@/modules/copilot/CopilotProvider'
import { VoiceProvider } from '@/modules/voice/VoiceProvider'
import { homeSection, isSectionAllowed } from './navigation'
import { WelcomeCard } from './WelcomeCard'
import { ShellActionsProvider } from './shell/ShellActions'
import { useSidebarCollapsed } from './shell/shellPrefs'
import { Sidebar } from './shell/Sidebar'
import { TopBar } from './shell/TopBar'

export function AppLayout() {
  // Módulos visibles según los permisos del rol en la Cuenta activa (ADR 0007/0008).
  const { kitchen, can, path } = useActiveKitchen()
  const { pathname } = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const collapsed = useSidebarCollapsed()
  const section = pathname.startsWith(path('/')) ? pathname.slice(path('/').length) || '/' : '/'

  // Una sección que el rol activo no puede abrir (enlace directo, o recién
  // cambió a un rol con menos permisos) lleva a su inicio. La base igual
  // rechazaría los datos: esto evita una pantalla de "No autorizado".
  if (!isSectionAllowed(section, can)) {
    const home = homeSection(can)
    if (home !== section) return <Navigate to={path(home)} replace />
  }

  return (
    // h-dvh + overflow-hidden (en vez de min-h-dvh): fija el shell a
    // la altura real de la ventana (dvh: en Safari iOS y Chrome Android, la unidad vh
    // mide sin la barra del navegador y cortaba el borde inferior) para que la barra lateral nunca se desplace
    // fuera de vista, y para que <main> tenga una altura acotada real — sin
    // eso, ninguna vista puede "llenar la pantalla" de forma confiable (solo
    // puede crecer con su contenido y dejar que la página entera scrollee).
    // «Oye Quanela» (ADR 0033): the voice of the whole app, one per account; Copilot answers through it.
    // Copilot (ADR 0020): one conversation per account — a new account starts a new one.
    // ADR 0072: Buscar y crear (⌘K) and the creation dialogs, available from every screen of the account.
    <VoiceProvider key={kitchen.id}>
    <CopilotProvider key={kitchen.id}>
    <ShellActionsProvider>
    <div className="flex h-dvh overflow-hidden bg-neutral-950 text-neutral-100">
      {/* ADR 0065: with the keyboard, the first Tab offers to skip the sidebar and the top bar. */}
      <a
        href="#contenido"
        className="sr-only z-[80] rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Saltar al contenido
      </a>
      {/* ADR 0072: the sidebar with names, folded to icons when the person chooses (or on medium screens). */}
      <aside
        aria-label="Barra lateral"
        className={clsx(
          'hidden shrink-0 border-r border-neutral-800/70 bg-neutral-950 py-4 transition-[width] duration-200 ease-[var(--ease-snappy)] md:block',
          collapsed ? 'w-16 px-3' : 'w-60 px-3',
        )}
      >
        <Sidebar collapsed={collapsed} />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar collapsed={collapsed} onOpenMenu={() => setMobileNavOpen(true)} />

        {/* flex flex-col + min-h-0: permite que una página (p.ej. Cocina/Kanban)
            se declare flex-1 y ocupe exactamente el alto disponible, con su
            propio scroll interno, en vez de que toda la página crezca y
            scrollee como un bloque. Las demás páginas siguen funcionando
            igual — su contenido simplemente scrollea dentro de <main>. */}
        {/* scrollbar-gutter: a short page and a long one keep the same width (no sideways jump when the scrollbar appears). */}
        <main id="contenido" tabIndex={-1} className="flex outline-none min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-4 [scrollbar-gutter:stable] sm:p-6 lg:p-8">
          <BillingBanner />
          <WelcomeCard />
          <Outlet />
        </main>
      </div>

      {/* Phone: the same sidebar, as a drawer from the left. */}
      <Drawer open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} title="quanela" side="left" size="sm">
        <div className="mb-3 md:hidden">
          <OnlineIndicator placement="bottom-start" />
        </div>
        <Sidebar collapsed={false} inDrawer onNavigate={() => setMobileNavOpen(false)} />
      </Drawer>
    </div>
    </ShellActionsProvider>
    </CopilotProvider>
    </VoiceProvider>
  )
}
