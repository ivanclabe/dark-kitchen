import { lastUsedKitchenId } from '@/app/accountEntry'
import { clearActiveKitchen } from '@/app/kitchenEntry'
import { useAuth } from '@/shared/hooks/useAuth'
import { setAccountsActive } from '@/modules/organization/api/organization'
import { kitchenPath, MY_KITCHENS_KEY, useMyContext, useMyKitchens } from '@/shared/kitchen/activeKitchenContext'
import type { MyKitchen } from '@/shared/kitchen/kitchensApi'
import { AccountIcon } from '@/shared/avatars/Avatar'
import { tenantHostLabel } from '@/shared/tenant/host'
import { useTenant } from '@/shared/tenant/tenantContext'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { ArrowRight, ChefHat, ExternalLink, Flame, History, LogOut, Plus, Power, Store } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CreateKitchenDialog } from '../components/CreateKitchenDialog'

/**
 * "Tus cuentas" (ADR 0024): after login, when the person has several accounts
 * (ADR 0043: always right after signing in) or none, and from the menu to
 * switch. One flat list: accounts of another business open on their own
 * subdomain (ADR 0021/0022) without the word "organización"; the one used
 * last goes first and says so. Whoever may create accounts creates them here.
 */
export function KitchenSelectorPage() {
  clearActiveKitchen()
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const missingSlug = (location.state as { missingSlug?: string } | null)?.missingSlug
  const { data: ctx } = useMyContext()
  const { data: kitchens, isLoading, isError, error, refetch } = useMyKitchens()
  const [creating, setCreating] = useState(false)

  const tenant = useTenant()
  const organizations = ctx?.organizations ?? []
  const here = tenant.mode === 'tenant' ? organizations.find((o) => o.tenantCode === tenant.code) ?? null : null
  const lastId = ctx ? lastUsedKitchenId(ctx) : null
  // The accounts of this subdomain first (the others open on their own subdomain); among them, the one used last.
  const accounts = [...(kitchens ?? [])].sort(
    (a, b) => Number(b.organizationId === here?.id) - Number(a.organizationId === here?.id) || Number(b.id === lastId) - Number(a.id === lastId),
  )
  const creatable = here ? (here.permissions.includes('accounts.create') ? here : null) : (organizations.find((o) => o.permissions.includes('accounts.create')) ?? null)
  const codeOf = (k: MyKitchen) => organizations.find((o) => o.id === k.organizationId)?.tenantCode ?? null

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
            {creatable && (
              <Button variant="secondary" icon={Plus} onClick={() => setCreating(true)}>
                Nueva cuenta
              </Button>
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
        ) : accounts.length === 0 ? (
          creatable ? (
            <EmptyState icon={Store} title="Todavía no hay cuentas" description="Crea la primera cuenta para empezar a operar." />
          ) : (
            <EmptyState
              icon={Store}
              title="Aún no tienes acceso a ninguna cuenta"
              description="Pide al administrador de tu negocio que te agregue al equipo. Cuando lo haga, aparecerá aquí."
            />
          )
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((k) => (
              <AccountCard
                key={k.id}
                kitchen={k}
                last={k.id === lastId && accounts.length > 1}
                elsewhere={tenant.mode !== 'path' && here !== null && k.organizationId !== here.id ? codeOf(k) : null}
                canActivate={!k.active && (organizations.find((o) => o.id === k.organizationId)?.permissions.includes('accounts.manage') ?? false)}
              />
            ))}
          </ul>
        )}
      </div>

      {creating && creatable && (
        <CreateKitchenDialog organizationId={creatable.id} onClose={() => setCreating(false)} onCreated={(slug) => navigate(kitchenPath(slug, '/'))} />
      )}
    </div>
  )
}

/** Activates a deactivated account again (accounts.manage; the database checks it). */
function ActivateButton({ kitchen }: { kitchen: MyKitchen }) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const activate = useMutation({
    mutationFn: () => setAccountsActive([kitchen.id], true),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: MY_KITCHENS_KEY })
      show(`${kitchen.name} está activa de nuevo.`)
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo activar la cuenta'), 'error'),
  })
  return (
    <Button variant="secondary" size="sm" icon={Power} loading={activate.isPending} onClick={() => activate.mutate()}>
      Activar
    </Button>
  )
}

/** `elsewhere`: the code of another subdomain where this account opens. */
function AccountCard({ kitchen: k, elsewhere, canActivate, last }: { kitchen: MyKitchen; elsewhere: string | null; canActivate: boolean; last: boolean }) {
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
          {elsewhere ? (
            <ExternalLink size={15} className="mt-1 text-neutral-600 transition-colors group-hover:text-brasa-400" aria-label="Se abre en su propio espacio" />
          ) : (
            <ArrowRight size={16} className="mt-1 text-neutral-600 transition-colors group-hover:text-brasa-400" aria-hidden />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-neutral-50">{k.name}</p>
          <p className="truncate text-xs text-neutral-500">{elsewhere ? tenantHostLabel(elsewhere) : `/k/${k.slug}`}</p>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-2">
          <Badge tone={k.superAdmin ? 'brand' : 'neutral'} size="sm" icon={ChefHat}>
            {k.roleOptions.length > 1 ? `${k.roleName} +${k.roleOptions.length - 1}` : k.roleName}
          </Badge>
          {last && (
            <Badge tone="neutral" size="sm" icon={History}>
              Última que usaste
            </Badge>
          )}
          {!k.active && (
            <Badge tone="warning" size="sm">
              Desactivada
            </Badge>
          )}
        </div>
      </Link>
      {canActivate && (
        <div className="mt-2 flex justify-end">
          <ActivateButton kitchen={k} />
        </div>
      )}
    </li>
  )
}
