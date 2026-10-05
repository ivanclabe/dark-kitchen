import { Avatar } from '@/shared/avatars/Avatar'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { Input, Select } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { typography } from '@/shared/ui/typography'
import { ShieldCheck, UserCog, UserPlus, Users } from 'lucide-react'
import { formatDate, formatDateTime } from '@/shared/utils/format'
import { useMemo, useState } from 'react'
import { Navigate, Outlet, useSearchParams } from 'react-router-dom'
import { SectionLayout } from '@/shared/ui/SectionLayout'
import { SettingsPage } from '@/modules/settings/ui/SettingsPage'
import type { OrgAccount, OrgRole, OrgUser } from '../api/organization'
import { RolesPanel } from '../components/RolesPanel'
import { UserDrawer } from '../components/UserDrawer'
import { useAccountUsers, useOrgRoles, usePermissionCatalog, useRoleUsage } from '../hooks/useOrganization'

/** Data shared by Usuarios and Roles y permisos (one query each, cached between both pages). */
function useTeamData() {
  const { kitchen, organization, can, canShared } = useActiveKitchen()
  const organizationId = organization?.id ?? kitchen.organizationId
  const users = useAccountUsers(organizationId, kitchen.id)
  const roles = useOrgRoles(organizationId)
  const catalog = usePermissionCatalog()
  const usage = useRoleUsage(organizationId, kitchen.id)
  const manageOrg = canShared('users.manage')
  return {
    kitchen,
    organizationId,
    users,
    roles,
    catalog,
    usage,
    manageOrg,
    manageTeam: can('team.manage') || manageOrg,
    manageRoles: canShared('roles.manage'),
    showActivity: canShared('users.view') || can('team.manage'),
    loading: users.isLoading || roles.isLoading || catalog.isLoading,
    error: users.error ?? roles.error ?? catalog.error,
    retry: () => void Promise.all([users.refetch(), roles.refetch(), catalog.refetch()]),
  }
}

const SUPPORT_NOTE = 'El equipo de soporte de la plataforma Quanela puede entrar a todas las cuentas para ayudarte; todo lo que hace queda registrado.'

/**
 * Usuarios of the active account (ADR 0008 §10–11, ADR 0024, ADR 0026): the
 * same shell as Configuración, with two sections — Usuarios and Roles y
 * permisos. Only the people of THIS account, with their roles in it; the
 * database checks everything again (no shortcuts to RBAC).
 */
export function UsersLayout() {
  const { kitchen, path } = useActiveKitchen()
  const [params] = useSearchParams()
  // Old address of the roles tab (ADR 0024).
  if (params.get('tab') === 'roles') return <Navigate to={path('/users/roles')} replace />
  return (
    <SectionLayout
      title="Usuarios"
      description={`Personas de ${kitchen.name} y lo que puede hacer cada una.`}
      icon={UserCog}
      navLabel="Secciones de usuarios"
      sections={[
        { to: path('/users'), label: 'Usuarios', icon: Users, end: true },
        { to: path('/users/roles'), label: 'Roles y permisos', icon: ShieldCheck },
      ]}
    >
      <Outlet />
    </SectionLayout>
  )
}

/** Usuarios: who works in this account, their roles and state; create and edit people. */
export function UsersPage() {
  const team = useTeamData()
  const [editing, setEditing] = useState<{ user: OrgUser | null } | null>(null)
  const { kitchen } = team
  const assignable: OrgAccount[] = useMemo(
    () => [{ id: kitchen.id, slug: kitchen.slug, name: kitchen.name, iconKey: kitchen.iconKey, active: kitchen.active, createdAt: '' }],
    [kitchen],
  )
  const count = team.users.data?.length

  return (
    <SettingsPage
      title="Usuarios"
      description={count === undefined ? 'Quién trabaja en esta cuenta.' : `${count} ${count === 1 ? 'persona trabaja' : 'personas trabajan'} en esta cuenta.`}
      actions={
        team.manageTeam ? (
          <Button variant="primary" icon={UserPlus} onClick={() => setEditing({ user: null })}>
            Crear usuario
          </Button>
        ) : undefined
      }
    >
      {team.error ? (
        <ErrorState error={team.error} onRetry={team.retry} />
      ) : team.loading || !team.users.data || !team.roles.data || !team.catalog.data ? (
        <LoadingState variant="block" />
      ) : (
        <UsersPanel
          users={team.users.data}
          roles={team.roles.data}
          manageOrg={team.manageOrg}
          manageTeam={team.manageTeam}
          showActivity={team.showActivity}
          onEdit={(user) => setEditing({ user })}
        />
      )}
      <p className={typography.caption}>{SUPPORT_NOTE}</p>

      {editing && team.roles.data && team.catalog.data && (
        <UserDrawer
          organizationId={team.organizationId}
          user={editing.user}
          accounts={assignable}
          roles={team.roles.data}
          catalog={team.catalog.data}
          access={{ manageOrg: team.manageOrg, myPermissions: kitchen.permissions }}
          onClose={() => setEditing(null)}
        />
      )}
    </SettingsPage>
  )
}

/** Roles y permisos: system templates and own roles (they apply to all your accounts). */
export function RolesPage() {
  const team = useTeamData()
  return (
    <SettingsPage title="Roles y permisos" description="Qué puede hacer cada rol en esta cuenta.">
      {team.error ? (
        <ErrorState error={team.error} onRetry={team.retry} />
      ) : team.loading || !team.users.data || !team.roles.data || !team.catalog.data ? (
        <LoadingState variant="block" />
      ) : (
        <RolesPanel
          organizationId={team.organizationId}
          roles={team.roles.data}
          users={team.users.data}
          catalog={team.catalog.data}
          canManage={team.manageRoles}
          usage={team.usage.data}
        />
      )}
      <p className={typography.caption}>{SUPPORT_NOTE}</p>
    </SettingsPage>
  )
}

function UsersPanel({
  users,
  roles,
  manageOrg,
  manageTeam,
  showActivity,
  onEdit,
}: {
  users: OrgUser[]
  roles: OrgRole[]
  manageOrg: boolean
  manageTeam: boolean
  showActivity: boolean
  onEdit: (user: OrgUser) => void
}) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
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
      </div>

      <DataTable
        columns={columns}
        rows={shown}
        getRowId={(u) => u.userId}
        onRowClick={manageTeam ? onEdit : undefined}
        emptyState={
          <EmptyState
            icon={Users}
            title={users.length === 0 ? 'Todavía no hay usuarios' : 'Nadie coincide'}
            description={users.length === 0 ? 'Crea los usuarios de tu equipo y asígnales sus roles.' : 'Prueba con otro nombre.'}
            compact
          />
        }
      />

    </div>
  )
}
