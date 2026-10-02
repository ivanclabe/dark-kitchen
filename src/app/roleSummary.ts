/** Resumen corto de lo que permite un rol, para elegir el rol activo con criterio. */
export function roleSummary(permissions: string[]): string {
  const labels: [string, string][] = [
    ['kitchen.view', 'tablero'],
    ['orders.view', 'pedidos'],
    ['dispatch.view', 'despacho'],
    ['inventory.view', 'inventario'],
    ['purchasing.view', 'compras'],
    ['customers.view', 'clientes'],
    ['reports.view', 'reportes'],
    ['team.manage', 'equipo'],
  ]
  const parts = labels.filter(([key]) => permissions.includes(key)).map(([, label]) => label)
  return parts.length > 5 ? 'acceso amplio' : parts.join(', ') || 'acceso limitado'
}
