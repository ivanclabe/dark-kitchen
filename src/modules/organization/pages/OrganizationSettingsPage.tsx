import { CreateKitchenDialog } from '@/modules/kitchens/components/CreateKitchenDialog'
import { MasterMenusPanel } from '@/modules/platform/components/MasterMenusPanel'
import { AccountIcon } from '@/shared/avatars/Avatar'
import { kitchenPath, MY_KITCHENS_KEY, useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { ActiveBadge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { ErrorState } from '@/shared/ui/ErrorState'
import { FormActions, FormField, FormGrid, Input, Select } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { ConfirmDialog } from '@/shared/ui/Modal'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Tabs, type TabItem } from '@/shared/ui/Tabs'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDate } from '@/shared/utils/format'
import { atLimit, fetchSubscription } from '@/shared/plans/subscription'
import { limitLabel } from '@/shared/plans/plans'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, CreditCard, Crown, Layers, Plus, Sparkles, Store } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { setAccountsActive, updateOrganization, type OrgAccount, type OrganizationDetails, type OrganizationInput } from '../api/organization'
import { AccountEditDrawer } from '../components/AccountEditDrawer'
import { FeaturesPanel } from '../components/FeaturesPanel'
import { PlanPanel } from '../components/PlanPanel'
import { orgKey, useOrgAccounts, useOrganizationDetails, useOrgUsers } from '../hooks/useOrganization'
import { CATEGORIES, COUNTRIES, SECTORS } from '../lib/business'

type Tab = 'general' | 'plan' | 'accounts' | 'features' | 'menus' | 'ownership'

/**
 * Configuración de la organización (ADR 0008, 10.5; ADR 0009 y 0010): datos
 * del negocio, su plan, sus Cuentas (con su icono), las funciones que ofrece y activa en
 * cada Cuenta, los menús maestros que comparte y su SUPER_ADMIN. Solo para
 * el SUPER_ADMIN; la base lo exige igual en cada operación.
 */
export function OrganizationSettingsPage() {
  const { kitchen, organization, path } = useActiveKitchen()
  const permissions = new Set(organization?.permissions ?? [])
  const [tab, setTab] = useState<Tab>('general')
  const organizationId = kitchen.organizationId
  const details = useOrganizationDetails(organizationId)

  if (!permissions.has('organization.manage')) return <Navigate to={path('/')} replace />

  const tabs: TabItem<Tab>[] = [
    { value: 'general', label: 'General', icon: Building2 },
    { value: 'plan', label: 'Plan', icon: CreditCard },
    { value: 'accounts', label: 'Cuentas', icon: Store },
    ...(permissions.has('features.manage') ? [{ value: 'features' as const, label: 'Funciones', icon: Sparkles }] : []),
    ...(permissions.has('master_menus.manage') ? [{ value: 'menus' as const, label: 'Menús maestros', icon: Layers }] : []),
    { value: 'ownership', label: 'SUPER_ADMIN', icon: Crown },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Configuración de la organización" icon={Building2} description={`Datos y cuentas de ${kitchen.organizationName}.`} />
      <Tabs value={tab} onChange={setTab} items={tabs} />
      {details.isLoading ? (
        <LoadingState variant="block" />
      ) : details.isError || !details.data ? (
        <ErrorState error={details.error} onRetry={() => void details.refetch()} />
      ) : tab === 'general' ? (
        <GeneralForm key={details.data.id} org={details.data} />
      ) : tab === 'plan' ? (
        <PlanPanel organizationId={organizationId} />
      ) : tab === 'accounts' ? (
        <AccountsPanel organizationId={organizationId} organizationName={details.data.name} canCreate={permissions.has('accounts.create')} canManage={permissions.has('accounts.manage')} />
      ) : tab === 'features' ? (
        <FeaturesPanel organizationId={organizationId} />
      ) : tab === 'menus' ? (
        <MenusTab organizationId={organizationId} />
      ) : (
        <OwnershipPanel org={details.data} />
      )}
    </div>
  )
}

function GeneralForm({ org }: { org: OrganizationDetails }) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const saved: OrganizationInput = {
    name: org.name,
    address: org.address,
    city: org.city,
    country: org.country,
    sector: org.sector,
    category: org.category,
    legalName: org.legalName,
    taxId: org.taxId,
    phone: org.phone,
    currency: org.currency,
    defaultTimezone: org.defaultTimezone,
  }
  const [edited, setEdited] = useState<OrganizationInput | null>(null)
  const form = edited ?? saved
  const set = (patch: Partial<OrganizationInput>) => setEdited({ ...form, ...patch })
  const nameError = form.name.trim().length >= 2 ? null : 'Mínimo 2 caracteres'

  const save = useMutation({
    mutationFn: () => updateOrganization(org.id, form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orgKey(org.id) })
      await queryClient.invalidateQueries({ queryKey: MY_KITCHENS_KEY })
      setEdited(null)
      show('Datos de la organización guardados.')
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudieron guardar los datos'), 'error'),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (edited && !nameError) save.mutate()
  }

  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-5">
      <Card title="Tu negocio" description="Así se identifica tu organización en Dark Kitchen" icon={Building2}>
        <FormGrid>
          <FormField label="Nombre" required error={edited ? nameError : null}>
            {(a11y) => <Input {...a11y} value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} />}
          </FormField>
          <FormField label="Sector">
            {(a11y) => (
              <Select {...a11y} value={form.sector ?? ''} onChange={(e) => set({ sector: e.target.value || null })}>
                <option value="">Sin definir</option>
                {SECTORS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Categoría">
            {(a11y) => (
              <Select {...a11y} value={form.category ?? ''} onChange={(e) => set({ category: e.target.value || null })}>
                <option value="">Sin definir</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="País">
            {(a11y) => (
              <Select {...a11y} value={form.country} onChange={(e) => set({ country: e.target.value })}>
                {COUNTRIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Ciudad">{(a11y) => <Input {...a11y} value={form.city ?? ''} onChange={(e) => set({ city: e.target.value })} />}</FormField>
          <FormField label="Dirección">{(a11y) => <Input {...a11y} value={form.address ?? ''} onChange={(e) => set({ address: e.target.value })} />}</FormField>
        </FormGrid>
      </Card>
      <Card title="Datos legales y de contacto" description="Opcionales" icon={Building2}>
        <FormGrid>
          <FormField label="Razón social">{(a11y) => <Input {...a11y} value={form.legalName ?? ''} onChange={(e) => set({ legalName: e.target.value })} />}</FormField>
          <FormField label="NIT / identificación">{(a11y) => <Input {...a11y} value={form.taxId ?? ''} onChange={(e) => set({ taxId: e.target.value })} />}</FormField>
          <FormField label="Teléfono">{(a11y) => <Input {...a11y} type="tel" value={form.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} />}</FormField>
          <FormField label="Moneda" hint="Para las cuentas nuevas">
            {(a11y) => <Input {...a11y} value={form.currency} onChange={(e) => set({ currency: e.target.value.toUpperCase().slice(0, 3) })} maxLength={3} />}
          </FormField>
        </FormGrid>
      </Card>
      <FormActions>
        {edited && (
          <Button variant="ghost" onClick={() => setEdited(null)} disabled={save.isPending}>
            Descartar
          </Button>
        )}
        <Button type="submit" variant="primary" loading={save.isPending} disabled={!edited || Boolean(nameError)}>
          Guardar cambios
        </Button>
      </FormActions>
    </form>
  )
}

function AccountsPanel({ organizationId, organizationName, canCreate, canManage }: { organizationId: string; organizationName: string; canCreate: boolean; canManage: boolean }) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const { data: accounts, isLoading, isError, error, refetch } = useOrgAccounts(organizationId)
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<OrgAccount | null>(null)
  // Límite de Cuentas del plan (la base lo exige igual al crear).
  const { data: subscription } = useQuery({ queryKey: [...orgKey(organizationId), 'subscription'], queryFn: () => fetchSubscription(organizationId) })
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
        <div className="flex justify-end gap-3">
          {a.active && (
            <Link to={kitchenPath(a.slug, '/')} className="text-sm text-brasa-400 hover:underline">
              Entrar
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
      <DataTable columns={columns} rows={accounts} getRowId={(a) => a.id} isLoading={isLoading} error={isError ? error : undefined} onRetry={() => void refetch()} />
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

function MenusTab({ organizationId }: { organizationId: string }) {
  const { data: accounts, isLoading } = useOrgAccounts(organizationId)
  if (isLoading || !accounts) return <LoadingState variant="block" />
  return <MasterMenusPanel organizationId={organizationId} kitchens={accounts.filter((a) => a.active)} />
}

function OwnershipPanel({ org }: { org: OrganizationDetails }) {
  const { data: users } = useOrgUsers(org.id)
  const owner = users?.find((u) => u.userId === org.ownerUserId)
  return (
    <div className="max-w-2xl space-y-5">
      <Card title="SUPER_ADMIN" description="El creador de la organización" icon={Crown}>
        <p className="text-sm text-neutral-200">{owner ? `${owner.fullName} · ${owner.email ?? ''}` : '—'}</p>
        <p className={`mt-3 ${typography.caption}`}>
          Tiene acceso global a todas las cuentas de la organización. Es intransferible y no se asigna a otros usuarios. Para administrar una cuenta,
          asigna a otras personas el rol ADMIN en esa cuenta.
        </p>
      </Card>
      <p className={typography.caption}>Para desactivar la organización completa, contacta al equipo de la plataforma Dark Kitchen.</p>
    </div>
  )
}
