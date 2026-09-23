import type { Role } from '@/shared/rbac/roles'

/** Cada cosa que se puede hacer sobre un pedido del tablero de Cocina. */
export type FlowAction = 'create' | 'confirm' | 'advance' | 'revert' | 'priority' | 'cancel' | 'dispatch' | 'deliver'

/**
 * Espejo de los chequeos de rol de cada RPC (verificado contra la base el
 * 2026-09-22). Es solo UX — evitar que alguien arrastre un pedido y reciba
 * "No autorizado" — la autoridad real sigue siendo `dk_current_role()` dentro
 * de cada función. Si cambia un RPC, hay que cambiar esto.
 *
 *   create   → insert en dk_orders (RLS) ADMIN, MANAGER, CASHIER
 *   confirm  → dk_confirm_order         ADMIN, MANAGER, CASHIER
 *   advance  → dk_advance_kitchen_item  ADMIN, MANAGER, KITCHEN
 *   revert   → dk_revert_kitchen_item   ADMIN, MANAGER, KITCHEN
 *   priority → dk_set_ticket_priority   ADMIN, MANAGER, KITCHEN
 *   cancel   → dk_cancel_order          ADMIN, MANAGER, CASHIER, KITCHEN
 *   dispatch → dk_dispatch_order        ADMIN, MANAGER, CASHIER
 *   deliver  → dk_mark_delivered        ADMIN, MANAGER, CASHIER, DELIVERY (solo sus propios pedidos; eso lo valida la base)
 */
const ACTION_ROLES: Record<FlowAction, readonly Role[]> = {
  create: ['ADMIN', 'MANAGER', 'CASHIER'],
  confirm: ['ADMIN', 'MANAGER', 'CASHIER'],
  advance: ['ADMIN', 'MANAGER', 'KITCHEN'],
  revert: ['ADMIN', 'MANAGER', 'KITCHEN'],
  priority: ['ADMIN', 'MANAGER', 'KITCHEN'],
  cancel: ['ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN'],
  dispatch: ['ADMIN', 'MANAGER', 'CASHIER'],
  deliver: ['ADMIN', 'MANAGER', 'CASHIER', 'DELIVERY'],
}

export function canPerform(role: Role | null | undefined, action: FlowAction): boolean {
  if (!role) return false
  return ACTION_ROLES[action].includes(role)
}

/** Por qué un botón o zona de drop aparece deshabilitado — para el tooltip. */
export const ACTION_DENIED_REASON: Record<FlowAction, string> = {
  create: 'Solo caja o administración crea pedidos',
  confirm: 'Solo caja o administración confirma pedidos',
  advance: 'Solo cocina o administración mueve la preparación',
  revert: 'Solo cocina o administración mueve la preparación',
  priority: 'Solo cocina o administración cambia la prioridad',
  cancel: 'Tu rol no puede cancelar pedidos',
  dispatch: 'Solo caja o administración despacha pedidos',
  deliver: 'Tu rol no puede marcar entregas',
}
