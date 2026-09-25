import { readLastKitchenSlug, setActiveKitchenId, setActiveRoleId } from '@/shared/kitchen/activeKitchen'
import { kitchenPath, kitchensOf, useMyContext } from '@/shared/kitchen/activeKitchenContext'
import type { MyContext, MyKitchen } from '@/shared/kitchen/kitchensApi'
import { Navigate, useLocation } from 'react-router-dom'
import { FullScreenLoading } from './FullScreenLoading'

/**
 * A qué Cuenta entrar sin que el usuario elija (ADR 0008, sección 8): la
 * última que usó (guardada en su perfil, sirve en cualquier equipo; si no,
 * la de este equipo) mientras siga teniendo acceso, o su única Cuenta
 * activa. Con varias y ninguna recordada, null → "Tus cuentas".
 */
export function defaultKitchen(ctx: MyContext): MyKitchen | null {
  const usable = kitchensOf(ctx).filter((k) => k.active || k.isPlatformAdmin)
  const lastSlug = readLastKitchenSlug()
  return (
    usable.find((k) => k.id === ctx.profile.lastAccountId) ??
    usable.find((k) => k.slug === lastSlug) ??
    (usable.length === 1 ? usable[0] : null)
  )
}

/** "/" con sesión: directo a la Cuenta por defecto o al selector. */
export function KitchenEntryRedirect() {
  const { data: ctx, isLoading } = useMyContext()
  if (isLoading || !ctx) return <FullScreenLoading />
  const kitchen = defaultKitchen(ctx)
  return <Navigate to={kitchen ? kitchenPath(kitchen.slug, '/') : '/cuentas'} replace />
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
  if (isLoading || !ctx) return <FullScreenLoading />
  const kitchen = defaultKitchen(ctx)
  if (!kitchen) return <Navigate to="/cuentas" replace />
  return <Navigate to={`${kitchenPath(kitchen.slug, pathname)}${search}`} replace />
}

/** Fuera de una Cuenta (selector, plataforma) ninguna petición debe llevar la anterior ni su rol. */
export function clearActiveKitchen() {
  setActiveKitchenId(null)
  setActiveRoleId(null)
}
