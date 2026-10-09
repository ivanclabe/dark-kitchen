import { clearAccountChoice, pendingAccountChoice } from '@/shared/kitchen/accountChoice'
import { setActiveKitchenId, setActiveRoleId } from '@/shared/kitchen/activeKitchen'
import { kitchenPath, useMyContext } from '@/shared/kitchen/activeKitchenContext'
import { hostRedirectFor } from '@/shared/tenant/navigation'
import { useTenant } from '@/shared/tenant/tenantContext'
import { useEffect } from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import { FullScreenLoading } from './FullScreenLoading'
import { defaultKitchen, usableKitchens } from './accountEntry'
import { accountPathForOrgSection } from './legacyOrgRoutes'

/**
 * "/" con sesión: directo a la Cuenta por defecto o al selector.
 *   - Recién iniciada la sesión y con varias Cuentas: "Tus cuentas", para
 *     elegir con cuál trabajar (ADR 0043). Al recargar o volver con la sesión
 *     abierta, la de siempre.
 *   - En el subdominio de una organización: su Cuenta de esa organización
 *     (sin Cuentas, "Tus cuentas", donde puede crear la primera).
 *   - En la raíz (quanela.com): al subdominio de la organización de su
 *     Cuenta por defecto (ADR 0021); sin una clara, "Tus cuentas".
 */
export function KitchenEntryRedirect() {
  const { data: ctx, isLoading } = useMyContext()
  const tenant = useTenant()
  const organizationId = tenant.mode === 'tenant' ? tenant.organization?.id : null
  // ADR 0043: just signed in with several accounts → choose. The mark is used once.
  const choose = Boolean(ctx) && pendingAccountChoice() && usableKitchens(ctx!, organizationId).length >= 2
  const kitchen = ctx && !choose ? defaultKitchen(ctx, organizationId) : null
  const orgCode = kitchen ? ctx?.organizations.find((o) => o.id === kitchen.organizationId)?.tenantCode : null
  const crossHost = kitchen ? hostRedirectFor(orgCode, kitchenPath(kitchen.slug, '/')) : null
  useEffect(() => {
    if (crossHost) window.location.replace(crossHost)
  }, [crossHost])
  useEffect(() => {
    if (ctx) clearAccountChoice()
  }, [ctx])

  if (isLoading || !ctx || crossHost) return <FullScreenLoading />
  if (choose) return <Navigate to="/cuentas" replace />
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
