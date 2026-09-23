import { useAuth } from '@/shared/hooks/useAuth'
import { ROLES, type Role } from '@/shared/rbac/roles'
import { ActiveBadge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Select } from '@/shared/ui/FormField'
import { ConfirmDialog } from '@/shared/ui/Modal'
import { PageHeader } from '@/shared/ui/PageHeader'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDate } from '@/shared/utils/format'
import { Copy, Power, UserCog } from 'lucide-react'
import { useState } from 'react'
import { useSetUserActive, useUpdateUserRole, useUsers } from '../hooks/useUsers'
import type { StaffUser } from '../types'

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  KITCHEN: 'Cocina',
  INVENTORY: 'Inventario',
  CASHIER: 'Caja',
  DELIVERY: 'Domiciliario',
}

function RoleCell({ user, isSelf }: { user: StaffUser; isSelf: boolean }) {
  const updateRole = useUpdateUserRole()
  const { show } = useToast()

  async function handleRoleChange(role: Role) {
    try {
      await updateRole.mutateAsync({ id: user.id, role })
      show(`${user.fullName} ahora es ${ROLE_LABEL[role]}.`)
    } catch (err) {
      show(getErrorMessage(err, 'Error al cambiar el rol'), 'error')
    }
  }

  return (
    <Select
      value={user.role}
      disabled={isSelf || updateRole.isPending}
      onChange={(e) => handleRoleChange(e.target.value as Role)}
      aria-label={`Rol de ${user.fullName}`}
      className="!mt-0 w-44"
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABEL[r]}
        </option>
      ))}
    </Select>
  )
}

export function UsersPage() {
  const { data: users, isLoading, isError, error, refetch } = useUsers()
  const { profile } = useAuth()
  const setActive = useSetUserActive()
  const { show } = useToast()
  const [confirmUser, setConfirmUser] = useState<StaffUser | null>(null)

  const signupUrl = `${window.location.origin}/signup-staff`

  function copySignupLink() {
    navigator.clipboard.writeText(signupUrl).then(
      () => show('Enlace copiado.'),
      () => show('No se pudo copiar el enlace.', 'error'),
    )
  }

  async function handleToggleActive() {
    if (!confirmUser) return
    const user = confirmUser
    try {
      await setActive.mutateAsync({ id: user.id, active: !user.active })
      show(user.active ? `${user.fullName} desactivado.` : `${user.fullName} activado.`, user.active ? 'info' : 'success')
      setConfirmUser(null)
    } catch (err) {
      show(getErrorMessage(err, 'Error al actualizar el estado'), 'error')
    }
  }

  const columns: DataTableColumn<StaffUser>[] = [
    {
      key: 'name',
      header: 'Nombre',
      cell: (u) => (
        <span className="font-medium text-neutral-100">
          {u.fullName} {u.id === profile?.id && <span className="ml-1 text-xs font-normal text-neutral-500">(tú)</span>}
        </span>
      ),
    },
    { key: 'role', header: 'Rol', cell: (u) => <RoleCell user={u} isSelf={u.id === profile?.id} /> },
    { key: 'status', header: 'Estado', cell: (u) => <ActiveBadge active={u.active} /> },
    { key: 'since', header: 'Desde', cell: (u) => <span className="text-neutral-400">{formatDate(u.createdAt)}</span>, hideBelow: 'md' },
    {
      key: 'actions',
      header: <span className="sr-only">Acciones</span>,
      cell: (u) => {
        const isSelf = u.id === profile?.id
        return (
          <Button
            variant="link"
            size="sm"
            icon={Power}
            onClick={() => setConfirmUser(u)}
            disabled={isSelf}
            title={isSelf ? 'No puedes desactivar tu propia cuenta' : undefined}
            className={u.active ? '!text-neutral-400 hover:!text-red-400' : undefined}
          >
            {u.active ? 'Desactivar' : 'Activar'}
          </Button>
        )
      },
      align: 'right',
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        description={users ? `${users.length} personas en el equipo` : 'Roles y acceso del personal.'}
        icon={UserCog}
        actions={
          <Button variant="secondary" icon={Copy} onClick={copySignupLink}>
            Copiar enlace de registro
          </Button>
        }
      />

      <Card title="Agregar personal" description="Comparte el enlace de registro con la persona nueva.">
        <p className="text-sm text-neutral-300">
          La cuenta se crea con rol de <span className="font-medium text-neutral-100">Caja</span> por defecto — luego asígnale el rol correcto aquí.
        </p>
      </Card>

      <DataTable
        columns={columns}
        rows={users}
        getRowId={(u) => u.id}
        isLoading={isLoading}
        error={isError ? error : undefined}
        onRetry={() => void refetch()}
        emptyState={<EmptyState icon={UserCog} title="Todavía no hay usuarios" description="Comparte el enlace de registro para sumar al equipo." compact />}
      />

      <ConfirmDialog
        open={confirmUser !== null}
        onClose={() => setConfirmUser(null)}
        onConfirm={handleToggleActive}
        title={confirmUser?.active ? 'Desactivar usuario' : 'Activar usuario'}
        confirmLabel={confirmUser?.active ? 'Sí, desactivar' : 'Sí, activar'}
        danger={confirmUser?.active ?? false}
        pending={setActive.isPending}
        description={
          confirmUser?.active ? (
            <p>{confirmUser.fullName} perderá acceso inmediato a toda la aplicación, aunque su sesión siga activa.</p>
          ) : (
            <p>{confirmUser?.fullName} podrá volver a iniciar sesión y usar la aplicación con su rol actual.</p>
          )
        }
      />
    </div>
  )
}
