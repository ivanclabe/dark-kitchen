import { readLastKitchenSlug } from '@/shared/kitchen/activeKitchen'
import { kitchensOf } from '@/shared/kitchen/activeKitchenContext'
import type { MyContext, MyKitchen } from '@/shared/kitchen/kitchensApi'

/**
 * A qué Cuenta entrar sin que el usuario elija (ADR 0008, sección 8): la
 * última que usó (guardada en su perfil, sirve en cualquier equipo; si no,
 * la de este equipo) mientras siga teniendo acceso, o su única Cuenta
 * activa. Con varias y ninguna recordada, null → "Tus cuentas".
 */
export function defaultKitchen(ctx: MyContext, organizationId?: string | null): MyKitchen | null {
  const usable = usableKitchens(ctx, organizationId)
  const lastSlug = readLastKitchenSlug()
  return (
    usable.find((k) => k.id === ctx.profile.lastAccountId) ??
    usable.find((k) => k.slug === lastSlug) ??
    (usable.length === 1 ? usable[0] : null)
  )
}

/** The accounts one can enter: active ones (any, for the platform); on an organization's subdomain, only its own (ADR 0021). */
export function usableKitchens(ctx: MyContext, organizationId?: string | null): MyKitchen[] {
  return kitchensOf(ctx).filter((k) => (k.active || k.isPlatformAdmin) && (!organizationId || k.organizationId === organizationId))
}

/** The account used last (profile first, then this device), to put it first and mark it in «Tus cuentas» (ADR 0043). */
export function lastUsedKitchenId(ctx: MyContext): string | null {
  const kitchens = kitchensOf(ctx)
  const lastSlug = readLastKitchenSlug()
  return (kitchens.find((k) => k.id === ctx.profile.lastAccountId) ?? kitchens.find((k) => k.slug === lastSlug))?.id ?? null
}
