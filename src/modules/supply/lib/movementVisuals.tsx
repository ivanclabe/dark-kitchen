import { ArrowDownCircle, ArrowUpCircle, ShoppingBag, SlidersHorizontal, Trash2, Undo2, type LucideIcon } from 'lucide-react'
import type { InventoryMovement, WasteReason } from '../types'

export type MovementType = InventoryMovement['movementType']

/** Ícono + color por tipo de movimiento — antes vivía dentro de MovementsPage, ahora lo comparten la línea de tiempo del insumo y la global. */
export const MOVEMENT: Record<MovementType, { label: string; icon: LucideIcon; color: string }> = {
  COMPRA: { label: 'Compra', icon: ShoppingBag, color: 'text-emerald-400' },
  MERMA: { label: 'Merma', icon: Trash2, color: 'text-red-400' },
  AJUSTE: { label: 'Ajuste', icon: SlidersHorizontal, color: 'text-neutral-300' },
  CONSUMO: { label: 'Consumo', icon: ArrowDownCircle, color: 'text-brasa-400' },
  DEVOLUCION: { label: 'Devolución', icon: Undo2, color: 'text-emerald-400' },
}

export function movementMeta(type: MovementType) {
  return MOVEMENT[type] ?? { label: type, icon: ArrowUpCircle, color: 'text-neutral-300' }
}

export const WASTE_REASONS: { value: WasteReason; label: string }[] = [
  { value: 'VENCIMIENTO', label: 'Vencimiento' },
  { value: 'DANO', label: 'Daño' },
  { value: 'ERROR_PREPARACION', label: 'Error de preparación' },
  { value: 'OTRO', label: 'Otro' },
]

export const WASTE_REASON_LABEL = Object.fromEntries(WASTE_REASONS.map((r) => [r.value, r.label])) as Record<WasteReason, string>
