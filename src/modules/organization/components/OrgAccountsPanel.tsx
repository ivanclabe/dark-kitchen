import { CreateKitchenDialog } from '@/modules/kitchens/components/CreateKitchenDialog'
import { AccountIcon } from '@/shared/avatars/Avatar'
import { kitchenPath, MY_KITCHENS_KEY } from '@/shared/kitchen/activeKitchenContext'
import { limitLabel } from '@/shared/plans/plans'
import { atLimit, fetchSubscription } from '@/shared/plans/subscription'
import { ActiveBadge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Input, Select } from '@/shared/ui/FormField'
import { ConfirmDialog } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDate } from '@/shared/utils/format'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Store } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { setAccountsActive, type OrgAccount } from '../api/organization'
import { orgKey, useOrgAccounts } from '../hooks/useOrganization'
import { AccountEditDrawer } from './AccountEditDrawer'

/**
 * Todas las Cuentas de la organización (ADR 0012, sección 4): buscar, filtrar
 * por estado, crear, editar (nombre e icono), activar/desactivar, entrar a
 * operarla, abrir su configuración o su observabilidad. Administrar la
 * organización y operar una Cuenta son contextos distintos: "Entrar" y
 * "Configurar" salen del centro hacia la Cuenta.
 */
export function OrgAccountsPanel({
  organizationId,
  organizationName,
  canCreate,
  canManage,
  canBilling = false,
  observabilityPath,
}: {
  organizationId: string
  organizationName: string
  canCreate: boolean
  canManage: boolean
  /** Solo con billing.view se consulta el plan (tope de Cuentas). */
  canBilling?: boolean
  /** Enlace a la observabilidad de una Cuenta (si tiene el permiso). */
  observabilityPath?: (accountId: string) => string
}) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const { data: accounts, isLoading, isError, error, refetch } = useOrgAccounts(organizationId)
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<OrgAccount | null>(null)
  // Límite de Cuentas del plan (la base lo exige igual al crear).
  const { data: subscription } = useQuery({
    queryKey: [...orgKey(organizationId), 'subscription'],
    queryFn: () => fetchSubscription(organizationId),
    enabled: canBilling,
  })
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const q = query.trim().toLowerCase()
  const shown = (accounts ?? []).filter(
    (a) => (!q || a.name.toLowerCase().includes(q) || a.slug.includes(q)) && (status === 'all' || (status === 'active') === a.active),
  )
  const accountLimit = subscription?.limits.accounts ?? null
  const full = subscription ? atLimit(subscription.usage.accounts, accountLimit) : false
  const [confirm, setConfirm] = useState<{ id: string; name: string; active: boolean } | null>(null)

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setAccountsActive([id], active),
    onSuccess: async (_, { active }) => {
      await queryClient.invalidateQueries({ queryKey: orgKey(organizationId) })
      await queryClient.invalidateQueries({ queryKey: MY_KITCHENS_KEY })
      show(active ? 'Cuenta activada.' : 'Cuenta desactivada.')
      setConfirm(null)
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo actualizar'), 'error'),
  })

  const columns: DataTableColumn<NonNullable<typeof accounts>[number]>[] = [
    {
      key: 'name',
      header: 'Cuenta',
      cell: (a) => (
        <div className="flex min-w-0 items-center gap-3">
          <AccountIcon iconKey={a.iconKey} seed={a.id} size="md" className={a.active ? undefined : 'opacity-50'} />
          <div className="min-w-0">
            <p className="truncate font-medium text-neutral-100">{a.name}</p>
            <p className="truncate text-xs text-neutral-500">/k/{a.slug}</p>
          </div>
        </div>
      ),
    },
    { key: 'status', header: 'Estado', cell: (a) => <ActiveBadge active={a.active} /> },
    { key: 'created', header: 'Creada', hideBelow: 'md', cell: (a) => <span className="text-neutral-400">{formatDate(a.createdAt)}</span> },
    {
      key: 'actions',
      header: <span className="sr-only">Acciones</span>,
      align: 'right',
      cell: (a) => (
        <div className="flex min-w-48 flex-wrap justify-end gap-x-3 gap-y-1">
          {a.active && (
            <Link to={kitchenPath(a.slug, '/')} className="text-sm text-brasa-400 hover:underline">
              Entrar
            </Link>
          )}
          {a.active && (
            <Link to={kitchenPath(a.slug, '/settings')} className="text-sm text-neutral-400 hover:text-neutral-100">
              Configurar
            </Link>
          )}
          {observabilityPath && (
            <Link to={observabilityPath(a.id)} className="hidden text-sm text-neutral-400 hover:text-neutral-100 sm:inline">
              Actividad
            </Link>
          )}
          {canManage && (
            <button type="button" onClick={() => setEditing(a)} className="text-sm text-neutral-400 hover:text-neutral-100">
              Editar
            </button>
          )}
          {canManage && (
            <button type="button" onClick={() => setConfirm({ id: a.id, name: a.name, active: !a.active })} className="text-sm text-neutral-400 hover:text-neutral-100">
              {a.active ? 'Desactivar' : 'Activar'}
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={typography.small}>Cada cuenta es un establecimiento con sus propios pedidos, clientes, menú e inventario.</p>
        {canCreate && (
          <div className="flex flex-wrap items-center gap-3">
            {subscription && accountLimit !== null && (
              <span className={full ? 'text-sm text-amber-300' : 'text-sm text-neutral-500'}>
                {subscription.usage.accounts} de {limitLabel(accountLimit, 'cuenta', 'cuentas')} de tu plan {subscription.plan.name}
              </span>
            )}
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)} disabled={full} title={full ? 'Llegaste al límite de cuentas de tu plan' : undefined}>
              Nueva cuenta
            </Button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cuenta" aria-label="Buscar cuenta" className="!mt-0 max-w-xs" />
        <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Filtrar por estado" className="!mt-0 max-w-[12rem]">
          <option value="all">Todas</option>
          <option value="active">Activas</option>
          <option value="inactive">Desactivadas</option>
        </Select>
        <span className="text-xs text-neutral-500">
          {shown.length} de {accounts?.length ?? 0}
        </span>
      </div>
      <DataTable
        columns={columns}
        rows={accounts ? shown : undefined}
        getRowId={(a) => a.id}
        isLoading={isLoading}
        error={isError ? error : undefined}
        onRetry={() => void refetch()}
        emptyState={<EmptyState icon={Store} title={accounts?.length ? 'Ninguna cuenta coincide' : 'Todavía no hay cuentas'} compact />}
      />
      {creating && (
        <CreateKitchenDialog
          organizationId={organizationId}
          organizationName={organizationName}
          onClose={() => setCreating(false)}
          onCreated={(slug) => {
            setCreating(false)
            void queryClient.invalidateQueries({ queryKey: orgKey(organizationId) })
            // Quien la crea entra a la Cuenta nueva (ADR 0009, 3.3).
            navigate(kitchenPath(slug, '/'))
          }}
        />
      )}
      {editing && <AccountEditDrawer account={editing} organizationId={organizationId} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && toggle.mutate({ id: confirm.id, active: confirm.active })}
        pending={toggle.isPending}
        danger={!confirm?.active}
        title={confirm?.active ? 'Activar cuenta' : 'Desactivar cuenta'}
        confirmLabel={confirm?.active ? 'Sí, activar' : 'Sí, desactivar'}
        description={
          confirm?.active ? (
            <p>Su equipo vuelve a poder operar {confirm.name} de inmediato.</p>
          ) : (
            <p>Nadie podrá operar {confirm?.name} (pedidos, inventario, todo) hasta que la actives de nuevo. Sus datos se conservan.</p>
          )
        }
      />
    </div>
  )
}
