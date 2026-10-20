import { NotificationBell } from '@/modules/notifications/components/NotificationBell'
import { BrandMark, BrandWordmark } from '@/shared/brand/BrandMark'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { canAccessAnyModule } from '@/shared/rbac/roles'
import { Tooltip } from '@/shared/ui/Tooltip'
import clsx from 'clsx'
import { Search, UserPlus } from 'lucide-react'
import { Fragment, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ContextIndicator } from '../AccountSwitcher'
import { ADMIN_NAV_ITEMS, isNavItemActive, NAV_GROUP_LABELS, NAV_ITEMS, type NavGroup, type NavItem } from '../navigation'
import { useShellActions } from './shellActionsContext'
import { isSubsectionActive, navSubsections } from './subsections'

/**
 * The account's sidebar (ADR 0072): search and create, the account, the modules with their names in four
 * titled groups, the sections of the module on screen nested under it, and the bell and the team at the foot
 * (your menu is at the top right). `collapsed` leaves the icons (names in tooltips); the phone drawer uses it open.
 */
export function Sidebar({ collapsed, onNavigate, inDrawer = false }: { collapsed: boolean; onNavigate?: () => void; inDrawer?: boolean }) {
  const active = useActiveKitchen()
  const { kitchen, can, path } = active
  const { pathname, search } = useLocation()
  const { openPalette } = useShellActions()
  const section = pathname.startsWith(path('/')) ? pathname.slice(path('/').length) || '/' : '/'
  const items = useMemo(() => [...NAV_ITEMS, ...ADMIN_NAV_ITEMS].filter((item) => canAccessAnyModule(can, item.modules)), [can])
  const subsections = useMemo(() => navSubsections(active), [active])
  const groups = useMemo(() => {
    const out: { key: NavGroup; items: NavItem[] }[] = []
    for (const item of items) {
      const last = out.at(-1)
      if (last?.key === item.group) last.items.push(item)
      else out.push({ key: item.group, items: [item] })
    }
    return out
  }, [items])

  const link = (item: NavItem) => {
    const Icon = item.icon
    const isActive = isNavItemActive(section, item)
    const subs = subsections[item.to] ?? []
    const anchor = (
      <Link
        to={path(item.to)}
        onClick={onNavigate}
        aria-label={collapsed ? item.label : undefined}
        aria-current={isActive && !subs.some((s) => isSubsectionActive(s, section, search, subs)) ? 'page' : undefined}
        className={clsx(
          'group/nav flex items-center gap-2.5 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
          collapsed ? 'size-9 justify-center' : 'h-9 px-2.5',
          isActive ? 'bg-neutral-900 font-medium text-neutral-50 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-neutral-800' : 'text-neutral-400 hover:bg-neutral-900/70 hover:text-neutral-100',
        )}
      >
        <Icon size={17} strokeWidth={1.9} className={clsx('shrink-0', isActive ? 'text-brasa-400' : 'text-neutral-500 group-hover/nav:text-neutral-300')} aria-hidden />
        {!collapsed && <span className="min-w-0 truncate">{item.label}</span>}
      </Link>
    )
    return (
      <li key={item.to}>
        {collapsed ? <Tooltip label={item.label}>{anchor}</Tooltip> : anchor}
        {!collapsed && isActive && subs.length > 1 && (
          <ul className="mt-0.5 mb-1 ml-[18px] space-y-0.5 border-l border-neutral-800 pl-2.5">
            {subs.map((sub) => {
              const current = isSubsectionActive(sub, section, search, subs)
              return (
                <li key={sub.to}>
                  <Link
                    to={path(sub.to)}
                    onClick={onNavigate}
                    aria-current={current ? 'page' : undefined}
                    className={clsx(
                      'block truncate rounded-md px-2 py-1.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                      current ? 'font-medium text-neutral-50' : 'text-neutral-500 hover:text-neutral-100',
                    )}
                  >
                    {sub.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </li>
    )
  }

  const searchButton = (
    <button
      type="button"
      onClick={() => {
        onNavigate?.()
        openPalette()
      }}
      aria-label={collapsed ? 'Buscar y crear' : undefined}
      aria-keyshortcuts="Meta+K Control+K"
      className={clsx(
        'flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 text-sm text-neutral-500 transition-colors hover:border-neutral-700 hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
        collapsed ? 'size-10 justify-center' : 'h-9 w-full px-2.5',
      )}
    >
      <Search size={15} className="shrink-0" aria-hidden />
      {!collapsed && (
        <>
          <span className="flex-1 text-left">Buscar y crear</span>
          <kbd className="rounded border border-neutral-800 px-1 font-sans text-2xs text-neutral-500">⌘K</kbd>
        </>
      )}
    </button>
  )

  return (
    // In the phone drawer the whole drawer scrolls; on the desktop only the modules do (search, account and you stay).
    <div className={clsx('flex flex-col', !inDrawer && 'h-full min-h-0', collapsed && 'items-center')}>
      {!inDrawer && (
        // ADR 0072: open, the words-only logo; folded, the app icon.
        <Link
          to={path('/')}
          onClick={onNavigate}
          aria-label={`quanela · inicio de ${kitchen.name}`}
          className={clsx(
            'flex shrink-0 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
            collapsed ? 'mb-3' : 'mb-4 h-8 px-2',
          )}
        >
          {collapsed ? <BrandMark className="size-9" /> : <BrandWordmark className="h-[22px]" />}
        </Link>
      )}

      <div className={clsx('shrink-0 space-y-2', collapsed ? 'flex flex-col items-center' : 'w-full')}>
        {collapsed ? <Tooltip label="Buscar y crear (⌘K)">{searchButton}</Tooltip> : searchButton}
        <ContextIndicator variant={collapsed ? 'icon' : 'sidebar'} />
      </div>

      <nav aria-label="Principal" className={clsx('mt-3', !inDrawer && 'min-h-0 flex-1 overflow-y-auto overscroll-contain', collapsed ? 'w-full' : '-mx-1 px-1')}>
        {groups.map((group, i) => (
          <Fragment key={group.key}>
            {collapsed ? (
              i > 0 && <span className="mx-auto my-2 block h-px w-6 bg-neutral-800" aria-hidden />
            ) : (
              <p className={clsx('px-2.5 pb-1 text-xs font-medium text-neutral-500', i > 0 ? 'pt-4' : 'pt-1')}>{NAV_GROUP_LABELS[group.key]}</p>
            )}
            <ul className={clsx('space-y-0.5', collapsed && 'flex flex-col items-center')} aria-label={NAV_GROUP_LABELS[group.key]}>
              {group.items.map(link)}
            </ul>
          </Fragment>
        ))}
      </nav>

      <div className={clsx('mt-2 shrink-0 border-t border-neutral-800 pt-3', collapsed ? 'flex flex-col items-center gap-2' : 'w-full space-y-2')}>
        {(can('team.manage') || active.canShared('users.manage')) &&
          (collapsed ? (
            <Tooltip label="Invitar a tu equipo">
              <Link to={path('/users')} onClick={onNavigate} aria-label="Invitar a tu equipo" className="flex size-10 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-900 hover:text-neutral-100">
                <UserPlus size={17} aria-hidden />
              </Link>
            </Tooltip>
          ) : (
            <Link
              to={path('/users')}
              onClick={onNavigate}
              className="flex items-center gap-2.5 rounded-lg border border-dashed border-neutral-800 px-2.5 py-2 text-sm text-neutral-400 transition-colors hover:border-neutral-700 hover:text-neutral-100"
            >
              <UserPlus size={16} className="shrink-0" aria-hidden />
              Invitar a tu equipo
            </Link>
          ))}
        {/* Your menu lives at the top right of the top bar (ADR 0072); the bell stays here. */}
        <div className={clsx('flex items-center', collapsed ? 'flex-col gap-2' : 'gap-2 px-0.5')}>
          <NotificationBell placement={inDrawer ? 'bottom-end' : 'right-end'} />
        </div>
      </div>
    </div>
  )
}
