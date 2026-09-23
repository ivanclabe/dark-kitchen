// Abastecimiento = insumos + movimientos de inventario + compras + proveedores.
// Los tres archivos vienen de los módulos inventory/purchases/suppliers que
// este macromódulo reemplaza; se mantienen separados por dominio y se
// reexportan acá para poder importar todo desde '@/modules/supply/types'.
export * from './inventory'
export * from './purchases'
export * from './suppliers'
