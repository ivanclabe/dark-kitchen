import { kitchenPath, useActiveKitchen, useMyContext, useMyKitchens } from '@/shared/kitchen/activeKitchenContext'
import type { MyKitchen } from '@/shared/kitchen/kitchensApi'
import { Popover } from '@/shared/ui/Popover'
import { useToast } from '@/shared/ui/Toast'
import { AccountIcon } from '@/shared/avatars/Avatar'
import clsx from 'clsx'
import { Check, ChevronDown, ChevronRight, LayoutGrid, Search } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/** Más de estas Cuentas y la lista muestra un buscador. */
const SEARCH_FROM = 7

/**
 * Cambio de Cuenta sin cerrar sesión (ADR 0008, sección 13): lleva a la
 * MISMA sección en la otra Cuenta (/k/centro/supply → /k/norte/supply). El
 * acceso real lo valida la base con el encabezado de la Cuenta; esta lista
 * solo muestra las Cuentas que la base ya devolvió como accesibles.
 */
export function useSwitchAccount() {
  const { kitchen, path } = useActiveKitchen()
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const section = pathname.startsWith(path('/')) ? pathname.slice(path('/').length) || '/' : '/'
  return (target: MyKitchen) => {
    if (target.id === kitchen.id) return
    navigate(kitchenPath(target.slug, section) + (section === '/' ? '' : search))
  }
}

/**
 * ¿Se muestra la organización? Solo cuando aporta: con una organización y
 * una sola Cuenta, la palabra "organización" no aparece (ADR 0008, 0.1).
 */
export function useShowOrganization(): boolean {
  const { kitchen } = useActiveKitchen()
  const { data: ctx } = useMyContext()
  return (ctx?.organizations.length ?? 0) > 1 || (ctx?.accounts.length ?? 0) > 1 || kitchen.superAdmin
}

/** Lista de Cuentas para elegir (agrupada por organización si hay varias; con buscador si son muchas). */
export function AccountList({ onDone }: { onDone: () => void }) {
  const { kitchen } = useActiveKitchen()
  const { data: kitchens } = useMyKitchens()
  const switchAccount = useSwitchAccount()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const all = kitchens ?? []
  const q = query.trim().toLowerCase()
  const shown = q ? all.filter((k) => k.name.toLowerCase().includes(q) || k.slug.includes(q) || k.organizationName.toLowerCase().includes(q)) : all
  const orgCount = new Set(all.map((k) => k.organizationId)).size

  return (
    <div className="space-y-1">
      {all.length >= SEARCH_FROM && (
        <label className="mx-1 mb-1 flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
          <Search size={14} className="text-neutral-500" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar cuenta"
            aria-label="Buscar cuenta"
            className="min-w-0 flex-1 bg-transparent text-neutral-100 outline-none placeholder:text-neutral-600"
          />
        </label>
      )}
      <ul className="max-h-80 space-y-0.5 overflow-y-auto">
        {shown.map((k, i) => {
          const current = k.id === kitchen.id
          const newGroup = orgCount > 1 && (i === 0 || shown[i - 1].organizationId !== k.organizationId)
          return (
            <li key={k.id}>
              {newGroup && <p className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide text-neutral-500 uppercase">{k.organizationName}</p>}
              <button
                type="button"
                role="menuitem"
                aria-current={current ? 'true' : undefined}
                onClick={() => {
                  switchAccount(k)
                  onDone()
                }}
                className={clsx(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors focus-visible:outline-none',
                  current ? 'bg-brasa-500/10' : 'hover:bg-neutral-800 focus-visible:bg-neutral-800',
                )}
              >
                <AccountIcon iconKey={k.iconKey} seed={k.id} size="sm" className={k.active ? undefined : 'opacity-50'} />
                <span className="min-w-0 flex-1">
                  <span className={clsx('block truncate text-sm font-medium', k.active ? 'text-neutral-100' : 'text-neutral-500')}>
                    {k.name}
                    {!k.active && ' (desactivada)'}
                  </span>
                  <span className="block truncate text-xs text-neutral-500">
                    {k.roleOptions.length > 1 ? `${k.roleOptions.length} roles · ${k.roleName}` : k.roleName}
                  </span>
                </span>
                {current && <Check size={16} className="shrink-0 text-brasa-400" aria-label="Cuenta actual" />}
              </button>
            </li>
          )
        })}
        {shown.length === 0 && <li className="px-3 py-2 text-sm text-neutral-500">Ninguna cuenta coincide.</li>}
      </ul>
      <div className="border-t border-neutral-800 pt-1">
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onDone()
            navigate('/cuentas')
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-neutral-300 hover:bg-neutral-800 focus-visible:bg-neutral-800 focus-visible:outline-none"
        >
          <LayoutGrid size={16} className="text-neutral-400" aria-hidden /> Todas mis cuentas
        </button>
      </div>
    </div>
  )
}

/** Resumen corto de lo que permite un rol, para elegir el rol activo con criterio. */
function roleSummary(permissions: string[]): string {
  const labels: [string, string][] = [
    ['kitchen.view', 'tablero'],
    ['orders.view', 'pedidos'],
    ['dispatch.view', 'despacho'],
    ['inventory.view', 'inventario'],
    ['purchasing.view', 'compras'],
    ['customers.view', 'clientes'],
    ['reports.view', 'reportes'],
    ['team.manage', 'equipo'],
  ]
  const parts = labels.filter(([key]) => permissions.includes(key)).map(([, label]) => label)
  return parts.length > 5 ? 'acceso amplio' : parts.join(', ') || 'acceso limitado'
}

/**
 * Rol activo (ADR 0008, sección 12): solo entre los roles asignados en esta
 * Cuenta. Cambiarlo no toca las asignaciones; la base valida el rol en cada
 * petición y la interfaz se adapta al instante.
 */
export function RoleList({ onDone }: { onDone: () => void }) {
  const { kitchen, setActiveRole } = useActiveKitchen()
  const { show } = useToast()
  return (
    <ul className="space-y-0.5">
      {kitchen.roleOptions.map((role) => {
        const current = role.id === kitchen.activeRoleId
        return (
          <li key={role.id}>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={current}
              onClick={() => {
                onDone()
                if (current) return
                setActiveRole(role.id)
                show(`Ahora trabajas como ${role.name}.`)
              }}
              className={clsx(
                'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors focus-visible:outline-none',
                current ? 'bg-brasa-500/10' : 'hover:bg-neutral-800 focus-visible:bg-neutral-800',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-neutral-100">{role.name}</span>
                <span className="block truncate text-xs text-neutral-500">{roleSummary(role.permissions)}</span>
              </span>
              {current && <Check size={16} className="shrink-0 text-brasa-400" aria-label="Rol activo" />}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Contexto actual, siempre visible arriba del contenido (ADR 0008, 13.1):
 * Organización › Cuenta · rol activo. Si hay más de un rol o más de una
 * Cuenta, al pulsarlo se cambia de rol o de Cuenta.
 */
export function ContextIndicator({ compact = false }: { compact?: boolean }) {
  const { kitchen } = useActiveKitchen()
  const { data: kitchens } = useMyKitchens()
  const showOrg = useShowOrganization()
  const canSwitchAccount = (kitchens?.length ?? 0) > 1
  const canSwitchRole = kitchen.roleOptions.length > 1

  const content = (
    <>
      <AccountIcon iconKey={kitchen.iconKey} seed={kitchen.id} size="sm" />
      {showOrg && (
        <span className={clsx('flex min-w-0 shrink items-center gap-1 text-sm text-neutral-500', compact && 'hidden sm:flex')}>
          <span className="truncate">{kitchen.organizationName}</span>
          <ChevronRight size={13} className="shrink-0" aria-hidden />
        </span>
      )}
      <span className="min-w-0 truncate text-sm font-semibold text-neutral-100">{kitchen.name}</span>
      <span className={clsx('shrink-0 text-sm text-neutral-500', compact && 'hidden sm:inline')}>· {kitchen.roleName}</span>
    </>
  )

  if (!canSwitchAccount && !canSwitchRole) {
    return <div className="flex min-w-0 items-center gap-2 px-1.5 py-1">{content}</div>
  }

  return (
    <Popover
      label="Cambiar de rol o de cuenta"
      placement="bottom-start"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label={`${showOrg ? `Organización ${kitchen.organizationName}, ` : ''}cuenta ${kitchen.name}, rol ${kitchen.roleName}. Cambiar`}
          className="flex min-w-0 items-center gap-2 rounded-xl px-1.5 py-1 transition-colors hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500"
        >
          {content}
          <ChevronDown size={14} className="shrink-0 text-neutral-500" aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <>
          {canSwitchRole && (
            <>
              <p className="px-3 pt-1.5 pb-2 text-xs font-medium tracking-wide text-neutral-500 uppercase">Trabajar como</p>
              <RoleList onDone={close} />
            </>
          )}
          {canSwitchAccount && (
            <>
              <p className={clsx('px-3 pb-2 text-xs font-medium tracking-wide text-neutral-500 uppercase', canSwitchRole ? 'mt-2 border-t border-neutral-800 pt-3' : 'pt-1.5')}>
                Cambiar de cuenta
              </p>
              <AccountList onDone={close} />
            </>
          )}
        </>
      )}
    </Popover>
  )
}
