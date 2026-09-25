import type { AccountPermission, Can } from '@/shared/rbac/roles'

/** Cada cosa que se puede hacer sobre un pedido del tablero de Cocina. */
export type FlowAction = 'create' | 'confirm' | 'advance' | 'revert' | 'priority' | 'cancel' | 'dispatch' | 'deliver'

/**
 * Qué permiso del catálogo exige cada acción — el mismo que verifica la
 * función del servidor correspondiente en la Cuenta activa (ADR 0008).
 * Es UX: evitar que alguien arrastre un pedido y reciba "No autorizado".
 *
 *   create   → insert en dk_orders          orders.create
 *   confirm  → dk_confirm_order              orders.confirm
 *   advance  → dk_advance_kitchen_item       kitchen.prepare
 *   revert   → dk_revert_kitchen_item        kitchen.prepare
 *   priority → dk_set_ticket_priority        kitchen.prioritize
 *   cancel   → dk_cancel_order               orders.cancel
 *   dispatch → dk_dispatch_order             dispatch.assign
 *   deliver  → dk_mark_delivered             dispatch.deliver (el domiciliario, solo sus pedidos: lo valida la base)
 */
const ACTION_PERMISSION: Record<FlowAction, AccountPermission> = {
  create: 'orders.create',
  confirm: 'orders.confirm',
  advance: 'kitchen.prepare',
  revert: 'kitchen.prepare',
  priority: 'kitchen.prioritize',
  cancel: 'orders.cancel',
  dispatch: 'dispatch.assign',
  deliver: 'dispatch.deliver',
}

export function canPerform(can: Can | null | undefined, action: FlowAction): boolean {
  if (!can) return false
  return can(ACTION_PERMISSION[action])
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
