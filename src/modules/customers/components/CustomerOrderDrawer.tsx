import { BoardActionsContext, type BoardActions } from '@/modules/orders/board/boardActions'
import { OrderDetailDrawer } from '@/modules/orders/components/OrderDetailDrawer'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { useMemo } from 'react'

const NO_FLOW_ACTIONS = new Set<never>()
const noop = () => {}

/**
 * The order detail opened from a customer (ADR 0028), over the customer page.
 * OrderDetailDrawer lives inside an order board (BoardActionsContext); here it
 * gets a board that offers no flow actions (confirm, dispatch, cancel stay in
 * Pedidos), so it is the order's detail without leaving the customer.
 */
export function CustomerOrderDrawer({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const { can } = useActiveKitchen()
  const board = useMemo<BoardActions>(
    () => ({ can, density: 'normal', scope: NO_FLOW_ACTIONS, openDetail: noop, requestConfirm: noop, requestDispatch: noop, requestCancel: noop }),
    [can],
  )
  return (
    <BoardActionsContext.Provider value={board}>
      <OrderDetailDrawer orderId={orderId} onClose={onClose} />
    </BoardActionsContext.Provider>
  )
}
