import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { deleteRole, type OrgRole, type OrgUser, type PermissionDef } from '../api/organization'
import { orgKey } from '../hooks/useOrganization'
import { RoleEditorDrawer } from './RoleEditorDrawer'

type Editing = { role: OrgRole | null; draft?: { name: string; permissions: string[] } }

/**
 * Roles de la organización (ADR 0008, sección 11): plantillas del sistema
 * (solo lectura, se pueden duplicar) y roles propios. Crear y editar es del
 * SUPER_ADMIN (roles.manage); el resto los ve. Muestra cuántas personas
 * tienen cada rol y quiénes.
 */
export function RolesPanel({
  organizationId,
  roles,
  users,
  catalog,
  canManage,
}: {
  organizationId: string
  roles: OrgRole[]
  users: OrgUser[]
  catalog: PermissionDef[]
  canManage: boolean
}) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [deleting, setDeleting] = useState<OrgRole | null>(null)

  const remove = useMutation({
    mutationFn: (id: string) => deleteRole(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orgKey(organizationId) })
      show(`Rol ${deleting?.name} eliminado.`)
      setDeleting(null)
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo eliminar el rol'), 'error'),
  })

  function usersWith(roleId: string) {
    return users
      .map((u) => ({ name: u.fullName, accounts: u.accounts.filter((a) => a.roleIds.includes(roleId)).map((a) => a.kitchenName) }))
      .filter((u) => u.accounts.length > 0)
  }

  const system = roles.filter((r) => r.isSystem)
  const custom = roles.filter((r) => !r.isSystem)

  function RoleCard({ role }: { role: OrgRole }) {
    const holders = usersWith(role.id)
    return (
      <li className="flex flex-col gap-3 rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-semibold text-neutral-100">
            {role.name}
            {role.isSystem && (
              <Badge size="sm" tone="neutral">
                Plantilla
              </Badge>
            )}
          </p>
          {role.description && <p className={`mt-0.5 ${typography.caption}`}>{role.description}</p>}
        </div>
        <p className="text-xs text-neutral-500">
          {role.permissions.length} permisos · {holders.length === 1 ? '1 persona' : `${holders.length} personas`}
        </p>
        <div className="mt-auto flex flex-wrap gap-1">
          <Button variant="link" size="sm" icon={role.isSystem || !canManage ? Eye : Pencil} onClick={() => setEditing({ role })}>
            {role.isSystem || !canManage ? 'Ver permisos' : 'Editar'}
          </Button>
          {canManage && (
            <Button variant="link" size="sm" icon={Copy} onClick={() => setEditing({ role: null, draft: { name: `${role.name}_COPIA`, permissions: role.permissions } })}>
              Duplicar
            </Button>
          )}
          {canManage && !role.isSystem && (
            <Button variant="link" size="sm" icon={Trash2} className="!text-neutral-400 hover:!text-red-400" onClick={() => setDeleting(role)}>
              Eliminar
            </Button>
          )}
        </div>
      </li>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={typography.small}>
          Las plantillas son iguales en toda la plataforma. Los roles propios son de tu organización y sirven en todas sus cuentas.
        </p>
        {canManage && (
          <Button variant="secondary" icon={Plus} onClick={() => setEditing({ role: null })}>
            Nuevo rol
          </Button>
        )}
      </div>

      <section className="space-y-3">
        <h3 className={typography.h3}>Roles propios</h3>
        {custom.length === 0 ? (
          <p className={typography.caption}>{canManage ? 'Todavía no hay. Crea uno o duplica una plantilla para ajustarla.' : 'La organización aún no tiene roles propios.'}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {custom.map((r) => (
              <RoleCard key={r.id} role={r} />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h3 className={typography.h3}>Plantillas del sistema</h3>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {system.map((r) => (
            <RoleCard key={r.id} role={r} />
          ))}
        </ul>
      </section>

      {editing && (
        <RoleEditorDrawer
          role={editing.role}
          draft={editing.draft}
          roles={roles}
          catalog={catalog}
          organizationId={organizationId}
          canManage={canManage}
          users={editing.role ? usersWith(editing.role.id) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title="Eliminar rol"
        confirmLabel="Sí, eliminar"
        danger
        pending={remove.isPending}
        description={<p>El rol {deleting?.name} deja de existir en la organización. Si alguien lo tiene asignado, primero cámbiale el rol.</p>}
      />
    </div>
  )
}
