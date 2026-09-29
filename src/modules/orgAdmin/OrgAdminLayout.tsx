import { AccountIcon, Avatar } from '@/shared/avatars/Avatar'
import { useAuth } from '@/shared/hooks/useAuth'
import { kitchenPath } from '@/shared/kitchen/activeKitchenContext'
import { useOrgAdmin } from '@/shared/org/orgContext'
import { Drawer } from '@/shared/ui/Drawer'
import { Popover, PopoverItem, PopoverSeparator } from '@/shared/ui/Popover'
import clsx from 'clsx'
import { ArrowRight, ChevronDown, Flame, LayoutList, LogOut, Menu, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { isOrgNavItemActive, isOrgSectionAllowed, ORG_ADMIN_ICON, orgHomeSection, visibleOrgNav, type OrgNavItem } from './orgNavigation'

/** "Ir a una cuenta": la administración y la operación son contextos distintos. */
function GoToAccount() {
  const { accounts } = useOrgAdmin()
  const navigate = useNavigate()
  if (accounts.length === 0) return null
  return (
    <Popover
      label="Ir a una cuenta"
      placement="bottom-end"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-neutral-800 px-3 text-sm text-neutral-300 hover:border-neutral-700 hover:text-neutral-50"
        >
          Ir a una cuenta <ChevronDown size={14} aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <>
          <p className="px-2 pt-1 pb-2 text-xs text-neutral-500">Operar una cuenta (sales de la administración)</p>
          {accounts.map((k) => (
            <PopoverItem
              key={k.id}
              icon={ArrowRight}
              onSelect={() => {
                close()
                navigate(kitchenPath(k.slug, '/'))
              }}
            >
              <span className="flex items-center gap-2">
                <AccountIcon iconKey={k.iconKey} seed={k.id} size="xs" />
                <span className="truncate">{k.name}</span>
                {!k.active && <span className="text-xs text-neutral-500">(desactivada)</span>}
              </span>
            </PopoverItem>
          ))}
        </>
      )}
    </Popover>
  )
}

function OrgUserMenu() {
  const { profile, user, signOut } = useAuth()
  const { isPlatformAdmin } = useOrgAdmin()
  const navigate = useNavigate()
  return (
    <Popover
      label="Menú de usuario"
      placement="bottom-end"
      trigger={(props) => (
        <button type="button" {...props} aria-label={`Menú de usuario: ${profile?.fullName ?? ''}`} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500">
          <Avatar avatarKey={profile?.avatarKey} seed={profile?.id} size="sm" />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center gap-3 px-2 pt-1 pb-3">
            <Avatar avatarKey={profile?.avatarKey} seed={profile?.id} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-neutral-50">{profile?.fullName}</p>
              <p className="truncate text-xs text-neutral-500">{user?.email}</p>
            </div>
          </div>
          <PopoverItem icon={LayoutList} onSelect={() => { close(); navigate('/cuentas') }}>
            Tus cuentas
          </PopoverItem>
          {isPlatformAdmin && (
            <PopoverItem icon={ShieldCheck} onSelect={() => { close(); navigate('/admin') }}>
              Plataforma
            </PopoverItem>
          )}
          <PopoverSeparator />
          <PopoverItem icon={LogOut} tone="danger" onSelect={() => { close(); void signOut() }}>
            Cerrar sesión
          </PopoverItem>
        </>
      )}
    </Popover>
  )
}

function NavList({ items, section, onNavigate }: { items: OrgNavItem[]; section: string; onNavigate?: () => void }) {
  const { path } = useOrgAdmin()
  return (
    <nav aria-label="Administración" className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = item.icon
        const active = isOrgNavItemActive(section, item)
        return (
          <Link
            key={item.to}
            to={path(item.to)}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              'flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500',
              active ? 'bg-brasa-500/10 font-medium text-brasa-300' : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100',
            )}
          >
            <Icon size={17} aria-hidden />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * Centro de administración de la organización (ADR 0012): una barra lateral
 * propia, con nombres (no es el rail de operación), y el encabezado
 * "Administración · Organización". Para operar se va a una Cuenta.
 */
export function OrgAdminLayout() {
  const { organization, can, path } = useOrgAdmin()
  const { pathname } = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const base = path('/')
  const section = pathname.startsWith(base) ? pathname.slice(base.length) || '/' : '/'
  const items = visibleOrgNav(can)
  const OrgIcon = ORG_ADMIN_ICON

  if (!isOrgSectionAllowed(section, can)) {
    const home = orgHomeSection(can)
    if (home && home !== section) return <Navigate to={path(home)} replace />
  }

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-950 text-neutral-100">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-neutral-800/60 bg-neutral-950 px-3 py-4 md:flex">
        <Link to="/cuentas" className="mb-5 flex items-center gap-2.5 px-2" aria-label="Quanela — tus cuentas">
          <span className="flex size-8 items-center justify-center rounded-xl bg-brasa-500">
            <Flame size={16} className="text-white" strokeWidth={2.5} aria-hidden />
          </span>
          <span className="text-sm font-semibold">Quanela</span>
        </Link>
        <div className="mb-4 rounded-xl border border-neutral-800/60 bg-neutral-900/50 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-brasa-300 uppercase">
            <OrgIcon size={12} aria-hidden /> Administración
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-neutral-100">{organization.name}</p>
        </div>
        <NavList items={items} section={section} />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-neutral-800/60 px-3 md:px-6">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Abrir menú de administración"
            className="-ml-1 flex size-10 items-center justify-center rounded-full text-neutral-300 hover:bg-neutral-900 md:hidden"
          >
            <Menu size={20} aria-hidden />
          </button>
          <p className="min-w-0 flex-1 truncate text-sm text-neutral-400">
            <span className="text-neutral-500">Administración</span> <span aria-hidden>›</span>{' '}
            <span className="font-medium text-neutral-100">{organization.name}</span>
          </p>
          <GoToAccount />
          <OrgUserMenu />
        </header>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      <Drawer open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} title="Administración" subtitle={organization.name} side="left" size="sm">
        <NavList items={items} section={section} onNavigate={() => setMobileNavOpen(false)} />
      </Drawer>
    </div>
  )
}
