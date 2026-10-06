import { BoardActionsContext, type BoardActions } from '../board/boardActions'
import { OrderDetailDrawer } from './OrderDetailDrawer'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { useMemo } from 'react'

const NO_FLOW_ACTIONS = new Set<never>()
const noop = () => {}

/**
 * An order's detail opened from another screen (Clientes, Insights — ADR 0028,
 * ADR 0030), over that screen: the context is not lost. OrderDetailDrawer
 * lives inside an order board (BoardActionsContext); here it gets a board that
 * offers no flow actions (confirm, dispatch, cancel stay in Pedidos).
 */
export function OrderPeekDrawer({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
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
