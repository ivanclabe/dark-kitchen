import { use } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { ActiveKitchenContext, kitchenPath } from './activeKitchenContext'

/**
 * <Link> que ubica las rutas absolutas de la app dentro de la Cocina activa:
 * to="/kitchen" → /k/{cocina}/kitchen. Fuera de una Cocina se comporta
 * como un Link normal.
 */
export function KitchenLink({ to, ...props }: LinkProps) {
  const active = use(ActiveKitchenContext)
  const resolved = active && typeof to === 'string' && to.startsWith('/') ? kitchenPath(active.kitchen.slug, to) : to
  return <Link to={resolved} {...props} />
}
