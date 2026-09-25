import type { PermissionDef } from '../api/organization'

/** Nombre de cada módulo del catálogo (dk_permissions.module). */
export const MODULE_LABEL: Record<string, string> = {
  dashboard: 'Dashboard',
  kitchen: 'Cocina (tablero)',
  orders: 'Pedidos',
  dispatch: 'Despacho',
  customers: 'Clientes',
  receivables: 'Cartera',
  menus: 'Menús',
  products: 'Platos',
  recipes: 'Recetas',
  inventory: 'Inventario',
  purchasing: 'Compras',
  suppliers: 'Proveedores',
  invoices: 'Facturas',
  reports: 'Reportes',
  ai: 'IA',
  settings: 'Configuración',
  team: 'Equipo de la cuenta',
  audit: 'Auditoría',
}

/** Texto corto de cada acción, para las casillas de la matriz (el detalle va en la descripción). */
export const ACTION_LABEL: Record<string, string> = {
  view: 'Ver',
  create: 'Crear',
  edit: 'Editar',
  delete: 'Eliminar',
  manage: 'Administrar',
  confirm: 'Confirmar',
  cancel: 'Cancelar',
  prepare: 'Preparar',
  prioritize: 'Priorizar',
  assign: 'Despachar',
  deliver: 'Entregar',
  riders: 'Domiciliarios',
  collect: 'Registrar pagos',
  adjust: 'Mermas y ajustes',
  upload: 'Subir',
  profitability: 'Rentabilidad',
}

export interface ModuleGroup {
  module: string
  label: string
  permissions: PermissionDef[]
}

/**
 * Agrupa el catálogo por módulo respetando el orden del catálogo
 * (sort_order): los módulos aparecen en el orden de su primer permiso y,
 * dentro de cada uno, las acciones de "ver" a las más delicadas.
 */
export function groupCatalog(catalog: PermissionDef[]): ModuleGroup[] {
  const sorted = [...catalog].sort((a, b) => a.sortOrder - b.sortOrder)
  const groups = new Map<string, ModuleGroup>()
  for (const p of sorted) {
    const group = groups.get(p.module) ?? { module: p.module, label: MODULE_LABEL[p.module] ?? p.module, permissions: [] }
    group.permissions.push(p)
    groups.set(p.module, group)
  }
  return [...groups.values()]
}

export function actionLabel(p: PermissionDef): string {
  return ACTION_LABEL[p.action] ?? p.label
}
