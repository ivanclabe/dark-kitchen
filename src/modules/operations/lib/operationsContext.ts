import type { Order } from '@/modules/orders/types'
import { createContext, useContext } from 'react'
import type { OperationsView } from './views'

/**
 * What every view of the Centro de operaciones shares (ADR 0031): the live
 * orders, the search, the order open on top and the dialogs. A view adds
 * only what is its own (Cocina: voice, stalled dishes, time targets).
 */
export interface OperationsContextValue {
  view: OperationsView
  views: OperationsView[]
  /** Changes the view; `params` sets (or clears, with null) filters in the address. */
  setView: (view: OperationsView, params?: Record<string, string | null>) => void
  /** Open orders (Por confirmar → En ruta), urgent and oldest first. */
  live: Order[] | undefined
  isLoading: boolean
  now: number
  search: string
  setSearch: (search: string) => void
  searchOpen: boolean
  setSearchOpen: (open: boolean) => void
  detailOrderId: string | null
  openDetail: (order: Pick<Order, 'id'>) => void
  closeDetail: () => void
  requestConfirm: (order: Order) => void
  requestDispatch: (order: Order) => void
  requestCancel: (order: Order) => void
  openNewOrder: () => void
  openRiders: () => void
  /** Drafts that arrived while the screen was open: they glow until someone opens them. */
  newDraftIds: Set<string>
  acknowledgeDraft: (orderId: string) => void
  soundEnabled: boolean
  toggleSound: () => void
}

export const OperationsContext = createContext<OperationsContextValue | null>(null)

export function useOperations(): OperationsContextValue {
  const ctx = useContext(OperationsContext)
  if (!ctx) throw new Error('useOperations must be used inside the Centro de operaciones')
  return ctx
}
