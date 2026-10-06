import { useLocation } from 'react-router-dom'

/** Where the person came from, passed in the navigation state by the link that opened the page. */
export interface BackTarget {
  to: string
  label: string
}

/**
 * «Volver» to the place the person came from (ADR 0030): a link that opens a
 * detail from another screen passes `state={{ from: { to, label } }}`. Without
 * it (a typed address, a reload), the default list. `to` must be an internal
 * path; anything else falls back to the default. The back link is a
 * KitchenLink, which adds the active Cocina prefix (/k/{slug}): it is removed here.
 */
export function useBackTarget(fallback: BackTarget): BackTarget {
  return useCameFrom() ?? fallback
}

/** Where the person came from, or null (a page without a natural «Volver», like Abastecimiento). */
export function useCameFrom(): BackTarget | null {
  const state = useLocation().state as { from?: Partial<BackTarget> } | null
  const from = state?.from
  if (!from?.to || !from.label || !from.to.startsWith('/') || from.to.startsWith('//')) return null
  return { to: withoutKitchen(from.to) || '/', label: from.label }
}

/** /k/{cocina}/orders?x → /orders?x */
function withoutKitchen(path: string): string {
  return path.replace(/^\/k\/[^/?]+/, '')
}

/** The label of the screen a path belongs to, for «Volver a …» (the first segment after the Cocina prefix). */
const SECTION_LABELS: Record<string, string> = {
  dashboard: 'Inicio',
  operations: 'Operación',
  customers: 'Clientes',
  insights: 'Insights',
  'menu-planner': 'Catálogo',
  supply: 'Abastecimiento',
}

/**
 * The current screen as a back target, to pass in `state={{ from }}` on a
 * link that leaves it. The label is the section's, unless one is given.
 */
export function useHere(label?: string): BackTarget {
  const { pathname, search } = useLocation()
  const parts = withoutKitchen(pathname).split('/')
  const segment = parts[1] ?? ''
  const isDetail = parts.length > 2
  // A detail open on top of its list: back to that one (the customer, the order).
  const detail = isDetail ? ({ customers: 'Cliente', operations: 'Pedido' } as Record<string, string>)[segment] : undefined
  return { to: `${pathname}${search}`, label: label ?? detail ?? SECTION_LABELS[segment] ?? 'Volver' }
}
