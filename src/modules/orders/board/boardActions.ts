import type { Can } from '@/shared/rbac/roles'
import { createContext, useContext } from 'react'
import { canPerform, type FlowAction } from '../lib/permissions'
import type { Order } from '../types'

/**
 * Actions of the board that need a dialog (confirm, dispatch, cancel) or a
 * panel (order detail). They live ONCE per board instead of one dialog per
 * card, so the card stays simple and portals do not fight drag listeners.
 *
 * The same board serves Pedidos (every action) and Cocina (ADR 0020: only
 * preparation, priority and cancel). `scope` says which actions this board
 * offers; `allows` adds the role's permission on top.
 */
export interface BoardActions {
  /** Permissions in the active account. */
  can: Can
  density: 'normal' | 'grande'
  scope?: ReadonlySet<FlowAction>
  openDetail: (order: Order) => void
  requestConfirm: (order: Order) => void
  requestDispatch: (order: Order) => void
  requestCancel: (order: Order) => void
}

export const BoardActionsContext = createContext<BoardActions | null>(null)

export function useBoardActions(): BoardActions {
  const ctx = useContext(BoardActionsContext)
  if (!ctx) throw new Error('useBoardActions must be used inside an order board')
  return ctx
}

/** Does this board offer the action at all (regardless of the role)? */
export function inScope(board: Pick<BoardActions, 'scope'>, action: FlowAction): boolean {
  return !board.scope || board.scope.has(action)
}

/** Offered here AND allowed for the role. */
export function allows(board: Pick<BoardActions, 'scope' | 'can'>, action: FlowAction): boolean {
  return inScope(board, action) && canPerform(board.can, action)
}

/** Cocina's board: the kitchen stretch only (no confirming or dispatching from the line). */
export const KITCHEN_SCOPE: ReadonlySet<FlowAction> = new Set<FlowAction>(['advance', 'revert', 'priority', 'cancel'])
