import { Avatar } from '@/shared/avatars/Avatar'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Drawer } from '@/shared/ui/Drawer'
import { FormField, Input, Select } from '@/shared/ui/FormField'
import { ConfirmDialog } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDate } from '@/shared/utils/format'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { ChevronDown, Link2, Power, ShieldCheck, UserMinus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import {
  activationLink,
  createOrgUser,
  removeFromAccount,
  removeOrgMember,
  resendActivation,
  setMemberRoles,
  setOrgMemberActive,
  updatePendingUser,
  type OrgAccount,
  type OrgRole,
  type OrgUser,
  type PermissionDef,
} from '../api/organization'
import { orgKey } from '../hooks/useOrganization'
import { canGrantRole, maxPermissions } from '../lib/effectivePermissions'
import { actionLabel, groupCatalog } from '../lib/permissionCatalog'
import { ActivationLinkModal } from './ActivationLinkModal'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

interface Assignment {
  roleIds: string[]
  defaultRoleId: string
}

export interface UserDrawerAccess {
  /** SUPER_ADMIN (users.manage): toda la organización. */
  manageOrg: boolean
  /** Permisos propios en la Cuenta activa (para no ofrecer roles con más permisos). */
  myPermissions: ReadonlySet<string>
}

/**
 * Crear o editar un usuario de la organización (ADR 0008, secciones 10–11):
 * datos, Cuentas y roles (varios por Cuenta, con uno
 * predeterminado), permisos efectivos y estado. Todo lo valida también la
 * base: aquí solo se evita ofrecer lo que va a rechazar.
 */
export function UserDrawer({
  organizationId,
  user,
  accounts,
  roles,
  catalog,
  access,
  onClose,
}: {
  organizationId: string
  /** null = crear. */
  user: OrgUser | null
  /** Cuentas donde quien edita puede asignar. */
  accounts: OrgAccount[]
  roles: OrgRole[]
  catalog: PermissionDef[]
  access: UserDrawerAccess
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const pending = user?.status === 'pending'
  const editableIdentity = !user || pending
  // Estado (activar, quitar): nadie lo cambia para sí mismo ni para el SUPER_ADMIN.
  const lockedStatus = Boolean(user?.isMe || user?.isOwner)
  // Roles de Cuenta: los del SUPER_ADMIN solo los cambia él (o la plataforma); nadie más edita los suyos (ADR 0009).
  const lockedRoles = user?.isOwner ? !access.manageOrg : Boolean(user?.isMe)

  const [fullName, setFullName] = useState(user?.fullName ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  // SUPER_ADMIN no se asigna: es solo del creador de la organización (se muestra, no se edita).
  const superAdmin = user?.isSuperAdmin ?? false
  const [assignments, setAssignments] = useState<Map<string, Assignment>>(
    () =>
      new Map(
        (user?.accounts ?? [])
          .filter((a) => accounts.some((acc) => acc.id === a.kitchenId))
          .map((a) => [a.kitchenId, { roleIds: a.roleIds, defaultRoleId: a.defaultRoleId ?? a.roleIds[0] }]),
      ),
  )
  const [link, setLink] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'remove' | 'toggle' | null>(null)

  const grantable = useMemo(() => roles.filter((r) => canGrantRole(r, access.myPermissions, access.manageOrg)), [roles, access])
  const nameError = fullName.trim().length >= 2 ? null : 'Mínimo 2 caracteres'
  const emailError = EMAIL.test(email.trim()) ? null : 'Correo inválido'
  const missingAccess = !superAdmin && assignments.size === 0
  const invalid = Boolean((editableIdentity && (nameError || emailError)) || missingAccess || [...assignments.values()].some((a) => a.roleIds.length === 0))

  const refresh = () => queryClient.invalidateQueries({ queryKey: orgKey(organizationId) })

  function toggleAccount(kitchenId: string, on: boolean) {
    setAssignments((prev) => {
      const next = new Map(prev)
      if (on) {
        const fallback = grantable.find((r) => r.key === 'CASHIER') ?? grantable[0]
        next.set(kitchenId, fallback ? { roleIds: [fallback.id], defaultRoleId: fallback.id } : { roleIds: [], defaultRoleId: '' })
      } else next.delete(kitchenId)
      return next
    })
  }

  function toggleRole(kitchenId: string, roleId: string) {
    setAssignments((prev) => {
      const next = new Map(prev)
      const current = next.get(kitchenId) ?? { roleIds: [], defaultRoleId: '' }
      const roleIds = current.roleIds.includes(roleId) ? current.roleIds.filter((r) => r !== roleId) : [...current.roleIds, roleId]
      next.set(kitchenId, { roleIds, defaultRoleId: roleIds.includes(current.defaultRoleId) ? current.defaultRoleId : (roleIds[0] ?? '') })
      return next
    })
  }

  function applyToAll() {
    const first = [...assignments.values()][0]
    if (!first) return
    setAssignments(new Map(accounts.map((a) => [a.id, { ...first }])))
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!user) {
        const result = await createOrgUser({
          organizationId,
          fullName: fullName.trim(),
          email: email.trim(),
          assignments: [...assignments.entries()].map(([kitchenId, a]) => ({ kitchenId, ...a })),
        })
        return result.token
      }
      if (pending && (fullName.trim() !== user.fullName || email.trim().toLowerCase() !== user.email)) {
        await updatePendingUser(organizationId, user.userId, fullName.trim(), email.trim())
      }
      for (const account of accounts) {
        const before = user.accounts.find((a) => a.kitchenId === account.id)
        const after = assignments.get(account.id)
        if (after) {
          const changed = !before || before.defaultRoleId !== after.defaultRoleId || [...before.roleIds].sort().join() !== [...after.roleIds].sort().join()
          if (changed) await setMemberRoles(account.id, user.userId, after.roleIds, after.defaultRoleId)
        } else if (before) {
          await removeFromAccount(account.id, user.userId)
        }
      }
      return null
    },
    onSuccess: async (token) => {
      await refresh()
      if (token) {
        setLink(activationLink(token))
      } else {
        show('Cambios guardados.')
        onClose()
      }
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo guardar'), 'error'),
  })

  const resend = useMutation({
    mutationFn: () => resendActivation(organizationId, user!.userId),
    onSuccess: (token) => {
      void refresh()
      setLink(activationLink(token))
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo generar el enlace'), 'error'),
  })

  const statusChange = useMutation({
    mutationFn: async (kind: 'remove' | 'toggle') => {
      if (kind === 'remove') await removeOrgMember(organizationId, user!.userId)
      else await setOrgMemberActive(organizationId, user!.userId, user!.status !== 'active')
    },
    onSuccess: async (_, kind) => {
      await refresh()
      show(kind === 'remove' ? `${user!.fullName} salió de la organización.` : user!.status === 'active' ? `${user!.fullName} ya no tiene acceso.` : `${user!.fullName} vuelve a tener acceso.`)
      setConfirm(null)
      onClose()
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo actualizar'), 'error'),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!invalid) save.mutate()
  }

  if (link) {
    return <ActivationLinkModal link={link} name={fullName.trim()} email={email.trim()} onClose={onClose} />
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={user ? user.fullName : 'Crear usuario'}
      subtitle={user ? (user.email ?? undefined) : 'La persona recibe un enlace para definir su contraseña. Tú nunca ves ni defines contraseñas.'}
    >
      <form onSubmit={onSubmit} className="space-y-6">
        {user && (
          <div className="flex items-center gap-3">
            <Avatar avatarKey={user.avatarKey} seed={user.userId} size="lg" />
            <div className="flex flex-wrap gap-1.5">
              {user.isSuperAdmin && <Badge tone="brand" size="sm" icon={ShieldCheck}>SUPER_ADMIN</Badge>}
              {user.isMe && <Badge size="sm">Tú</Badge>}
              <StatusBadge user={user} />
            </div>
          </div>
        )}

        {editableIdentity && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Nombre" required error={fullName ? nameError : null}>
              {(a11y) => <Input {...a11y} value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus={!user} maxLength={80} />}
            </FormField>
            <FormField label="Correo" required error={email ? emailError : null}>
              {(a11y) => <Input {...a11y} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="persona@correo.com" />}
            </FormField>
          </div>
        )}

        {user?.isSuperAdmin && (
          <p className="rounded-xl border border-brasa-500/30 bg-brasa-500/5 p-3 text-sm text-neutral-300">
            <span className="font-semibold text-neutral-100">SUPER_ADMIN</span> es el creador de la organización: tiene acceso global a todas sus cuentas. Es
            intransferible y no se asigna a otros usuarios.
          </p>
        )}

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className={typography.label}>Cuentas y roles</p>
              <p className={typography.caption}>
                {superAdmin
                  ? 'Como SUPER_ADMIN ya entra a todas. Los roles que marques aquí son para "trabajar como" (opcional).'
                  : 'Marca las cuentas donde trabaja y su rol en cada una. Puede tener varios; el predeterminado es con el que entra.'}
              </p>
            </div>
            {accounts.length > 1 && assignments.size > 0 && (
              <Button variant="link" size="sm" onClick={applyToAll} disabled={lockedRoles}>
                Aplicar a todas las cuentas
              </Button>
            )}
          </div>
          <ul className="space-y-2">
            {accounts.map((account) => {
              const a = assignments.get(account.id)
              return (
                <li key={account.id} className={clsx('rounded-xl border p-3', a ? 'border-brasa-500/40 bg-brasa-500/5' : 'border-neutral-800/60')}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-neutral-100">
                    <input
                      type="checkbox"
                      checked={Boolean(a)}
                      onChange={(e) => toggleAccount(account.id, e.target.checked)}
                      disabled={lockedRoles}
                      className="size-4 accent-[var(--color-brasa-500)]"
                    />
                    {account.name}
                    {!account.active && <Badge size="sm" tone="warning">Desactivada</Badge>}
                  </label>
                  {a && (
                    <div className="mt-2.5 space-y-2 pl-6">
                      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Roles en ${account.name}`}>
                        {roles.map((role) => {
                          const on = a.roleIds.includes(role.id)
                          const allowed = grantable.includes(role)
                          return (
                            <button
                              key={role.id}
                              type="button"
                              aria-pressed={on}
                              disabled={lockedRoles || (!allowed && !on)}
                              title={allowed ? role.description ?? role.name : 'Tiene permisos que tú no tienes'}
                              onClick={() => toggleRole(account.id, role.id)}
                              className={clsx(
                                'rounded-lg border px-2 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                                on ? 'border-brasa-500/60 bg-brasa-500/15 text-brasa-100' : 'border-neutral-800 text-neutral-400 hover:border-neutral-600',
                              )}
                            >
                              {role.name}
                            </button>
                          )
                        })}
                      </div>
                      {a.roleIds.length > 1 && (
                        <FormField label="Entra como">
                          {(a11y) => (
                            <Select
                              {...a11y}
                              value={a.defaultRoleId}
                              disabled={lockedRoles}
                              onChange={(e) => setAssignments((prev) => new Map(prev).set(account.id, { ...a, defaultRoleId: e.target.value }))}
                            >
                              {a.roleIds.map((id) => (
                                <option key={id} value={id}>
                                  {roles.find((r) => r.id === id)?.name ?? id}
                                </option>
                              ))}
                            </Select>
                          )}
                        </FormField>
                      )}
                      {a.roleIds.length === 0 && <p className="text-xs text-red-400">Elige al menos un rol.</p>}
                      <EffectivePermissions roles={roles} roleIds={a.roleIds} catalog={catalog} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {missingAccess && <p className="text-xs text-amber-300">Asígnale al menos una cuenta.</p>}
        </section>

        {user && pending && (
          <section className="space-y-2 rounded-xl border border-neutral-800/60 p-3">
            <p className="text-sm text-neutral-200">
              Pendiente de activación{user.activationExpiresAt ? ` · el enlace vence el ${formatDate(user.activationExpiresAt)}` : ' · sin enlace vigente'}.
            </p>
            <Button variant="secondary" size="sm" icon={Link2} loading={resend.isPending} onClick={() => resend.mutate()}>
              Generar enlace nuevo
            </Button>
          </section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-800/60 pt-4">
          <div className="flex flex-wrap gap-1">
            {user && !lockedStatus && access.manageOrg && !pending && (
              <Button variant="link" size="sm" icon={Power} onClick={() => setConfirm('toggle')}>
                {user.status === 'active' ? 'Desactivar' : 'Activar'}
              </Button>
            )}
            {user && !lockedStatus && (
              <Button variant="link" size="sm" icon={UserMinus} className="!text-neutral-400 hover:!text-red-400" onClick={() => setConfirm('remove')}>
                {access.manageOrg || pending ? 'Quitar de la organización' : 'Quitar de mis cuentas'}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending} disabled={invalid || lockedRoles}>
              {user ? 'Guardar cambios' : 'Crear usuario'}
            </Button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && statusChange.mutate(confirm)}
        pending={statusChange.isPending}
        danger={confirm === 'remove' || user?.status === 'active'}
        title={confirm === 'remove' ? 'Quitar usuario' : user?.status === 'active' ? 'Desactivar usuario' : 'Activar usuario'}
        confirmLabel={confirm === 'remove' ? 'Sí, quitar' : user?.status === 'active' ? 'Sí, desactivar' : 'Sí, activar'}
        description={
          confirm === 'remove' ? (
            <p>{user?.fullName} deja de tener acceso y sale de las cuentas. Su historial (pedidos, movimientos) se conserva.</p>
          ) : user?.status === 'active' ? (
            <p>{user?.fullName} pierde el acceso a todas las cuentas de la organización de inmediato. Puedes volver a activarlo cuando quieras.</p>
          ) : (
            <p>{user?.fullName} vuelve a entrar a sus cuentas con los roles que tenía.</p>
          )
        }
      />
    </Drawer>
  )
}

function StatusBadge({ user }: { user: OrgUser }) {
  if (user.status === 'pending') return <Badge size="sm" tone="warning" dot>Pendiente</Badge>
  if (user.status === 'disabled') return <Badge size="sm" tone="danger" dot>Desactivado</Badge>
  return <Badge size="sm" tone="success" dot>Activo</Badge>
}

/** Lo que puede llegar a hacer con sus roles en esta Cuenta (unión; rige uno a la vez). */
function EffectivePermissions({ roles, roleIds, catalog }: { roles: OrgRole[]; roleIds: string[]; catalog: PermissionDef[] }) {
  const [open, setOpen] = useState(false)
  const keys = maxPermissions(roles, { roleIds })
  const groups = groupCatalog(catalog.filter((p) => keys.has(p.key)))
  if (roleIds.length === 0) return null
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-200">
        <ChevronDown size={13} className={clsx('transition-transform', open && 'rotate-180')} aria-hidden />
        Permisos efectivos ({keys.size}){roleIds.length > 1 ? ' — rige el rol activo; este es el máximo' : ''}
      </button>
      {open && (
        <dl className="mt-2 grid gap-x-3 gap-y-1 text-xs sm:grid-cols-[9rem_1fr]">
          {groups.map((g) => (
            <div key={g.module} className="contents">
              <dt className="text-neutral-500">{g.label}</dt>
              <dd className="text-neutral-300">{g.permissions.map(actionLabel).join(' · ')}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
