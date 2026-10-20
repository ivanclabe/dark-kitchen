import { CopilotButton } from '@/modules/copilot/CopilotProvider'
import { publicMenuUrl } from '@/modules/publicMenu/lib/cart'
import { usePublicMenuSettings } from '@/modules/publicMenu/hooks'
import { VoiceMenu } from '@/modules/voice/components/VoiceMenu'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { canAccessAnyModule } from '@/shared/rbac/roles'
import { Popover, PopoverItem } from '@/shared/ui/Popover'
import { Tooltip } from '@/shared/ui/Tooltip'
import clsx from 'clsx'
import { ChevronDown, ChevronRight, ExternalLink, Menu, PanelLeft, Plus } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { ADMIN_NAV_ITEMS, isNavItemActive, NAV_ITEMS } from '../navigation'
import { OnlineIndicator } from '../OnlineIndicator'
import { UserMenu } from '../UserMenu'
import { useShellActions } from './shellActionsContext'
import { setSidebarCollapsed } from './shellPrefs'
import { isSubsectionActive, navSubsections } from './subsections'

const buttonClass =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-3 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-700 hover:text-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'

/** «Vista previa» of the public menu, when it is published and the role can see it (ADR 0072). */
function PreviewButton() {
  const { can } = useActiveKitchen()
  const allowed = canAccessAnyModule(can, ['publicMenu'])
  const settings = usePublicMenuSettings(allowed)
  if (!allowed || !settings.data?.published) return null
  return (
    <a href={publicMenuUrl(settings.data.slug)} target="_blank" rel="noopener noreferrer" className={clsx(buttonClass, 'max-lg:hidden')}>
      Vista previa <ExternalLink size={13} className="text-neutral-500" aria-hidden />
    </a>
  )
}

/** The primary action of the account: create, with the most common one in front (ADR 0072). */
function CreateButton({ compact }: { compact: boolean }) {
  const { actions, create } = useShellActions()
  if (actions.length === 0) return null
  const [first, ...rest] = actions
  const primary = 'inline-flex h-9 items-center gap-1.5 bg-primary px-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950'
  if (compact) {
    return (
      <Popover
        label="Crear"
        placement="bottom-end"
        trigger={(props) => (
          <button type="button" {...props} aria-label="Crear" className={clsx(primary, 'w-9 justify-center rounded-lg px-0')}>
            <Plus size={18} aria-hidden />
          </button>
        )}
      >
        {(close) =>
          actions.map((a) => (
            <PopoverItem
              key={a.kind}
              icon={a.icon}
              onSelect={() => {
                close()
                create(a.kind)
              }}
            >
              {a.label}
            </PopoverItem>
          ))
        }
      </Popover>
    )
  }
  return (
    <div className="flex">
      <button type="button" onClick={() => create(first.kind)} className={clsx(primary, rest.length ? 'rounded-l-lg' : 'rounded-lg')}>
        <first.icon size={15} aria-hidden /> {first.label}
      </button>
      {rest.length > 0 && (
        <Popover
          label="Más para crear"
          placement="bottom-end"
          trigger={(props) => (
            <button type="button" {...props} aria-label="Más para crear" className={clsx(primary, 'rounded-r-lg border-l border-on-primary/20 px-2')}>
              <ChevronDown size={15} aria-hidden />
            </button>
          )}
        >
          {(close) =>
            rest.map((a) => (
              <PopoverItem
                key={a.kind}
                icon={a.icon}
                onSelect={() => {
                  close()
                  create(a.kind)
                }}
              >
                {a.label}
              </PopoverItem>
            ))
          }
        </Popover>
      )}
    </div>
  )
}

/**
 * The bar above the content (ADR 0072): fold the sidebar (or open it on a phone), where you are
 * (Cuenta › Módulo › Sección), and the actions of the moment — live, preview of the menu, voice, Copilot and
 * the primary «create».
 */
export function TopBar({ collapsed, onOpenMenu }: { collapsed: boolean; onOpenMenu: () => void }) {
  const active = useActiveKitchen()
  const { kitchen, path } = active
  const { pathname, search } = useLocation()
  const section = pathname.startsWith(path('/')) ? pathname.slice(path('/').length) || '/' : '/'
  const item = [...NAV_ITEMS, ...ADMIN_NAV_ITEMS].find((i) => isNavItemActive(section, i))
  const subs = item ? (navSubsections(active)[item.to] ?? []) : []
  const sub = subs.length > 1 ? subs.find((s) => isSubsectionActive(s, section, search, subs)) : undefined
  const crumbs = [
    { label: kitchen.name, to: '/' },
    ...(item ? [{ label: item.label, to: item.to }] : section.startsWith('/perfil') ? [{ label: 'Mi perfil', to: '/perfil' }] : []),
    ...(sub ? [{ label: sub.label, to: sub.to }] : []),
  ]

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-neutral-800/70 bg-neutral-950 px-3 md:px-4 lg:px-6">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Abrir menú"
        className="-ml-1 flex size-9 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100 md:hidden"
      >
        <Menu size={19} aria-hidden />
      </button>
      <Tooltip label={collapsed ? 'Mostrar la barra lateral' : 'Ocultar la barra lateral'} side="bottom">
        <button
          type="button"
          onClick={() => setSidebarCollapsed(!collapsed)}
          aria-label={collapsed ? 'Mostrar la barra lateral' : 'Ocultar la barra lateral'}
          aria-pressed={!collapsed}
          className="hidden size-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-900 hover:text-neutral-100 md:flex"
        >
          <PanelLeft size={18} aria-hidden />
        </button>
      </Tooltip>
      <nav aria-label="Estás en" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1 text-sm">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1
            return (
              <li key={`${c.to}-${i}`} className={clsx('flex min-w-0 items-center gap-1', !last && 'max-sm:hidden')}>
                {i > 0 && <ChevronRight size={14} className="shrink-0 text-neutral-600 max-sm:hidden" aria-hidden />}
                {last ? (
                  <span aria-current="page" className="truncate font-medium text-neutral-50">
                    {c.label}
                  </span>
                ) : (
                  <Link to={path(c.to)} className="truncate text-neutral-500 hover:text-neutral-100">
                    {c.label}
                  </Link>
                )}
              </li>
            )
          })}
        </ol>
      </nav>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <span className="max-md:hidden">
          <OnlineIndicator />
        </span>
        <PreviewButton />
        <span className="max-lg:hidden flex items-center gap-2">
          <VoiceMenu />
          <CopilotButton />
        </span>
        <span className="flex items-center gap-1.5 lg:hidden">
          <VoiceMenu compact />
          <CopilotButton compact />
        </span>
        <span className="max-sm:hidden">
          <CreateButton compact={false} />
        </span>
        <span className="sm:hidden">
          <CreateButton compact />
        </span>
        {/* Your menu, at the top right as in most consoles (ADR 0072). */}
        <span className="ml-0.5 flex items-center border-l border-neutral-800 pl-2 sm:ml-1 sm:pl-3">
          <UserMenu placement="bottom-end" />
        </span>
      </div>
    </header>
  )
}
