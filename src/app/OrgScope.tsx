import { setActiveKitchenId, setActiveRoleId } from '@/shared/kitchen/activeKitchen'
import { kitchensOf, useMyContext } from '@/shared/kitchen/activeKitchenContext'
import { canOpenAdminCenter, OrgAdminCtx, orgPath, type OrgAdminContext } from '@/shared/org/orgContext'
import { ErrorState } from '@/shared/ui/ErrorState'
import { useEffect, useMemo } from 'react'
import { hostRedirectFor } from '@/shared/tenant/navigation'
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom'
import { FullScreenLoading } from './FullScreenLoading'

/**
 * Marco del centro de administración (/o/:orgSlug/…, ADR 0012). Resuelve la
 * organización entre las MÍAS (dk_my_context) y exige algún permiso de
 * administración; un slug ajeno lleva a "Tus cuentas" (el slug nunca
 * autoriza). Aquí no hay Cuenta activa: se limpian Cuenta y rol ANTES de
 * montar las pantallas, para que ninguna petición salga con los encabezados
 * de la Cuenta anterior (y la caché no mezcle contextos).
 */
export function OrgScope() {
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const { data: ctx, isLoading, isError, error, refetch } = useMyContext()
  const organization = ctx?.organizations.find((o) => o.slug === orgSlug) ?? null
  const allowed = canOpenAdminCenter(organization)
  // ADR 0021: the administration center of an organization lives on its subdomain.
  const { pathname, search } = useLocation()
  const crossHost = organization ? hostRedirectFor(organization.slug, `${pathname}${search}`) : null
  useEffect(() => {
    if (crossHost) window.location.replace(crossHost)
  }, [crossHost])

  // Durante el render (como KitchenScope): los hijos piden datos antes que los efectos del padre.
  setActiveKitchenId(null)
  setActiveRoleId(null)

  const value = useMemo<OrgAdminContext | null>(() => {
    if (!ctx || !organization) return null
    const permissions = new Set(organization.permissions)
    return {
      organization,
      can: (permission) => permissions.has(permission),
      path: (to) => orgPath(organization.slug, to),
      accounts: kitchensOf(ctx).filter((k) => k.organizationId === organization.id),
      isPlatformAdmin: ctx.profile.isPlatformAdmin,
    }
  }, [ctx, organization])

  useEffect(() => {
    if (!organization) return
    document.title = `Administración · ${organization.name} · Quanela`
    return () => {
      document.title = 'Quanela'
    }
  }, [organization])

  if (isLoading || crossHost) return <FullScreenLoading />
  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-6">
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    )
  }
  if (!value || !allowed) return <Navigate to="/cuentas" replace />

  return (
    <OrgAdminCtx value={value}>
      <Outlet />
    </OrgAdminCtx>
  )
}
