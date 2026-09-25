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
import { useMemo, useState } from 'react'
import type { OrgAccount, OrgRole, OrgUser } from '../api/organization'
import { RolesPanel } from '../components/RolesPanel'
import { UserDrawer } from '../components/UserDrawer'
import { useOrgAccounts, useOrgRoles, useOrgUsers, usePermissionCatalog } from '../hooks/useOrganization'

type Tab = 'users' | 'roles'

/**
 * Usuarios y permisos (ADR 0008, secciones 10–11 y 14). Una sola pantalla
 * para toda la organización: el SUPER_ADMIN ve y administra a todos; el
 * Administrador de una Cuenta ve y administra solo a la gente de su Cuenta
 * (la base filtra y valida). Reemplaza el "Equipo" que había por Cocina.
 */
export function UsersAndPermissionsPage() {
  const { kitchen, organization, can } = useActiveKitchen()
  const organizationId = kitchen.organizationId
  const orgPermissions = new Set(organization?.permissions ?? [])
  const manageOrg = orgPermissions.has('users.manage')
  const manageTeam = manageOrg || can('team.manage')
  const [tab, setTab] = useState<Tab>('users')

  const users = useOrgUsers(organizationId)
  const roles = useOrgRoles(organizationId)
  const orgAccounts = useOrgAccounts(organizationId)
  const catalog = usePermissionCatalog()

  // El Administrador de una Cuenta asigna solo en su Cuenta.
  const assignable: OrgAccount[] = useMemo(
    () => (manageOrg ? (orgAccounts.data ?? []) : [{ id: kitchen.id, slug: kitchen.slug, name: kitchen.name, iconKey: kitchen.iconKey, active: kitchen.active, createdAt: '' }]),
    [manageOrg, orgAccounts.data, kitchen],
  )

  const tabs: TabItem<Tab>[] = [
    { value: 'users', label: users.data ? `Usuarios (${users.data.length})` : 'Usuarios', icon: Users },
    { value: 'roles', label: 'Roles', icon: ShieldCheck },
  ]

  const loading = users.isLoading || roles.isLoading || catalog.isLoading
  const error = users.error ?? roles.error ?? catalog.error

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios y permisos"
        icon={Users}
        description={manageOrg ? `Quién trabaja en ${kitchen.organizationName} y con qué roles en cada cuenta.` : `Quién trabaja en ${kitchen.name} y con qué roles.`}
      />
      <Tabs value={tab} onChange={setTab} items={tabs} />

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
        />
      ) : (
        <RolesPanel organizationId={organizationId} roles={roles.data} users={users.data} catalog={catalog.data} canManage={orgPermissions.has('roles.manage')} />
      )}

      <p className={typography.caption}>El equipo de soporte de la plataforma Dark Kitchen puede entrar a todas las cuentas para ayudarte; todo lo que hace queda registrado.</p>
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
}: {
  organizationId: string
  users: OrgUser[]
  roles: OrgRole[]
  catalog: Parameters<typeof UserDrawer>[0]['catalog']
  assignable: OrgAccount[]
  manageOrg: boolean
  manageTeam: boolean
  myPermissions: ReadonlySet<string>
}) {
  const [query, setQuery] = useState('')
  const [accountFilter, setAccountFilter] = useState('')
  const [editing, setEditing] = useState<{ user: OrgUser | null } | null>(null)
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? '—'

  const accountOptions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const u of users) for (const a of u.accounts) byId.set(a.kitchenId, a.kitchenName)
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [users])

  const q = query.trim().toLowerCase()
  const shown = users.filter(
    (u) =>
      (!q || u.fullName.toLowerCase().includes(q) || (u.email ?? '').includes(q)) &&
      (!accountFilter || u.isSuperAdmin || u.accounts.some((a) => a.kitchenId === accountFilter)),
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
              <span className="text-xs text-neutral-500">creador · acceso global</span>
            </span>
          )}
          {/* Roles de Cuenta: también los del SUPER_ADMIN (p. ej. ADMIN en las Cuentas que creó). */}
          <ul className="space-y-0.5 text-xs">
            {u.accounts.map((a) => (
              <li key={a.kitchenId} className={a.active ? 'text-neutral-300' : 'text-neutral-600 line-through'}>
                <span className="text-neutral-500">{a.kitchenName}:</span> {a.roleIds.map(roleName).join(', ')}
              </li>
            ))}
            {u.accounts.length === 0 && !u.isSuperAdmin && <li className="text-neutral-500">Sin cuentas asignadas</li>}
          </ul>
        </div>
      ),
    },
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
        {accountOptions.length > 1 && (
          <Select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} aria-label="Filtrar por cuenta" className="!mt-0 max-w-[14rem]">
            <option value="">Todas las cuentas</option>
            {accountOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        )}
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
            description={users.length === 0 ? 'Crea los usuarios de tu equipo y asígnales sus cuentas y roles.' : 'Prueba con otro nombre o cuenta.'}
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
