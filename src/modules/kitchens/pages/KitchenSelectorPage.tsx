import { clearActiveKitchen } from '@/app/kitchenEntry'
import { useAuth } from '@/shared/hooks/useAuth'
import { kitchenPath, useMyContext, useMyKitchens } from '@/shared/kitchen/activeKitchenContext'
import type { MyKitchen, MyOrganization } from '@/shared/kitchen/kitchensApi'
import { AccountIcon } from '@/shared/avatars/Avatar'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { typography } from '@/shared/ui/typography'
import clsx from 'clsx'
import { ArrowRight, ChefHat, Flame, LogOut, Plus, ShieldCheck, Store } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CreateKitchenDialog } from '../components/CreateKitchenDialog'

/**
 * "Tus cuentas": después del login, cuando la persona tiene varias Cuentas
 * (o ninguna), y desde el menú para cambiar. Agrupadas por organización
 * cuando hay más de una. El SUPER_ADMIN además crea Cuentas en su
 * organización. Un solo login para todos: la Cuenta se elige aquí.
 */
export function KitchenSelectorPage() {
  clearActiveKitchen()
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const missingSlug = (location.state as { missingSlug?: string } | null)?.missingSlug
  const { data: ctx } = useMyContext()
  const { data: kitchens, isLoading, isError, error, refetch } = useMyKitchens()
  const [creatingIn, setCreatingIn] = useState<MyOrganization | null>(null)

  const organizations = ctx?.organizations ?? []
  const groups = organizations
    .map((org) => ({ org, kitchens: (kitchens ?? []).filter((k) => k.organizationId === org.id) }))
    .filter((g) => g.kitchens.length > 0 || g.org.permissions.includes('accounts.create'))
  const showGroupTitles = groups.length > 1
  const canCreateSomewhere = organizations.some((o) => o.permissions.includes('accounts.create'))

  return (
    <div className="min-h-screen bg-neutral-950 px-4 py-10 text-neutral-100 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-brasa-500">
              <Flame size={20} className="text-white" strokeWidth={2.5} aria-hidden />
            </span>
            <div>
              <h1 className={typography.h1}>Tus cuentas</h1>
              <p className={typography.small}>Hola, {profile?.fullName?.split(' ')[0] ?? 'de nuevo'}. Elige con qué cuenta vas a trabajar.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {profile?.isSuperadmin && (
              <Link to="/admin" className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100">
                <ShieldCheck size={16} aria-hidden /> Plataforma
              </Link>
            )}
            <Button variant="ghost" icon={LogOut} onClick={() => void signOut()}>
              Cerrar sesión
            </Button>
          </div>
        </header>

        {missingSlug && (
          <p role="status" className="rounded-xl border border-amber-800/40 bg-amber-500/5 px-4 py-2.5 text-sm text-amber-300">
            No tienes acceso a la cuenta “{missingSlug}”, o ya no existe.
          </p>
        )}

        {isLoading ? (
          <LoadingState variant="cards" rows={1} cols={3} />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={Store}
            title="Aún no tienes acceso a ninguna cuenta"
            description="Pide al administrador de tu negocio que te agregue al equipo. Cuando lo haga, aparecerá aquí."
          />
        ) : (
          <div className="space-y-8">
            {groups.map(({ org, kitchens: orgKitchens }) => {
              const canCreate = org.permissions.includes('accounts.create')
              return (
                <section key={org.id} aria-label={org.name} className="space-y-3">
                  {(showGroupTitles || canCreate) && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {showGroupTitles || canCreateSomewhere ? (
                        <h2 className={clsx(typography.h3, 'flex items-center gap-2')}>
                          {org.name}
                          {org.isSuperAdmin && (
                            <Badge tone="brand" size="sm">
                              SUPER_ADMIN
                            </Badge>
                          )}
                        </h2>
                      ) : (
                        <span />
                      )}
                      {canCreate && (
                        <Button variant="secondary" size="sm" icon={Plus} onClick={() => setCreatingIn(org)}>
                          Nueva cuenta
                        </Button>
                      )}
                    </div>
                  )}
                  {orgKitchens.length === 0 ? (
                    <EmptyState icon={Store} title="Todavía no hay cuentas" description="Crea la primera cuenta para empezar a operar." compact />
                  ) : (
                    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {orgKitchens.map((k) => (
                        <AccountCard key={k.id} kitchen={k} />
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </div>

      {creatingIn && (
        <CreateKitchenDialog
          organizationId={creatingIn.id}
          organizationName={organizations.length > 1 ? creatingIn.name : undefined}
          onClose={() => setCreatingIn(null)}
          onCreated={(slug) => navigate(kitchenPath(slug, '/'))}
        />
      )}
    </div>
  )
}

function AccountCard({ kitchen: k }: { kitchen: MyKitchen }) {
  return (
    <li>
      <Link
        to={kitchenPath(k.slug, '/')}
        className={clsx(
          'group flex h-full flex-col gap-4 rounded-2xl border bg-neutral-900/60 p-5 transition-colors hover:border-brasa-500/50 hover:bg-neutral-900',
          k.active ? 'border-neutral-800/60' : 'border-neutral-800/60 opacity-70',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <AccountIcon iconKey={k.iconKey} seed={k.id} size="lg" />
          <ArrowRight size={16} className="mt-1 text-neutral-600 transition-colors group-hover:text-brasa-400" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-neutral-50">{k.name}</p>
          <p className="truncate text-xs text-neutral-500">/k/{k.slug}</p>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-2">
          <Badge tone={k.superAdmin ? 'brand' : 'neutral'} size="sm" icon={ChefHat}>
            {k.roleOptions.length > 1 ? `${k.roleName} +${k.roleOptions.length - 1}` : k.roleName}
          </Badge>
          {!k.active && (
            <Badge tone="warning" size="sm">
              Desactivada
            </Badge>
          )}
        </div>
      </Link>
    </li>
  )
}
