import clsx from 'clsx'
import { Activity, Building2, LayoutDashboard, LogOut, Menu, Settings2, Sparkles, Users, X } from 'lucide-react'
import { Suspense, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAdminSession } from '../auth/session'
import { GlobalAdminLogo } from './GlobalAdminLogo'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/organizations', label: 'Organizations', icon: Building2 },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/ai', label: 'AI Monitoring', icon: Sparkles },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/administration', label: 'Administration', icon: Settings2 },
] as const

/** Console shell (ADR 0019): sidebar, account and sign-out of this portal only. */
export function AdminLayout() {
  const { me, signOut } = useAdminSession()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const current = NAV.find((n) => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)))

  const nav = (
    <nav className="space-y-0.5" aria-label="Secciones">
      {NAV.map(({ to, label, icon: Icon, ...rest }) => (
        <NavLink
          key={to}
          to={to}
          end={'end' in rest}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
              isActive ? 'bg-console-800 font-medium text-neutral-50 ring-1 ring-console-700' : 'text-neutral-400 hover:bg-console-850 hover:text-neutral-100',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={16} className={isActive ? 'text-brasa-400' : undefined} aria-hidden /> {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )

  const account = (
    <div className="space-y-2 border-t border-console-700 pt-4">
      <div className="min-w-0 px-1">
        <p className="truncate text-sm text-neutral-200">{me?.fullName ?? 'Global Admin'}</p>
        <p className="truncate font-mono text-[11px] text-neutral-500">{me?.email}</p>
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-400 transition-colors hover:bg-console-850 hover:text-neutral-100"
      >
        <LogOut size={15} aria-hidden /> Cerrar sesión del portal
      </button>
    </div>
  )

  return (
    <div className="flex min-h-dvh bg-console-950 text-neutral-200">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r border-console-700 bg-console-900 px-3 py-5 lg:flex">
        <div className="px-2">
          <GlobalAdminLogo compact />
        </div>
        <div className="flex-1">{nav}</div>
        {account}
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col gap-6 border-r border-console-700 bg-console-900 px-3 py-5">
            <div className="flex items-center justify-between px-2">
              <GlobalAdminLogo compact />
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar menú" className="rounded-md p-1 text-neutral-400 hover:text-neutral-100">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1">{nav}</div>
            {account}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-console-700 bg-console-950/90 px-4 py-3 backdrop-blur lg:hidden">
          <button type="button" onClick={() => setOpen(true)} aria-label="Abrir menú" className="rounded-md p-1 text-neutral-300">
            <Menu size={20} />
          </button>
          <span className="text-sm font-medium text-neutral-100">{current?.label ?? 'Global Admin'}</span>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Suspense fallback={<p className="text-sm text-neutral-500">Cargando…</p>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
