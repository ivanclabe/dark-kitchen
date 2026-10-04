import { readLastKitchenSlug, setActiveKitchenId, setActiveRoleId } from '@/shared/kitchen/activeKitchen'
import { kitchenPath, kitchensOf, useMyContext } from '@/shared/kitchen/activeKitchenContext'
import type { MyContext, MyKitchen } from '@/shared/kitchen/kitchensApi'
import { hostRedirectFor } from '@/shared/tenant/navigation'
import { useTenant } from '@/shared/tenant/tenantContext'
import { useEffect } from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import { FullScreenLoading } from './FullScreenLoading'
import { accountPathForOrgSection } from './legacyOrgRoutes'

/**
 * A qué Cuenta entrar sin que el usuario elija (ADR 0008, sección 8): la
 * última que usó (guardada en su perfil, sirve en cualquier equipo; si no,
 * la de este equipo) mientras siga teniendo acceso, o su única Cuenta
 * activa. Con varias y ninguna recordada, null → "Tus cuentas".
 */
export function defaultKitchen(ctx: MyContext, organizationId?: string | null): MyKitchen | null {
  // On an organization's subdomain, only its accounts (ADR 0021).
  const usable = kitchensOf(ctx).filter((k) => (k.active || k.isPlatformAdmin) && (!organizationId || k.organizationId === organizationId))
  const lastSlug = readLastKitchenSlug()
  return (
    usable.find((k) => k.id === ctx.profile.lastAccountId) ??
    usable.find((k) => k.slug === lastSlug) ??
    (usable.length === 1 ? usable[0] : null)
  )
}

/**
 * "/" con sesión: directo a la Cuenta por defecto o al selector.
 *   - En el subdominio de una organización: su Cuenta de esa organización
 *     (sin Cuentas, "Tus cuentas", donde puede crear la primera).
 *   - En la raíz (quanela.com): al subdominio de la organización de su
 *     Cuenta por defecto (ADR 0021); sin una clara, "Tus cuentas".
 */
export function KitchenEntryRedirect() {
  const { data: ctx, isLoading } = useMyContext()
  const tenant = useTenant()
  const kitchen = ctx ? defaultKitchen(ctx, tenant.mode === 'tenant' ? tenant.organization?.id : null) : null
  const orgCode = kitchen ? ctx?.organizations.find((o) => o.id === kitchen.organizationId)?.tenantCode : null
  const crossHost = kitchen ? hostRedirectFor(orgCode, kitchenPath(kitchen.slug, '/')) : null
  useEffect(() => {
    if (crossHost) window.location.replace(crossHost)
  }, [crossHost])

  if (isLoading || !ctx || crossHost) return <FullScreenLoading />
  if (kitchen) return <Navigate to={kitchenPath(kitchen.slug, '/')} replace />
  return <Navigate to="/cuentas" replace />
}

/**
 * Direcciones anteriores a multi-cocina (/kitchen, /supply/compras/…,
 * /customers/:id…): se llevan a la misma sección dentro de la Cuenta por
 * defecto, conservando la consulta (?pedido=…). Así no se rompe ningún
 * enlace guardado.
 */
export function LegacyKitchenRedirect() {
  const { pathname, search } = useLocation()
  const { data: ctx, isLoading } = useMyContext()
  const tenant = useTenant()
  if (isLoading || !ctx) return <FullScreenLoading />
  // Short paths on a subdomain (/orders, /kitchen…) open in YOUR account of that organization.
  const kitchen = defaultKitchen(ctx, tenant.mode === 'tenant' ? tenant.organization?.id : null)
  if (!kitchen) return <Navigate to="/cuentas" replace />
  return <Navigate to={`${kitchenPath(kitchen.slug, pathname)}${search}`} replace />
}

/**
 * /o/{slug}/… (ADR 0012) ya no existe (ADR 0024): cada dirección va a su
 * equivalente dentro de tu cuenta por defecto de ese negocio; sin una clara,
 * a "Tus cuentas". El slug nunca autoriza: se busca entre las tuyas.
 */
export function LegacyOrgRedirect() {
  const { orgSlug, '*': rest = '' } = useParams<{ orgSlug: string; '*': string }>()
  const { search } = useLocation()
  const { data: ctx, isLoading } = useMyContext()
  if (isLoading || !ctx) return <FullScreenLoading />
  const organization = ctx.organizations.find((o) => o.slug === orgSlug) ?? null
  const kitchen = organization ? defaultKitchen(ctx, organization.id) : null
  const target = accountPathForOrgSection(`${rest}${search}`)
  if (!kitchen || target === null) return <Navigate to="/cuentas" replace />
  return <Navigate to={kitchenPath(kitchen.slug, target)} replace />
}

/** Fuera de una Cuenta (selector, plataforma) ninguna petición debe llevar la anterior ni su rol. */
export function clearActiveKitchen() {
  setActiveKitchenId(null)
  setActiveRoleId(null)
}
