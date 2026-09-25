/**
 * Cuenta activa de esta pestaña (ADR 0007/0008). Vive fuera de React a propósito:
 * el cliente de Supabase la lee en cada petición (encabezado
 * x-dk-kitchen-id) y la caché de TanStack Query la usa para separar datos
 * por Cocina. La fija `KitchenScope` a partir del slug de la URL, antes de
 * que se monte cualquier pantalla de esa Cocina.
 *
 * La base valida el encabezado contra la membresía: esto solo ACOTA lo que
 * se ve, nunca amplía el acceso.
 */
let activeKitchenId: string | null = null

export function getActiveKitchenId(): string | null {
  return activeKitchenId
}

export function setActiveKitchenId(id: string | null): void {
  activeKitchenId = id
}

export const KITCHEN_HEADER = 'x-dk-kitchen-id'

/** Última Cocina usada en este equipo: la próxima vez se entra directo a ella. */
const LAST_KITCHEN_KEY = 'dk-last-kitchen'

export function readLastKitchenSlug(): string | null {
  try {
    return localStorage.getItem(LAST_KITCHEN_KEY)
  } catch {
    return null
  }
}

export function writeLastKitchenSlug(slug: string): void {
  try {
    localStorage.setItem(LAST_KITCHEN_KEY, slug)
  } catch {
    // No crítico.
  }
}

/**
 * Rol activo de esta pestaña (ADR 0008, 3.4): viaja en `x-dk-role-id` y la
 * base lo valida contra los roles asignados en la Cuenta activa. Un valor
 * inventado se ignora (la base usa el predeterminado): esto nunca amplía el
 * acceso, solo elige con cuál de sus roles trabaja la persona.
 */
let activeRoleId: string | null = null

export function getActiveRoleId(): string | null {
  return activeRoleId
}

export function setActiveRoleId(id: string | null): void {
  activeRoleId = id
}

export const ROLE_HEADER = 'x-dk-role-id'

/** Último rol activo usado en cada Cuenta, para volver con él. */
const roleStorageKey = (accountId: string) => `dk-active-role:${accountId}`

export function readStoredRole(accountId: string): string | null {
  try {
    return localStorage.getItem(roleStorageKey(accountId))
  } catch {
    return null
  }
}

export function writeStoredRole(accountId: string, roleId: string): void {
  try {
    localStorage.setItem(roleStorageKey(accountId), roleId)
  } catch {
    // No crítico.
  }
}
