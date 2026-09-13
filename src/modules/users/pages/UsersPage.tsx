import { useAuth } from '@/shared/hooks/useAuth'
import { ROLES, type Role } from '@/shared/rbac/roles'
import { ConfirmDialog } from '@/shared/ui/Modal'
import { cardClass, inputClass, tableWrapperClass, tdClass, thClass } from '@/shared/ui/formClasses'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
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

function UserRow({ user, isSelf }: { user: StaffUser; isSelf: boolean }) {
  const updateRole = useUpdateUserRole()
  const setActive = useSetUserActive()
  const { show } = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function handleRoleChange(role: Role) {
    try {
      await updateRole.mutateAsync({ id: user.id, role })
      show(`${user.fullName} ahora es ${ROLE_LABEL[role]}.`)
    } catch (err) {
      show(getErrorMessage(err, 'Error al cambiar el rol'), 'error')
    }
  }

  async function handleToggleActive() {
    try {
      await setActive.mutateAsync({ id: user.id, active: !user.active })
      show(user.active ? `${user.fullName} desactivado.` : `${user.fullName} activado.`, user.active ? 'info' : 'success')
      setConfirmOpen(false)
    } catch (err) {
      show(getErrorMessage(err, 'Error al actualizar el estado'), 'error')
    }
  }

  return (
    <tr>
      <td className={tdClass}>
        {user.fullName} {isSelf && <span className="ml-1 text-xs text-neutral-500">(tú)</span>}
      </td>
      <td className={tdClass}>
        <select
          value={user.role}
          disabled={isSelf || updateRole.isPending}
          onChange={(e) => handleRoleChange(e.target.value as Role)}
          className={`${inputClass} !mt-0 w-40`}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </td>
      <td className={tdClass}>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            user.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-neutral-700 text-neutral-300'
          }`}
        >
          {user.active ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td className={tdClass}>{new Date(user.createdAt).toLocaleDateString()}</td>
      <td className={`${tdClass} text-right`}>
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={isSelf}
          title={isSelf ? 'No puedes desactivar tu propia cuenta' : undefined}
          className="inline-flex items-center gap-1 text-neutral-400 hover:text-red-400 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-neutral-400"
        >
          <Power size={13} /> {user.active ? 'Desactivar' : 'Activar'}
        </button>
      </td>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleToggleActive}
        title={user.active ? 'Desactivar usuario' : 'Activar usuario'}
        confirmLabel={user.active ? 'Sí, desactivar' : 'Sí, activar'}
        danger={user.active}
        pending={setActive.isPending}
        description={
          user.active ? (
            <p>{user.fullName} perderá acceso inmediato a toda la aplicación, aunque su sesión siga activa.</p>
          ) : (
            <p>{user.fullName} podrá volver a iniciar sesión y usar la aplicación con su rol actual.</p>
          )
        }
      />
    </tr>
  )
}

export function UsersPage() {
  const { data: users, isLoading } = useUsers()
  const { profile } = useAuth()
  const { show } = useToast()

  const signupUrl = `${window.location.origin}/signup-staff`

  function copySignupLink() {
    navigator.clipboard.writeText(signupUrl).then(
      () => show('Enlace copiado.'),
      () => show('No se pudo copiar el enlace.', 'error'),
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <UserCog size={22} className="text-brasa-500" />
        <h1 className="text-2xl font-semibold text-neutral-50">Usuarios</h1>
      </div>

      <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <p className="text-sm text-neutral-300">Para agregar personal nuevo, comparte este enlace de registro:</p>
          <p className="mt-1 text-xs text-neutral-500">
            Se crea con rol de Caja por defecto — luego asígnale el rol correcto aquí.
          </p>
        </div>
        <button onClick={copySignupLink} className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800">
          <Copy size={14} /> Copiar enlace
        </button>
      </div>

      <div className={tableWrapperClass}>
        <table className="min-w-full divide-y divide-neutral-800">
          <thead className="bg-neutral-900">
            <tr>
              <th className={thClass}>Nombre</th>
              <th className={thClass}>Rol</th>
              <th className={thClass}>Estado</th>
              <th className={thClass}>Desde</th>
              <th className={thClass}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {isLoading && (
              <tr>
                <td className={tdClass} colSpan={5}>
                  Cargando…
                </td>
              </tr>
            )}
            {users?.map((user) => (
              <UserRow key={user.id} user={user} isSelf={user.id === profile?.id} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
