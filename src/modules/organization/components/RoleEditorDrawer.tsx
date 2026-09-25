import { Button } from '@/shared/ui/Button'
import { Drawer } from '@/shared/ui/Drawer'
import { FormActions, FormField, Input, Select } from '@/shared/ui/FormField'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { useMemo, useState, type FormEvent } from 'react'
import { normalizeRoleName } from '@/shared/rbac/roles'
import { saveRole, type OrgRole, type PermissionDef } from '../api/organization'
import { orgKey } from '../hooks/useOrganization'
import { actionLabel, groupCatalog } from '../lib/permissionCatalog'

/**
 * Crear, editar o duplicar un rol propio de la organización con su matriz de
 * permisos (catálogo central, ADR 0008). Las plantillas del sistema se ven en
 * solo lectura. Guardar reemplaza la matriz completa en una transacción. Un
 * rol propio sirve en todas las Cuentas de la organización.
 */
export function RoleEditorDrawer({
  role,
  draft,
  roles,
  catalog,
  organizationId,
  canManage,
  users,
  onClose,
}: {
  role: OrgRole | null
  /** Valores iniciales de un rol nuevo (p. ej. al duplicar). */
  draft?: { name: string; permissions: string[] }
  roles: OrgRole[]
  catalog: PermissionDef[]
  organizationId: string
  canManage: boolean
  /** Quién tiene este rol y en qué Cuentas. */
  users?: { name: string; accounts: string[] }[]
  onClose: () => void
}) {
  const readOnly = !canManage || (role?.isSystem ?? false)
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: saveRole,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKey(organizationId) }),
  })
  const { show } = useToast()
  const [name, setName] = useState(role?.name ?? draft?.name ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [selected, setSelected] = useState<Set<string>>(new Set(role?.permissions ?? draft?.permissions ?? []))
  const groups = useMemo(() => groupCatalog(catalog), [catalog])

  function toggle(key: string) {
    if (readOnly) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleGroup(keys: string[], on: boolean) {
    if (readOnly) return
    setSelected((prev) => {
      const next = new Set(prev)
      for (const key of keys) {
        if (on) next.add(key)
        else next.delete(key)
      }
      return next
    })
  }

  function copyFrom(roleId: string) {
    const source = roles.find((r) => r.id === roleId)
    if (source) setSelected(new Set(source.permissions))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      await save.mutateAsync({ id: role?.id ?? null, name: normalizeRoleName(name), description: description.trim(), permissions: [...selected], organizationId })
      show(role ? 'Rol actualizado.' : 'Rol creado.')
      onClose()
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo guardar el rol'), 'error')
    }
  }

  return (
    <Drawer open onClose={onClose} title={readOnly && role ? role.name : role ? `Editar ${role.name}` : 'Nuevo rol'} subtitle={role?.isSystem ? 'Plantilla del sistema: igual en toda la plataforma, no se edita (puedes duplicarla)' : readOnly ? 'Rol propio de la organización' : 'Rol propio de la organización: sirve en todas sus cuentas'}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {!readOnly && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Nombre" required>
              {(a11y) => (
                <Input
                  {...a11y}
                  value={name}
                  onChange={(e) => setName(normalizeRoleName(e.target.value, { trailing: true }))}
                  onBlur={() => setName((n) => normalizeRoleName(n))}
                  placeholder="MESERO"
                  maxLength={40}
                />
              )}
            </FormField>
            <FormField label="Copiar permisos de">
              {(a11y) => (
                <Select {...a11y} value="" onChange={(e) => copyFrom(e.target.value)}>
                  <option value="">Elegir un rol…</option>
                  {roles
                    .filter((r) => r.id !== role?.id)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </Select>
              )}
            </FormField>
            <FormField label="Descripción" className="sm:col-span-2">
              {(a11y) => <Input {...a11y} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Qué hace este rol" maxLength={120} />}
            </FormField>
          </div>
        )}
        {readOnly && role?.description && <p className={typography.small}>{role.description}</p>}

        <div className="divide-y divide-neutral-800/60 rounded-xl border border-neutral-800/60">
          {groups.map((g) => {
            const allOn = g.permissions.every((p) => selected.has(p.key))
            return (
              <fieldset key={g.module} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[10rem_1fr] sm:items-center">
                <legend className="sr-only">{g.label}</legend>
                <div className="flex items-center justify-between gap-2 sm:block">
                  <span className="text-sm font-medium text-neutral-200">{g.label}</span>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.permissions.map((p) => p.key), !allOn)}
                      className="text-xs text-neutral-500 hover:text-brasa-300 sm:block"
                    >
                      {allOn ? 'Quitar todo' : 'Todo'}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {g.permissions.map((p) => {
                    const on = selected.has(p.key)
                    return (
                      <label
                        key={p.key}
                        title={p.description ?? p.label}
                        className={clsx(
                          'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-colors',
                          on ? 'border-brasa-500/50 bg-brasa-500/10 text-brasa-200' : 'border-neutral-800 text-neutral-400',
                          readOnly ? 'cursor-default' : 'cursor-pointer hover:border-neutral-600',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(p.key)}
                          disabled={readOnly}
                          aria-label={`${g.label}: ${p.label}`}
                          className="size-3.5 accent-[var(--color-brasa-500)] disabled:opacity-60"
                        />
                        {actionLabel(p)}
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            )
          })}
        </div>
        <p className={typography.caption}>Pasa el cursor sobre cada casilla para ver exactamente qué permite. {selected.size} permisos marcados.</p>

        {users && (
          <div className="space-y-2">
            <p className={typography.label}>Usuarios con este rol</p>
            {users.length === 0 ? (
              <p className={typography.caption}>Nadie tiene este rol todavía.</p>
            ) : (
              <ul className="divide-y divide-neutral-800/60 rounded-xl border border-neutral-800/60">
                {users.map((u) => (
                  <li key={u.name + u.accounts.join()} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="truncate text-neutral-200">{u.name}</span>
                    <span className="truncate text-xs text-neutral-500">{u.accounts.join(', ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!readOnly && (
          <FormActions>
            <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending} disabled={name.trim().length < 2}>
              {role ? 'Guardar rol' : 'Crear rol'}
            </Button>
          </FormActions>
        )}
      </form>
    </Drawer>
  )
}
