import type { Can } from '@/shared/rbac/roles'
import { ClipboardPlus, PackagePlus, ShoppingCart, Soup, UserPlus, type LucideIcon } from 'lucide-react'
import { createContext, use } from 'react'

export type CreateKind = 'order' | 'customer' | 'purchase' | 'ingredient' | 'dish'

export interface CreateAction {
  kind: CreateKind
  label: string
  icon: LucideIcon
  keywords: string
}

const CREATE_ACTIONS: (CreateAction & { allowed: (can: Can) => boolean })[] = [
  { kind: 'order', label: 'Nuevo pedido', icon: ClipboardPlus, keywords: 'pedido orden venta', allowed: (can) => can('orders.create') },
  { kind: 'customer', label: 'Nuevo cliente', icon: UserPlus, keywords: 'cliente contacto', allowed: (can) => can('customers.create') },
  { kind: 'purchase', label: 'Registrar compra', icon: ShoppingCart, keywords: 'compra factura proveedor', allowed: (can) => can('purchasing.create') },
  { kind: 'dish', label: 'Nuevo plato', icon: Soup, keywords: 'plato producto menú', allowed: (can) => can('products.create') },
  { kind: 'ingredient', label: 'Nuevo insumo', icon: PackagePlus, keywords: 'insumo ingrediente inventario', allowed: (can) => can('inventory.create') },
]

/** What the active role can create from anywhere (the primary button and Buscar y crear). */
export function createActions(can: Can): CreateAction[] {
  return CREATE_ACTIONS.filter((a) => a.allowed(can))
}

export interface ShellActionsValue {
  openPalette: () => void
  create: (kind: CreateKind) => void
  actions: CreateAction[]
}

export const ShellActionsContext = createContext<ShellActionsValue | null>(null)

export function useShellActions(): ShellActionsValue {
  const ctx = use(ShellActionsContext)
  if (!ctx) throw new Error('useShellActions must be used inside the account shell')
  return ctx
}
