import type { OrgRole, OrgUserAccount } from '../api/organization'

/**
 * Permisos efectivos (ADR 0008, sección 14). En una Cuenta rige UN rol a la
 * vez (el activo); la unión de sus roles es el máximo posible — informativo,
 * para que el administrador vea qué puede llegar a hacer la persona.
 */
export function rolePermissions(roles: OrgRole[], roleIds: readonly string[]): Map<string, string[]> {
  const byRole = new Map<string, string[]>()
  for (const id of roleIds) {
    const role = roles.find((r) => r.id === id)
    if (role) byRole.set(role.id, role.permissions)
  }
  return byRole
}

export function maxPermissions(roles: OrgRole[], account: Pick<OrgUserAccount, 'roleIds'>): Set<string> {
  return new Set([...rolePermissions(roles, account.roleIds).values()].flat())
}

/**
 * ¿Puede quien asigna dar este rol? Debe tener todos sus permisos (la base
 * lo exige igual; esto evita ofrecer opciones que va a rechazar). El Super
 * Admin puede dar cualquiera.
 */
export function canGrantRole(role: Pick<OrgRole, 'permissions'>, granterPermissions: ReadonlySet<string>, granterIsSuperAdmin: boolean): boolean {
  return granterIsSuperAdmin || role.permissions.every((p) => granterPermissions.has(p))
}
