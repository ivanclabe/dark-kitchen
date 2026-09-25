import { Avatar } from '@/shared/avatars/Avatar'
import { useAuth } from '@/shared/hooks/useAuth'
import { useActiveKitchen, useMyKitchens } from '@/shared/kitchen/activeKitchenContext'
import { canAccessModule } from '@/shared/rbac/roles'
import { Popover, PopoverItem, PopoverSeparator } from '@/shared/ui/Popover'
import { ArrowLeftRight, BadgeCheck, Building2, ChevronLeft, ChevronRight, LogOut, Settings, ShieldCheck, UserRound, Users } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AccountList, RoleList, useShowOrganization } from './AccountSwitcher'

/**
 * Menú de usuario (ADR 0008, sección 13.1): quién soy, dónde estoy (Cuenta
 * y rol), mi perfil, cambiar de Cuenta, administración según permisos y
 * Cerrar sesión — que vive aquí y no como un botón suelto. Las opciones sin
 * permiso no se muestran.
 */
export function UserMenu({ placement }: { placement: 'right-end' | 'bottom-end' }) {
  const { profile, user, signOut } = useAuth()
  const { kitchen, organization, can, path } = useActiveKitchen()
  const canConfigureOrg = organization?.permissions.includes('organization.manage') ?? false
  const { data: kitchens } = useMyKitchens()
  const navigate = useNavigate()
  const [view, setView] = useState<'main' | 'accounts' | 'roles'>('main')
  const showOrg = useShowOrganization()
  const canSwitchRole = kitchen.roleOptions.length > 1

  const name = profile?.fullName ?? '—'
  const canSwitch = (kitchens?.length ?? 0) > 1
  const go = (to: string, close: () => void) => {
    close()
    navigate(to)
  }

  return (
    <Popover
      label="Menú de usuario"
      placement={placement}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          onClick={() => {
            setView('main')
            props.onClick()
          }}
          aria-label={`Menú de usuario: ${name}`}
          className="rounded-xl transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
        >
          <Avatar avatarKey={profile?.avatarKey} seed={profile?.id} size="sm" />
        </button>
      )}
    >
      {(close) =>
        view !== 'main' ? (
          <>
            <button
              type="button"
              role="menuitem"
              onClick={() => setView('main')}
              className="mb-1 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm font-medium text-neutral-300 hover:bg-neutral-800 focus-visible:bg-neutral-800 focus-visible:outline-none"
            >
              <ChevronLeft size={16} aria-hidden /> {view === 'accounts' ? 'Cambiar de cuenta' : 'Trabajar como'}
            </button>
            {view === 'accounts' ? <AccountList onDone={close} /> : <RoleList onDone={close} />}
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 px-2 pt-1 pb-3">
              <Avatar avatarKey={profile?.avatarKey} seed={profile?.id} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-neutral-50">{name}</p>
                <p className="truncate text-xs text-neutral-500">{user?.email}</p>
              </div>
            </div>
            <dl className="mx-1 mb-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-xs">
              {showOrg && (
                <>
                  <dt className="text-neutral-500">Organización</dt>
                  <dd className="truncate text-right font-medium text-neutral-200">{kitchen.organizationName}</dd>
                </>
              )}
              <dt className="text-neutral-500">Cuenta</dt>
              <dd className="truncate text-right font-medium text-neutral-200">{kitchen.name}</dd>
              <dt className="text-neutral-500">{canSwitchRole ? 'Rol activo' : 'Rol'}</dt>
              <dd className="truncate text-right font-medium text-neutral-200">{kitchen.roleName}</dd>
            </dl>
            {canSwitchRole && (
              <PopoverItem icon={BadgeCheck} onSelect={() => setView('roles')} trailing={<ChevronRight size={15} className="text-neutral-500" aria-hidden />}>
                Cambiar de rol
              </PopoverItem>
            )}

            <PopoverItem icon={UserRound} onSelect={() => go(path('/perfil'), close)}>
              Mi perfil
            </PopoverItem>
            {canAccessModule(can, 'settings') && (
              <PopoverItem icon={Settings} onSelect={() => go(path('/settings'), close)}>
                Configuración
              </PopoverItem>
            )}
            {canSwitch && (
              <PopoverItem icon={ArrowLeftRight} onSelect={() => setView('accounts')} trailing={<ChevronRight size={15} className="text-neutral-500" aria-hidden />}>
                Cambiar de cuenta
              </PopoverItem>
            )}

            {(canAccessModule(can, 'users') || canConfigureOrg || profile?.isSuperadmin) && <PopoverSeparator />}
            {canAccessModule(can, 'users') && (
              <PopoverItem icon={Users} onSelect={() => go(path('/users'), close)}>
                Usuarios y permisos
              </PopoverItem>
            )}
            {canConfigureOrg && (
              <PopoverItem icon={Building2} onSelect={() => go(path('/organizacion'), close)}>
                Configuración de la organización
              </PopoverItem>
            )}
            {profile?.isSuperadmin && (
              <PopoverItem icon={ShieldCheck} onSelect={() => go('/admin', close)}>
                Plataforma
              </PopoverItem>
            )}

            <PopoverSeparator />
            <PopoverItem
              icon={LogOut}
              tone="danger"
              onSelect={() => {
                close()
                void signOut()
              }}
            >
              Cerrar sesión
            </PopoverItem>
          </>
        )
      }
    </Popover>
  )
}
