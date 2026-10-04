import { Avatar } from '@/shared/avatars/Avatar'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { Input, Select } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Tabs, type TabItem } from '@/shared/ui/Tabs'
import { typography } from '@/shared/ui/typography'
import { ShieldCheck, UserPlus, Users } from 'lucide-react'
import { formatDate, formatDateTime } from '@/shared/utils/format'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { OrgAccount, OrgRole, OrgUser } from '../api/organization'
import { RolesPanel } from '../components/RolesPanel'
import { UserDrawer } from '../components/UserDrawer'
import { useAccountUsers, useOrgRoles, usePermissionCatalog, useRoleUsage } from '../hooks/useOrganization'

type Tab = 'users' | 'roles'

/**
 * Usuarios of the active account (ADR 0008 §10–11, ADR 0024): two tabs,
 * Usuarios and Roles y permisos. Only the people of THIS account, with their
 * roles in it, also for whoever manages several accounts or the SUPER_ADMIN.
 * The database checks everything again (no shortcuts to RBAC).
 */
export function UsersAndPermissionsPage() {
  const { kitchen, organization, can, canShared } = useActiveKitchen()
  const [params, setParams] = useSearchParams()
  const organizationId = organization?.id ?? kitchen.organizationId
  const users = useAccountUsers(organizationId, kitchen.id)
  const roles = useOrgRoles(organizationId)
  const catalog = usePermissionCatalog()
  const usage = useRoleUsage(organizationId, kitchen.id)
  const assignable: OrgAccount[] = useMemo(
    () => [{ id: kitchen.id, slug: kitchen.slug, name: kitchen.name, iconKey: kitchen.iconKey, active: kitchen.active, createdAt: '' }],
    [kitchen],
  )
  const manageOrg = canShared('users.manage')
  const manageTeam = can('team.manage') || manageOrg
  const showActivity = canShared('users.view') || can('team.manage')

  const tab: Tab = params.get('tab') === 'roles' ? 'roles' : 'users'
  const tabs: TabItem<Tab>[] = [
    { value: 'users', label: users.data ? `Usuarios (${users.data.length})` : 'Usuarios', icon: Users },
    { value: 'roles', label: 'Roles y permisos', icon: ShieldCheck },
  ]

  const loading = users.isLoading || roles.isLoading || catalog.isLoading
  const error = users.error ?? roles.error ?? catalog.error

  return (
    <div className="space-y-6">
      <PageHeader title="Usuarios" icon={Users} description={`Quién trabaja en ${kitchen.name} y con qué roles.`} />
      <Tabs value={tab} onChange={(t) => setParams(t === 'roles' ? { tab: 'roles' } : {}, { replace: true })} items={tabs} />

      {error ? (
        <ErrorState error={error} onRetry={() => void Promise.all([users.refetch(), roles.refetch(), catalog.refetch()])} />
      ) : loading || !users.data || !roles.data || !catalog.data ? (
        <LoadingState variant="block" />
      ) : tab === 'users' ? (
        <UsersPanel
          organizationId={organizationId}
          users={users.data}
          roles={roles.data}
          catalog={catalog.data}
          assignable={assignable}
          manageOrg={manageOrg}
          manageTeam={manageTeam}
          myPermissions={kitchen.permissions}
          showActivity={showActivity}
        />
      ) : (
        <RolesPanel organizationId={organizationId} roles={roles.data} users={users.data} catalog={catalog.data} canManage={canShared('roles.manage')} usage={usage.data} />
      )}

      <p className={typography.caption}>El equipo de soporte de la plataforma Quanela puede entrar a todas las cuentas para ayudarte; todo lo que hace queda registrado.</p>
    </div>
  )
}

function UsersPanel({
  organizationId,
  users,
  roles,
  catalog,
  assignable,
  manageOrg,
  manageTeam,
  myPermissions,
  showActivity,
}: {
  organizationId: string
  users: OrgUser[]
  roles: OrgRole[]
  catalog: Parameters<typeof UserDrawer>[0]['catalog']
  assignable: OrgAccount[]
  manageOrg: boolean
  manageTeam: boolean
  myPermissions: ReadonlySet<string>
  showActivity: boolean
}) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [editing, setEditing] = useState<{ user: OrgUser | null } | null>(null)
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? '—'

  const q = query.trim().toLowerCase()
  const shown = users.filter(
    (u) =>
      (!q || u.fullName.toLowerCase().includes(q) || (u.email ?? '').includes(q)) &&
      (!statusFilter || u.status === statusFilter) &&
      (!roleFilter || (roleFilter === 'SUPER_ADMIN' ? u.isSuperAdmin : u.accounts.some((a) => a.roleIds.includes(roleFilter)))),
  )

  const columns: DataTableColumn<OrgUser>[] = [
    {
      key: 'person',
      header: 'Persona',
      cell: (u) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar avatarKey={u.avatarKey} seed={u.userId} size="sm" />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-medium text-neutral-100">
              {u.fullName}
              {u.isMe && <span className="text-xs font-normal text-neutral-500">(tú)</span>}
            </p>
            <p className="truncate text-xs text-neutral-500">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'access',
      header: 'Acceso',
      cell: (u) => (
        <div className="space-y-1">
          {u.isSuperAdmin && (
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge tone="brand" size="sm" icon={ShieldCheck}>
                SUPER_ADMIN
              </Badge>
              <span className="text-xs text-neutral-500">acceso a todas tus cuentas</span>
            </span>
          )}
          {/* Roles in this account (also the SUPER_ADMIN's, e.g. ADMIN to "work as"). */}
          <p className="text-xs text-neutral-300">{u.accounts.flatMap((a) => a.roleIds.map(roleName)).join(', ') || (u.isSuperAdmin ? '' : 'Sin rol')}</p>
        </div>
      ),
    },
    ...(showActivity
      ? ([
          {
            key: 'activity',
            header: 'Actividad',
            hideBelow: 'lg',
            cell: (u) => {
              const last = [u.lastSignInAt, u.lastActivityAt].filter(Boolean).sort().at(-1)
              return (
                <div className="text-xs">
                  <p className="text-neutral-300">{last ? `Última: ${formatDateTime(last)}` : 'Sin actividad registrada'}</p>
                  {u.joinedAt && <p className="text-neutral-500">Desde {formatDate(u.joinedAt)}</p>}
                </div>
              )
            },
          },
        ] satisfies DataTableColumn<OrgUser>[])
      : []),
    {
      key: 'status',
      header: 'Estado',
      hideBelow: 'md',
      cell: (u) =>
        u.status === 'pending' ? (
          <Badge tone="warning" size="sm" dot>
            Pendiente
          </Badge>
        ) : u.status === 'disabled' ? (
          <Badge tone="danger" size="sm" dot>
            Desactivado
          </Badge>
        ) : (
          <Badge tone="success" size="sm" dot>
            Activo
          </Badge>
        ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o correo" aria-label="Buscar usuario" className="!mt-0 max-w-xs" />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filtrar por estado" className="!mt-0 max-w-[10rem]">
          <option value="">Todos</option>
          <option value="active">Activos</option>
          <option value="pending">Pendientes</option>
          <option value="disabled">Desactivados</option>
        </Select>
        <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filtrar por rol" className="!mt-0 max-w-[12rem]">
          <option value="">Todos los roles</option>
          {manageOrg && <option value="SUPER_ADMIN">SUPER_ADMIN</option>}
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
        {manageTeam && (
          <Button variant="primary" icon={UserPlus} className="ml-auto" onClick={() => setEditing({ user: null })}>
            Crear usuario
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={shown}
        getRowId={(u) => u.userId}
        onRowClick={manageTeam ? (u) => setEditing({ user: u }) : undefined}
        emptyState={
          <EmptyState
            icon={Users}
            title={users.length === 0 ? 'Todavía no hay usuarios' : 'Nadie coincide'}
            description={users.length === 0 ? 'Crea los usuarios de tu equipo y asígnales sus roles.' : 'Prueba con otro nombre.'}
            compact
          />
        }
      />

      {editing && (
        <UserDrawer
          organizationId={organizationId}
          user={editing.user}
          accounts={assignable}
          roles={roles}
          catalog={catalog}
          access={{ manageOrg, myPermissions }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
