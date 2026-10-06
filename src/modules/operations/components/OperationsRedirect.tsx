import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Navigate, useLocation, useParams } from 'react-router-dom'

/**
 * Pedidos and Cocina became the Centro de operaciones (ADR 0031). Their old
 * addresses keep working and keep what they carried: the view, the filters
 * and the order open (/orders/:id, /kitchen?order=id or the older ?pedido=id).
 */
export function OperationsRedirect({ view }: { view?: 'kitchen' | 'dispatch' }) {
  const { path } = useActiveKitchen()
  const { orderId } = useParams<{ orderId?: string }>()
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  const order = orderId ?? params.get('order') ?? params.get('pedido')
  params.delete('order')
  params.delete('pedido')
  if (view) params.set('view', view)
  const query = params.toString()
  return <Navigate to={`${path(order ? `/operations/${order}` : '/operations')}${query ? `?${query}` : ''}`} replace />
}
