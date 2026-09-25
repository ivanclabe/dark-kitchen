import { featureLookup, type FeatureKey, type FeatureState } from '@/shared/features/features'
import { canAccessModule, type Can, type ModuleKey } from '@/shared/rbac/roles'
import { useQuery } from '@tanstack/react-query'
import { createContext, use, useCallback } from 'react'
import { useAuth } from '@/shared/hooks/useAuth'
import { readStoredRole } from './activeKitchen'
import { fetchMyContext, toKitchenView, type AccountRole, type MyContext, type MyKitchen, type MyOrganization } from './kitchensApi'

/** Raíz de la consulta global del contexto del usuario (no depende de la Cuenta activa). */
export const MY_KITCHENS_KEY = ['my-kitchens'] as const

/** Organizaciones, Cuentas y roles del usuario (dk_my_context). */
export function useMyContext() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: [...MY_KITCHENS_KEY, 'context', profile?.id],
    queryFn: fetchMyContext,
    enabled: Boolean(profile?.active),
    staleTime: 60_000,
  })
}

/** Las Cuentas del usuario, cada una con el rol activo que usaría al entrar. */
export function kitchensOf(ctx: MyContext): MyKitchen[] {
  return ctx.accounts.map((a) => toKitchenView(ctx, a, readStoredRole(a.id)))
}

export function useMyKitchens() {
  const query = useMyContext()
  return { ...query, data: query.data ? kitchensOf(query.data) : undefined }
}

/** Consulta de las funciones de la Cuenta activa (dk_my_features); la caché se separa por Cuenta y rol. */
export const FEATURES_KEY = ['features'] as const

/**
 * Contexto activo de la app (ADR 0008 13.1 y ADR 0009 3.4): organización,
 * Cuenta, roles en ambos niveles, rol activo, permisos efectivos y funciones.
 * Toda la interfaz decide con esto; la base vuelve a validar cada petición.
 */
export interface ActiveKitchen {
  kitchen: MyKitchen
  /** Organización de la Cuenta activa. */
  organization: MyOrganization | null
  /** Rol en la organización: SUPER_ADMIN (creador o plataforma) o Miembro. */
  organizationRole: 'SUPER_ADMIN' | 'MIEMBRO'
  /** Roles que tiene en ESTA Cuenta (incluye SUPER_ADMIN si aplica). */
  accountRoles: AccountRole[]
  /** ¿Tiene este permiso del catálogo (p. ej. 'orders.confirm') con su rol activo en esta Cuenta? */
  can: Can
  /** Funciones de la Cuenta activa con su estado (organización ∧ Cuenta ∧ permiso). */
  features: readonly FeatureState[]
  feature: (key: FeatureKey) => FeatureState | null
  /** ¿Se puede usar esta función en la Cuenta activa con el rol activo? */
  canUseFeature: (key: FeatureKey) => boolean
  /** Ruta dentro de la Cuenta activa: path('/kitchen') → '/k/{slug}/kitchen'. */
  path: (to: string) => string
  /** Cambia el rol activo (solo entre los asignados; la base lo valida). */
  setActiveRole: (roleId: string) => void
}

export const ActiveKitchenContext = createContext<ActiveKitchen | null>(null)

export function useActiveKitchen(): ActiveKitchen {
  const ctx = use(ActiveKitchenContext)
  if (!ctx) throw new Error('useActiveKitchen debe usarse dentro de una Cuenta (/k/:slug)')
  return ctx
}

/** Contexto completo de la app dentro de una Cuenta (ADR 0008, 13.1). */
export const useAppContext = useActiveKitchen

export function kitchenPath(slug: string, to: string): string {
  if (!to || to === '/') return `/k/${slug}`
  return `/k/${slug}${to.startsWith('/') ? to : `/${to}`}`
}

export function buildActiveKitchen(
  kitchen: MyKitchen,
  extras: { organization?: MyOrganization | null; setActiveRole?: (roleId: string) => void; features?: readonly FeatureState[] } = {},
): ActiveKitchen {
  const can: Can = (permission) => kitchen.permissions.has(permission)
  const organization = extras.organization ?? null
  return {
    kitchen,
    organization,
    organizationRole: organization?.isSuperAdmin || kitchen.superAdmin ? 'SUPER_ADMIN' : 'MIEMBRO',
    accountRoles: kitchen.roleOptions,
    can,
    ...featureLookup(extras.features),
    path: (to) => kitchenPath(kitchen.slug, to),
    setActiveRole: extras.setActiveRole ?? (() => {}),
  }
}

/** Atajo: ¿puede entrar a este módulo de la app en la Cuenta activa? */
export function useCanAccessModule() {
  const { can } = useActiveKitchen()
  return useCallback((module: ModuleKey) => canAccessModule(can, module), [can])
}
