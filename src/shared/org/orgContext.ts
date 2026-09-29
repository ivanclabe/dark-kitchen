import type { MyKitchen, MyOrganization } from '@/shared/kitchen/kitchensApi'
import { createContext, use } from 'react'

/**
 * Contexto del centro de administración de una organización (ADR 0012):
 * organización activa, sus permisos de organización y sus Cuentas. Aquí NO hay
 * Cuenta activa: las consultas llevan el id de la organización y la base
 * vuelve a validar el permiso en cada RPC (dk_has_org_permission).
 */
export interface OrgAdminContext {
  organization: MyOrganization
  /** ¿Tiene este permiso de organización (users.view, billing.view…)? */
  can: (permission: string) => boolean
  /** Ruta dentro del centro: path('/equipos') → '/o/{org}/equipos'. */
  path: (to: string) => string
  /** Cuentas de la organización a las que tiene acceso (para "Ir a una cuenta"). */
  accounts: MyKitchen[]
  isPlatformAdmin: boolean
}

export const OrgAdminCtx = createContext<OrgAdminContext | null>(null)

export function useOrgAdmin(): OrgAdminContext {
  const ctx = use(OrgAdminCtx)
  if (!ctx) throw new Error('useOrgAdmin debe usarse dentro del centro de administración (/o/:org)')
  return ctx
}

export function orgPath(slug: string, to = '/'): string {
  if (!to || to === '/') return `/o/${slug}`
  return `/o/${slug}${to.startsWith('/') ? to : `/${to}`}`
}

/** Permisos de organización que abren el centro (organization.view solo, no). */
export const ADMIN_CENTER_PERMISSIONS = [
  'organization.manage',
  'accounts.view',
  'users.view',
  'roles.manage',
  'features.manage',
  'master_menus.manage',
  'observability.view',
  'billing.view',
] as const

/** ¿Puede entrar al centro de administración de esta organización? */
export function canOpenAdminCenter(organization: Pick<MyOrganization, 'permissions'> | null | undefined): boolean {
  return Boolean(organization && ADMIN_CENTER_PERMISSIONS.some((p) => organization.permissions.includes(p)))
}
