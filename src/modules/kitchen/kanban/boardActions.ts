import type { Can } from '@/shared/rbac/roles'
import { createContext, useContext } from 'react'
import type { KitchenTicket } from '../types'

/**
 * Acciones del tablero que necesitan un diálogo (confirmar, despachar,
 * cancelar) o un panel (detalle del pedido). Viven UNA vez en el tablero en
 * vez de un ConfirmDialog + Drawer por cada tarjeta — así la tarjeta queda
 * simple y los portales no tienen que pelear con los listeners de arrastre.
 */
export interface BoardActions {
  /** Permisos del usuario en la Cocina activa. */
  can: Can
  density: 'normal' | 'grande'
  openDetail: (ticket: KitchenTicket) => void
  requestConfirm: (ticket: KitchenTicket) => void
  requestDispatch: (ticket: KitchenTicket) => void
  requestCancel: (ticket: KitchenTicket) => void
}

export const BoardActionsContext = createContext<BoardActions | null>(null)

export function useBoardActions(): BoardActions {
  const ctx = useContext(BoardActionsContext)
  if (!ctx) throw new Error('useBoardActions debe usarse dentro del tablero de Cocina')
  return ctx
}
